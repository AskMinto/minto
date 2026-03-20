"""WhatsApp Tax Bot webhook router.

Mounts at /whatsapp via main.py:
  POST /whatsapp/incoming   — Twilio inbound message webhook
  POST /whatsapp/status     — Twilio delivery status callback
  GET  /whatsapp/health     — Liveness probe

Session persistence pattern:
  1. load_session(phone)  — fetch session_state + message history from Supabase
  2. build additional_context from message history so the agent has conversation context
  3. wa_agent.arun(message, session_state=ss) — run the agent
  4. extract updated session_state from RunOutput.session_state
  5. append new user + assistant messages to history
  6. save_session(phone, updated_ss, updated_messages) — write back to Supabase

No direct Postgres connection needed — uses existing SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Form, Request, Response
from fastapi.responses import JSONResponse

from ..core.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
from .session_store import load_session, save_session

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_MSG_CHARS = 1550  # WhatsApp limit is 1600; leave 50 for safety
_HISTORY_CONTEXT_TURNS = 10  # Number of recent turns to include in additional_context


# ── Twilio signature verification ─────────────────────────────────────────────

def _canonical_request_url(request: Request) -> str:
    """Reconstruct the public-facing HTTPS URL from Cloud Run forwarded headers.

    Cloud Run terminates TLS before the container, so request.url is http://.
    Twilio signed the request using the https:// URL, so we must use the same.
    X-Forwarded-Proto and the Host header give us everything we need.
    """
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("host", request.url.netloc)
    path = request.url.path
    # Include query string if present (Twilio webhooks don't usually have one,
    # but the validator requires the full URL including any query params)
    qs = request.url.query
    url = f"{proto}://{host}{path}"
    if qs:
        url = f"{url}?{qs}"
    return url


async def _verify_twilio_signature(request: Request) -> bool:
    """Verify X-Twilio-Signature. Returns True if valid or verification is disabled."""
    if not TWILIO_AUTH_TOKEN:
        logger.warning("TWILIO_AUTH_TOKEN not set — signature verification skipped")
        return True

    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(TWILIO_AUTH_TOKEN)
        signature = request.headers.get("X-Twilio-Signature", "")
        form = await request.form()
        params = dict(form)
        # Derive the canonical URL from the request itself — no env var needed
        url = _canonical_request_url(request)
        valid = validator.validate(url, params, signature)
        if not valid:
            logger.warning(f"Invalid Twilio signature — url={url}, client={request.client}")
        return valid
    except Exception as e:
        logger.error(f"Twilio signature validation error: {e}")
        return False


# ── Message splitting ─────────────────────────────────────────────────────────

def _split_message(text: str, max_chars: int = _MAX_MSG_CHARS) -> list[str]:
    """Split a long message on paragraph boundaries, then newlines, then hard-cut."""
    if len(text) <= max_chars:
        return [text]

    parts: list[str] = []
    remaining = text.strip()

    while len(remaining) > max_chars:
        split_pos = remaining.rfind("\n\n", 0, max_chars)
        if split_pos == -1:
            split_pos = remaining.rfind("\n", 0, max_chars)
        if split_pos == -1:
            split_pos = max_chars
        parts.append(remaining[:split_pos].strip())
        remaining = remaining[split_pos:].strip()

    if remaining:
        parts.append(remaining)

    return [p for p in parts if p]


# ── Twilio send helper ────────────────────────────────────────────────────────

def _send_whatsapp_message(to_phone: str, body: str) -> None:
    """Send a single WhatsApp message via Twilio (synchronous, run in executor)."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured — message not sent")
        return

    from twilio.rest import Client
    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    from_num = TWILIO_WHATSAPP_FROM or "whatsapp:+14155238886"
    to_num = f"whatsapp:{to_phone}" if not to_phone.startswith("whatsapp:") else to_phone
    msg = client.messages.create(from_=from_num, to=to_num, body=body)
    logger.debug(f"Twilio send: sid={msg.sid}, to={to_phone}, len={len(body)}")


async def _send_chunks(to_phone: str, text: str) -> None:
    """Split and send the agent response to WhatsApp."""
    loop = asyncio.get_running_loop()
    for chunk in _split_message(text):
        await loop.run_in_executor(None, _send_whatsapp_message, to_phone, chunk)


# ── Conversation history context ──────────────────────────────────────────────

def _build_history_context(messages: list[dict], n: int = _HISTORY_CONTEXT_TURNS) -> str:
    """Build a plain-text history block from the last N message turns.

    This is injected as additional_context so the agent understands what was
    said in the conversation before its current context window.
    """
    recent = messages[-n * 2:]  # each turn = user + assistant = 2 messages
    if not recent:
        return ""

    lines = ["--- CONVERSATION HISTORY (most recent) ---"]
    for m in recent:
        role = m.get("role", "unknown").upper()
        content = str(m.get("content", ""))[:500]  # cap to avoid bloat
        lines.append(f"{role}: {content}")
    lines.append("--- END HISTORY ---")
    return "\n".join(lines)


# ── Incoming message endpoint ─────────────────────────────────────────────────

@router.post("/incoming")
async def incoming_message(
    request: Request,
    From: Annotated[str, Form()] = "",
    Body: Annotated[str, Form()] = "",
    NumMedia: Annotated[str, Form()] = "0",
    MediaUrl0: Annotated[Optional[str], Form()] = None,
    MediaContentType0: Annotated[Optional[str], Form()] = None,
    ProfileName: Annotated[Optional[str], Form()] = None,
) -> Response:
    """Handle an inbound WhatsApp message from Twilio.

    Always returns HTTP 200 — Twilio re-tries on non-200 responses.
    All errors are caught and a friendly recovery message is sent to the user.
    """
    if not await _verify_twilio_signature(request):
        logger.error("Twilio signature verification failed — ignoring message")
        return Response(status_code=200)

    # Normalise the phone number to E.164 (strip "whatsapp:" prefix)
    phone_e164 = From.strip().replace("whatsapp:", "").strip()
    if not phone_e164:
        logger.error("incoming_message: empty From field")
        return Response(status_code=200)

    # Build the message the agent will receive
    num_media = int(NumMedia or "0")
    if num_media > 0 and MediaUrl0:
        content_type = MediaContentType0 or "application/octet-stream"
        # Structured sentinel — agent instructions tell it to call process_uploaded_document
        sentinel = f"[FILE_UPLOADED] type={content_type} url={MediaUrl0}"
        user_message = f"{sentinel}\n\n{Body.strip()}" if Body.strip() else sentinel
    else:
        user_message = Body.strip()

    if not user_message:
        logger.debug(f"incoming_message: empty message from {phone_e164}, ignoring")
        return Response(status_code=200)

    logger.info(f"incoming_message: phone={phone_e164}, msg_len={len(user_message)}, media={num_media}")

    # ── 1. Load session state + conversation history from Supabase ────────────
    loop = asyncio.get_running_loop()
    session_state, messages = await loop.run_in_executor(None, load_session, phone_e164)

    # ── 2. Build conversation history context for the agent ───────────────────
    history_context = _build_history_context(messages)

    # ── 3. Run the agent ──────────────────────────────────────────────────────
    response_text = ""
    updated_ss = session_state

    try:
        from .agent import wa_agent

        result = await wa_agent.arun(
            user_message,
            user_id=phone_e164,
            session_id=phone_e164,
            session_state=session_state,
            additional_context=history_context if history_context else None,
        )

        # Extract updated session_state (Agno's RunOutput.session_state)
        if result and hasattr(result, "session_state") and result.session_state:
            updated_ss = result.session_state

        # Extract the assistant's response text
        if result and hasattr(result, "content") and result.content:
            response_text = str(result.content)
        elif result and hasattr(result, "messages") and result.messages:
            for msg in reversed(result.messages):
                if getattr(msg, "role", None) == "assistant" and getattr(msg, "content", None):
                    response_text = str(msg.content)
                    break

    except Exception as e:
        logger.error(f"incoming_message: agent error for {phone_e164}: {e}", exc_info=True)
        response_text = (
            "Something went wrong on my end. Let's continue where we left off — "
            "just send your last message again."
        )

    # ── 4. Append this turn to the message history ────────────────────────────
    if user_message:
        messages.append({"role": "user", "content": user_message})
    if response_text:
        messages.append({"role": "assistant", "content": response_text})

    # ── 5. Persist updated session + history back to Supabase ─────────────────
    await loop.run_in_executor(None, save_session, phone_e164, updated_ss, messages)

    # ── 6. Send the response to WhatsApp ──────────────────────────────────────
    if response_text.strip():
        await _send_chunks(phone_e164, response_text.strip())

    return Response(status_code=200, media_type="text/xml", content="<Response/>")


# ── Status callback ───────────────────────────────────────────────────────────

@router.post("/status")
async def status_callback(
    MessageSid: Annotated[str, Form()] = "",
    MessageStatus: Annotated[str, Form()] = "",
    To: Annotated[Optional[str], Form()] = None,
    ErrorCode: Annotated[Optional[str], Form()] = None,
) -> Response:
    """Log Twilio delivery status callbacks."""
    if ErrorCode:
        logger.warning(
            f"Twilio delivery error: sid={MessageSid}, status={MessageStatus}, "
            f"to={To}, error_code={ErrorCode}"
        )
    else:
        logger.debug(f"Twilio status: sid={MessageSid}, status={MessageStatus}, to={To}")
    return Response(status_code=200)


# ── Health probe ──────────────────────────────────────────────────────────────

@router.get("/health")
async def health() -> JSONResponse:
    """Liveness probe for the WhatsApp bot service."""
    from .tax_engine import days_to_deadline
    return JSONResponse({
        "status": "ok",
        "service": "whatsapp_tax_bot",
        "days_to_deadline": days_to_deadline(),
    })
