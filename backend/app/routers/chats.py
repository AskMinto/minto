from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import ASSISTANT_DISCLAIMER
from ..db.supabase import get_supabase_client
from ..services.gemini import generate_response, GeminiNotConfigured
from ..services.guardrails import append_disclaimer, contains_blocked_phrase, safe_response
from ..services.mem0 import add_memory, get_memory
from ..services.portfolio import compute_portfolio
from ..services.research_agent import run_research_agent, run_research_agent_stream, AgentNotConfigured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageCreate(BaseModel):
    content: str


def _get_or_create_thread(supabase, user_id: str) -> str:
    """Return the single chat thread for a user, creating one if none exists."""
    result = (
        supabase.table("chats")
        .select("id")
        .eq("user_id", user_id)
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]

    row = {
        "user_id": user_id,
        "title": "Minto Chat",
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }
    insert = supabase.table("chats").insert(row).execute()
    return insert.data[0]["id"]


@router.get("/messages")
def get_messages(user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    chat_id = _get_or_create_thread(supabase, user.user_id)
    messages = (
        supabase.table("chat_messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"chat_id": chat_id, "messages": messages.data or []}


def _build_system_prompt(risk_profile: dict | None = None) -> str:
    risk_section = ""
    if risk_profile:
        level = risk_profile.get("risk_level", "unknown")
        score = risk_profile.get("risk_score", "N/A")
        risk_section = (
            f"\nThe user's risk profile is: {level} (score: {score}). "
            "Tailor your language and examples to this risk level. "
        )

    return (
        "You are Minto, a portfolio assistant for Indian retail investors. "
        "You help users understand their portfolio, explain market concepts, "
        "and provide data-driven insights.\n\n"
        "CRITICAL: You do NOT know any current stock prices or NAVs. "
        "You MUST call get_current_stock_price (with .NS or .BO suffix) to get any price. "
        "NEVER state a price without calling the tool first. "
        "If you cannot call the tool, say the price is unavailable.\n\n"
        "RULES:\n"
        "- Never give buy/sell instructions or specific investment recommendations.\n"
        "- Always use Indian market context (NSE, BSE, Nifty 50, Sensex).\n"
        "- Explain concepts simply using relatable analogies.\n"
        "- When asked about news or price moves, call get_company_news first.\n"
        "- Keep responses concise: 3-5 sentences unless asked for detail.\n"
        "- Never ask the user if they want you to look something up — just do it.\n"
        f"{risk_section}"
    )


def _build_user_prompt(message: str, memory: str, portfolio: dict) -> str:
    totals = portfolio.get("totals", {})
    top_holdings = portfolio.get("top_holdings", [])

    portfolio_summary = (
        f"Invested: ₹{totals.get('invested', 0):,.0f}, "
        f"P&L: {totals.get('pnl_pct', 0):.1f}%"
    )

    # Only show holding names — NO prices, values, or quantities
    # to prevent the model from deriving/hallucinating per-share prices
    holdings_lines = []
    for h in top_holdings[:10]:
        name = h.get("symbol") or h.get("scheme_name") or h.get("isin") or "Unknown"
        holdings_lines.append(f"  {name}")
    holdings_block = "\n".join(holdings_lines) if holdings_lines else "  No holdings"

    memory_block = f"Previous conversation context:\n{memory}\n\n" if memory else ""

    return (
        f"{memory_block}"
        f"Portfolio summary: {portfolio_summary}\n"
        f"Holdings: {holdings_block}\n"
        f"(Use get_current_stock_price tool for any price data)\n\n"
        f"User question: {message}"
    )


def _load_chat_context(supabase, user, chat_id: str):
    """Load holdings, portfolio, memory, history, and risk profile."""
    holdings = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    ).data or []
    portfolio = compute_portfolio(holdings)
    memory = get_memory(user.user_id)

    recent_history = (
        supabase.table("chat_messages")
        .select("role,content")
        .eq("chat_id", chat_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    ).data or []
    recent_history = list(reversed(recent_history))[:-1]

    risk_profile = None
    try:
        rp_result = (
            supabase.table("risk_profiles")
            .select("risk_level,risk_score")
            .eq("user_id", user.user_id)
            .limit(1)
            .execute()
        )
        if rp_result.data:
            risk_profile = rp_result.data[0]
    except Exception:
        pass

    return portfolio, memory, recent_history, risk_profile


def _apply_guardrails(reply: str, widgets: list[dict]) -> tuple[str, list[dict]]:
    """Apply guardrail checks to a reply. No per-message disclaimer — the chat UI has a banner."""
    if contains_blocked_phrase(reply):
        return safe_response(reply), []
    return reply, widgets


def _save_assistant_message(supabase, chat_id: str, user_id: str, content: str, widgets: list[dict]):
    """Persist the assistant message and update chat timestamp."""
    metadata = {"widgets": widgets} if widgets else {}
    supabase.table("chat_messages").insert(
        {
            "chat_id": chat_id,
            "user_id": user_id,
            "role": "assistant",
            "content": content,
            "metadata": metadata,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    supabase.table("chats").update(
        {"last_message_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", chat_id).execute()


@router.post("/message")
def send_message(
    payload: MessageCreate,
    user: UserContext = Depends(get_user_context),
):
    supabase = get_supabase_client(user.token)
    chat_id = _get_or_create_thread(supabase, user.user_id)
    now = datetime.now(timezone.utc).isoformat()

    supabase.table("chat_messages").insert(
        {
            "chat_id": chat_id,
            "user_id": user.user_id,
            "role": "user",
            "content": payload.content,
            "metadata": {},
            "created_at": now,
        }
    ).execute()

    widgets: list[dict] = []

    portfolio, memory, recent_history, risk_profile = _load_chat_context(supabase, user, chat_id)
    prompt = _build_user_prompt(payload.content, memory, portfolio)
    system_prompt = _build_system_prompt(risk_profile)

    try:
        assistant_reply, widgets = run_research_agent(
            system_prompt, prompt, chat_history=recent_history
        )
        if not assistant_reply:
            assistant_reply = ""
        assistant_reply, widgets = _apply_guardrails(assistant_reply, widgets)
    except (AgentNotConfigured, GeminiNotConfigured):
        assistant_reply = (
            "AI is not configured yet. Please set GEMINI_API_KEY to enable chat responses.\n\n"
            f"{ASSISTANT_DISCLAIMER}"
        )
    except Exception:
        # Fallback to simple Gemini call without tools
        try:
            assistant_reply = generate_response(system_prompt, prompt)
            assistant_reply, widgets = _apply_guardrails(assistant_reply, [])
        except (GeminiNotConfigured, Exception):
            assistant_reply = (
                "Something went wrong. Please try again.\n\n"
                f"{ASSISTANT_DISCLAIMER}"
            )

    _save_assistant_message(supabase, chat_id, user.user_id, assistant_reply, widgets)
    add_memory(user.user_id, f"User: {payload.content}\nAssistant: {assistant_reply}")

    return {"reply": assistant_reply, "widgets": widgets}


@router.post("/message/stream")
def send_message_stream(
    payload: MessageCreate,
    user: UserContext = Depends(get_user_context),
):
    """SSE streaming endpoint for chat messages."""
    supabase = get_supabase_client(user.token)
    chat_id = _get_or_create_thread(supabase, user.user_id)
    now = datetime.now(timezone.utc).isoformat()

    supabase.table("chat_messages").insert(
        {
            "chat_id": chat_id,
            "user_id": user.user_id,
            "role": "user",
            "content": payload.content,
            "metadata": {},
            "created_at": now,
        }
    ).execute()

    portfolio, memory, recent_history, risk_profile = _load_chat_context(supabase, user, chat_id)
    prompt = _build_user_prompt(payload.content, memory, portfolio)
    system_prompt = _build_system_prompt(risk_profile)

    def event_generator():
        full_content = ""
        widgets: list[dict] = []
        try:
            for event in run_research_agent_stream(
                system_prompt, prompt, chat_history=recent_history
            ):
                event_type = event.get("type", "")

                if event_type == "token":
                    token = event.get("content", "")
                    data = json.dumps({"type": "token", "content": token})
                    yield f"data: {data}\n\n"

                elif event_type == "tool_started":
                    data = json.dumps({"type": "tool_started", "tool_name": event.get("tool_name", "")})
                    yield f"data: {data}\n\n"

                elif event_type == "tool_completed":
                    tool_widgets = event.get("widgets", [])
                    if tool_widgets:
                        widgets.extend(tool_widgets)
                    data = json.dumps({
                        "type": "tool_completed",
                        "tool_name": event.get("tool_name", ""),
                        "widgets": tool_widgets,
                    })
                    yield f"data: {data}\n\n"

                elif event_type == "done":
                    full_content = event.get("content", "")
                    # widgets already collected from tool_completed events

            # Apply guardrails to final content
            if full_content:
                full_content, widgets = _apply_guardrails(full_content, widgets)

            done_data = json.dumps({"type": "done", "widgets": widgets})
            yield f"data: {done_data}\n\n"

        except (AgentNotConfigured, GeminiNotConfigured):
            full_content = (
                "AI is not configured yet. Please set GEMINI_API_KEY to enable chat responses.\n\n"
                f"{ASSISTANT_DISCLAIMER}"
            )
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'widgets': []})}\n\n"

        except Exception as e:
            logger.exception("Streaming agent error")
            full_content = f"Something went wrong. Please try again.\n\n{ASSISTANT_DISCLAIMER}"
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'widgets': []})}\n\n"

        # Persist the message after streaming completes
        if full_content:
            _save_assistant_message(supabase, chat_id, user.user_id, full_content, widgets)
            add_memory(user.user_id, f"User: {payload.content}\nAssistant: {full_content}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
