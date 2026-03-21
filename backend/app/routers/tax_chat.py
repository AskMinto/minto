"""Tax Saver chat router — /tax/* endpoints.

Provides the backend for the web /tax-saver page.
Mirrors the WhatsApp bot's session/agent pattern but:
  - keyed by user_id (Supabase auth UUID) instead of phone number
  - uses web_agent.py (markdown enabled) instead of agent.py
  - file uploads come as multipart (not Twilio media URLs)
  - responses are SSE streamed (not sent via Twilio)
  - DPDPA: uploaded file bytes are never stored long-term; parsed in memory only

Endpoints:
  GET  /tax/messages       — load message history (last 30)
  POST /tax/message/stream — SSE streaming chat
  POST /tax/upload         — multipart file upload + LLM parse
  DELETE /tax/session      — DPDPA right to erasure
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..whatsapp_bot.web_session_store import (
    delete_tax_session,
    load_tax_session,
    save_tax_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax", tags=["tax"])

_HISTORY_TURNS = 10  # Number of recent turns to inject as additional_context


# ── Models ────────────────────────────────────────────────────────────────────

class TaxMessageRequest(BaseModel):
    content: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_history_context(messages: list[dict], n: int = _HISTORY_TURNS) -> str:
    """Build a plain-text history block from the last N turns for additional_context."""
    recent = messages[-(n * 2):]
    if not recent:
        return ""
    lines = ["--- CONVERSATION HISTORY ---"]
    for m in recent:
        role = m.get("role", "unknown").upper()
        content = str(m.get("content", ""))[:500]
        lines.append(f"{role}: {content}")
    lines.append("--- END HISTORY ---")
    return "\n".join(lines)


def _safe_session_summary(ss: dict) -> dict:
    """Return a sanitised session_state summary for the SSE done event.

    Omits large parsed document blobs to keep the event small.
    """
    return {
        "step": ss.get("step"),
        "documents_needed": ss.get("documents_needed"),
        "documents_done": ss.get("documents_done"),
        "has_tax_analysis": bool(ss.get("tax_analysis")),
        "has_cas": bool(ss.get("cas_parsed")),
        "has_broker_pl": bool(ss.get("broker_pl_parsed")),
        "has_broker_holdings": bool(ss.get("broker_holdings_parsed")),
        "has_itr": bool(ss.get("itr_parsed")),
        "exemption_remaining": (ss.get("tax_analysis") or {}).get("exemption_remaining"),
        "total_tax": (ss.get("tax_analysis") or {}).get("total_tax"),
        "ulip_disclaimer_active": ss.get("ulip_disclaimer_active", False),
        "reminder_opted_in": ss.get("reminder_opted_in", False),
    }


def _build_parse_summary_message(doc_type: str, parsed: dict, broker_name: Optional[str]) -> str:
    """Build a [DOC_PARSED] sentinel message the agent receives after an upload."""
    if doc_type == "cas":
        name = parsed.get("investor_name", "Unknown")
        pan = parsed.get("pan", "—")
        folios = len(parsed.get("folios") or [])
        ltcg = parsed.get("total_realised_ltcg_fy", 0)
        stcg = parsed.get("total_realised_stcg_fy", 0)
        ltcl = parsed.get("total_realised_ltcl_fy", 0)
        stcl = parsed.get("total_realised_stcl_fy", 0)
        return (
            f"[DOC_PARSED] doc_type=cas status=parsed "
            f"investor={name!r} pan={pan} folios={folios} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f} ltcl={ltcl:.0f} stcl={stcl:.0f}"
        )
    elif doc_type == "broker_pl":
        broker = broker_name or parsed.get("broker_name", "broker")
        ltcg = parsed.get("total_ltcg", 0)
        stcg = parsed.get("total_stcg", 0)
        ltcl = parsed.get("total_ltcl", 0)
        stcl = parsed.get("total_stcl", 0)
        return (
            f"[DOC_PARSED] doc_type=broker_pl status=parsed broker={broker!r} "
            f"ltcg={ltcg:.0f} stcg={stcg:.0f} ltcl={ltcl:.0f} stcl={stcl:.0f}"
        )
    elif doc_type == "broker_holdings":
        broker = broker_name or parsed.get("broker_name", "broker")
        total = parsed.get("total_portfolio_value", 0)
        count = len(parsed.get("holdings") or [])
        return (
            f"[DOC_PARSED] doc_type=broker_holdings status=parsed broker={broker!r} "
            f"holdings={count} total_value={total:.0f}"
        )
    elif doc_type == "itr":
        ltcl = parsed.get("total_ltcl_cf", 0)
        stcl = parsed.get("total_stcl_cf", 0)
        return (
            f"[DOC_PARSED] doc_type=itr status=parsed "
            f"ltcl_cf={ltcl:.0f} stcl_cf={stcl:.0f}"
        )
    return f"[DOC_PARSED] doc_type={doc_type} status=parsed"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/messages")
def get_tax_messages(user: UserContext = Depends(get_user_context)):
    """Return the stored messages list for the current user (last 30)."""
    _, messages = load_tax_session(user.user_id)
    return {"messages": messages[-30:]}


@router.post("/message/stream")
async def tax_message_stream(
    body: TaxMessageRequest,
    user: UserContext = Depends(get_user_context),
):
    """SSE streaming tax chat endpoint.

    Loads session state, runs the web_tax_agent, streams tokens, saves state.
    """
    session_state, messages = load_tax_session(user.user_id)
    history_context = _build_history_context(messages)

    async def event_generator():
        from ..whatsapp_bot.web_agent import web_tax_agent

        full_content = ""
        updated_ss = session_state

        try:
            # arun with stream=True not directly supported in all Agno versions;
            # use run_response and stream token by token from .content
            result = await web_tax_agent.arun(
                body.content,
                user_id=user.user_id,
                session_id=user.user_id,
                session_state=session_state,
                additional_context=history_context or None,
            )

            if result and hasattr(result, "session_state") and result.session_state:
                updated_ss = result.session_state

            if result and hasattr(result, "content") and result.content:
                full_content = str(result.content)

            # Stream the full content token-by-token (simulated — Agno runs synchronously)
            # Split by words for a smooth streaming effect
            if full_content:
                words = full_content.split(" ")
                chunk_size = 3
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size])
                    if i + chunk_size < len(words):
                        chunk += " "
                    data = json.dumps({"type": "token", "content": chunk})
                    yield f"data: {data}\n\n"
                    await asyncio.sleep(0)  # yield to event loop

        except Exception as e:
            logger.error(f"tax_message_stream: agent error for {user.user_id}: {e}", exc_info=True)
            full_content = "Something went wrong on my end. Please try sending your message again."
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"

        # Persist updated session + message history
        if full_content:
            messages.append({"role": "user", "content": body.content})
            messages.append({"role": "assistant", "content": full_content})
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, save_tax_session, user.user_id, updated_ss, messages)

        done_data = json.dumps({
            "type": "done",
            "session_state": _safe_session_summary(updated_ss),
        })
        yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/upload")
async def tax_upload(
    file: UploadFile,
    doc_type: str = Form(...),
    broker_name: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    user: UserContext = Depends(get_user_context),
):
    """Accept a document upload, parse it, and store the result in the session.

    Args:
        file: The uploaded file (PDF, CSV, or Excel).
        doc_type: 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'.
        broker_name: Optional broker name (for broker documents).
        password: Optional password for encrypted PDFs.

    Returns:
        {status: 'parsed', doc_type, summary} on success.
        {status: 'needs_password'} if PDF is encrypted and no password provided.
        {status: 'error', message} on failure.
    """
    from ..whatsapp_bot.document_parser import is_pdf_encrypted, decrypt_pdf
    from ..whatsapp_bot.llm_doc_parser import parse_document

    raw_bytes = await file.read()
    content_type = file.content_type or "application/pdf"
    is_pdf = "pdf" in content_type.lower()

    # Handle encrypted PDFs
    if is_pdf:
        if is_pdf_encrypted(raw_bytes):
            if not password:
                return {
                    "status": "needs_password",
                    "message": "This PDF is password-protected. Please enter the password.",
                }
            try:
                import pikepdf
                raw_bytes = decrypt_pdf(raw_bytes, password)
            except Exception as e:
                if "password" in str(e).lower() or "pikepdf" in type(e).__module__:
                    return {
                        "status": "wrong_password",
                        "message": "Incorrect password. Please try again.",
                    }
                return {"status": "error", "message": f"Could not unlock PDF: {e}"}

    # Parse the document
    try:
        parsed = await parse_document(raw_bytes, content_type, doc_type)
    except Exception as e:
        logger.error(f"tax_upload: parse failed for {user.user_id}, doc_type={doc_type}: {e}")
        return {"status": "error", "message": f"Could not read this document. {_parse_error_hint(doc_type)}"}

    # Store in session
    loop = asyncio.get_running_loop()
    session_state, messages = await loop.run_in_executor(None, load_tax_session, user.user_id)

    state_key = {"cas": "cas_parsed", "broker_pl": "broker_pl_parsed",
                 "broker_holdings": "broker_holdings_parsed", "itr": "itr_parsed"}.get(doc_type, f"{doc_type}_parsed")
    session_state[state_key] = parsed

    docs_done = list(session_state.get("documents_done") or [])
    if doc_type not in docs_done:
        docs_done.append(doc_type)
    session_state["documents_done"] = docs_done

    # Inject a [DOC_PARSED] system message so the agent can acknowledge it
    sentinel = _build_parse_summary_message(doc_type, parsed, broker_name)
    messages.append({"role": "user", "content": sentinel})

    await loop.run_in_executor(None, save_tax_session, user.user_id, session_state, messages)

    return {
        "status": "parsed",
        "doc_type": doc_type,
        "sentinel": sentinel,
        "session_summary": _safe_session_summary(session_state),
    }


@router.delete("/session")
def delete_session_endpoint(user: UserContext = Depends(get_user_context)):
    """DPDPA right to erasure — delete all tax session data for this user."""
    delete_tax_session(user.user_id)
    return {"status": "deleted"}


def _parse_error_hint(doc_type: str) -> str:
    hints = {
        "cas": "Please check you uploaded the Detailed CAS (not Summary) from MFCentral.",
        "broker_pl": "Try downloading as CSV or Excel from your broker's Tax P&L section.",
        "broker_holdings": "Try downloading as CSV or Excel from your broker's Holdings section.",
        "itr": "Please upload the ITR PDF or JSON from incometax.gov.in.",
    }
    return hints.get(doc_type, "Please try uploading the file again.")
