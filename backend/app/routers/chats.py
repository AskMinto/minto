from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import ASSISTANT_DISCLAIMER
from ..core.prompts import prompts
from ..db.supabase import get_supabase_client
from ..services.gemini import generate_response, GeminiNotConfigured
from ..services.guardrails import (
    append_disclaimer,
    contains_blocked_phrase,
    safe_response,
)
from ..services.mem0 import add_memory, get_memory
from ..services.portfolio import compute_portfolio
from ..services.research_agent import (
    run_research_agent,
    run_research_agent_stream,
    AgentNotConfigured,
    _make_profile_update_tool,
)
from ..core.config import ASSISTANT_DISCLAIMER, OPENAI_API_KEY
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageCreate(BaseModel):
    content: str


MARKET_COMMENTARIES = [
    "Nifty's up but your portfolio isn't — classic.",
    "Markets are vibing. Are you?",
    "Sensex said 📈, your watchlist said 🤷",
    "Green day in the markets. Let's see your P&L.",
    "Bulls are running. Bears are napping.",
    "Another day, another Nifty record. Maybe.",
    "The market doesn't care about your feelings.",
    "Flat markets today. Perfect time to do nothing.",
]


@router.get("/home-context")
def get_home_context(user: UserContext = Depends(get_user_context)):
    """Return data for the Ask Minto home screen: user name, market badges, commentary."""
    import random
    from ..services.yfinance_service import get_quote

    supabase = get_supabase_client(user.token)

    # User name from Supabase auth metadata
    try:
        user_resp = supabase.auth.get_user()
        metadata = user_resp.user.user_metadata if user_resp and user_resp.user else {}
        full_name = metadata.get("full_name", metadata.get("name", ""))
        user_name = full_name.split(" ")[0] if full_name else ""
    except Exception:
        user_name = ""

    # Market badges — Nifty 50 and Sensex
    nifty = get_quote("^NSEI", None)
    sensex = get_quote("^BSESN", None)

    def _badge(label: str, data: dict) -> dict:
        price = data.get("price")
        prev = data.get("previous_close")
        change_pct = 0.0
        if price and prev and prev > 0:
            change_pct = ((price - prev) / prev) * 100
        return {
            "label": label,
            "value": f"{price:,.0f}" if price else "—",
            "change": round(change_pct, 2),
        }

    badges = [
        _badge("NIFTY 50", nifty),
        _badge("SENSEX", sensex),
    ]

    commentary = random.choice(MARKET_COMMENTARIES)

    return {
        "user_name": user_name,
        "market_badges": badges,
        "commentary": commentary,
    }


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
def get_messages(
    user: UserContext = Depends(get_user_context),
    limit: int = 8,
    before: str | None = None,
):
    """Fetch chat messages with cursor-based pagination.

    Args:
        limit: Number of messages to return (default 8 = ~4 pairs).
        before: ISO timestamp cursor — return messages older than this.
    """
    supabase = get_supabase_client(user.token)
    chat_id = _get_or_create_thread(supabase, user.user_id)

    query = supabase.table("chat_messages").select("*").eq("chat_id", chat_id)
    if before:
        query = query.lt("created_at", before)

    result = query.order("created_at", desc=True).limit(limit).execute()
    msgs = list(reversed(result.data or []))
    has_more = len(result.data or []) == limit
    return {"chat_id": chat_id, "messages": msgs, "has_more": has_more}


def _build_system_prompt(risk_profile: dict | None = None) -> str:
    return prompts.build_system_prompt(risk_profile)


def _build_user_prompt(
    message: str, memory: str, portfolio: dict, financial_profile: dict | None = None
) -> str:
    return prompts.build_user_prompt(message, memory, portfolio, financial_profile)


def _load_chat_context(supabase, user, chat_id: str):
    """Load holdings, portfolio, memory, history, and risk profile."""
    holdings = (
        supabase.table("holdings").select("*").eq("user_id", user.user_id).execute()
    ).data or []
    portfolio = compute_portfolio(holdings)
    memory = get_memory(user.user_id)

    cfg = prompts.agent_config
    max_history = cfg.get("max_history_messages", 10)
    max_msg_len = cfg.get("max_assistant_message_length", 500)

    recent_history = (
        supabase.table("chat_messages")
        .select("role,content")
        .eq("chat_id", chat_id)
        .order("created_at", desc=True)
        .limit(max_history)
        .execute()
    ).data or []
    recent_history = list(reversed(recent_history))[:-1]
    # Strip disclaimer text and truncate long messages to avoid context overload
    for msg in recent_history:
        if msg.get("role") == "assistant" and msg.get("content"):
            content = msg["content"]
            for pattern in prompts.disclaimer_strip_patterns:
                content = content.replace(pattern, "")
            content = content.strip()
            if len(content) > max_msg_len:
                content = content[:max_msg_len] + "..."
            msg["content"] = content

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

    financial_profile = None
    try:
        fp_result = (
            supabase.table("financial_profiles")
            .select("responses,metrics")
            .eq("user_id", user.user_id)
            .limit(1)
            .execute()
        )
        if fp_result.data:
            financial_profile = fp_result.data[0]
    except Exception:
        pass

    return portfolio, memory, recent_history, risk_profile, financial_profile


def _apply_guardrails(reply: str, widgets: list[dict]) -> tuple[str, list[dict]]:
    """Apply guardrail checks to a reply. No per-message disclaimer — the chat UI has a banner."""
    if contains_blocked_phrase(reply):
        return safe_response(reply), []
    return reply, widgets


def _save_assistant_message(
    supabase, chat_id: str, user_id: str, content: str, widgets: list[dict]
):
    """Persist the assistant message and update chat timestamp."""
    metadata = {"widgets": widgets} if widgets else {"widgets": []}
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

    portfolio, memory, recent_history, risk_profile, financial_profile = (
        _load_chat_context(supabase, user, chat_id)
    )
    prompt = _build_user_prompt(payload.content, memory, portfolio, financial_profile)
    system_prompt = _build_system_prompt(risk_profile)

    profile_tool = _make_profile_update_tool(supabase, user.user_id)
    extra_tools = [profile_tool]

    try:
        assistant_reply, widgets = run_research_agent(
            system_prompt, prompt, chat_history=recent_history, extra_tools=extra_tools,
            supabase_client=supabase, user_id=user.user_id,
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
                f"Something went wrong. Please try again.\n\n{ASSISTANT_DISCLAIMER}"
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

    portfolio, memory, recent_history, risk_profile, financial_profile = (
        _load_chat_context(supabase, user, chat_id)
    )
    prompt = _build_user_prompt(payload.content, memory, portfolio, financial_profile)
    system_prompt = _build_system_prompt(risk_profile)

    profile_tool = _make_profile_update_tool(supabase, user.user_id)
    extra_tools = [profile_tool]

    def event_generator():
        full_content = ""
        widgets: list[dict] = []
        print("[MINTO] Stream starting")
        try:
            for event in run_research_agent_stream(
                system_prompt,
                prompt,
                chat_history=recent_history,
                extra_tools=extra_tools,
                supabase_client=supabase,
                user_id=user.user_id,
            ):
                event_type = event.get("type", "")

                if event_type == "token":
                    token = event.get("content", "")
                    data = json.dumps({"type": "token", "content": token})
                    yield f"data: {data}\n\n"

                elif event_type == "tool_started":
                    print(f"[MINTO] Tool started: {event.get('tool_name', '')}")

                elif event_type == "tool_completed":
                    tool_widgets = event.get("widgets", [])
                    print(
                        f"[MINTO] Tool completed: {event.get('tool_name', '')}, widgets={len(tool_widgets)}"
                    )
                    if tool_widgets:
                        widgets.extend(tool_widgets)

                elif event_type == "done":
                    full_content = event.get("content", "")

            print(
                f"[MINTO] Before guardrails: content_len={len(full_content)}, widgets={len(widgets)}"
            )
            if full_content:
                full_content, widgets = _apply_guardrails(full_content, widgets)
            print(
                f"[MINTO] After guardrails: content_len={len(full_content)}, widgets={len(widgets)}"
            )

        except (AgentNotConfigured, GeminiNotConfigured):
            full_content = "AI is not configured yet. Please set GEMINI_API_KEY to enable chat responses."
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"

        except Exception as e:
            print(f"[MINTO] Streaming error: {e}")
            full_content = "Something went wrong. Please try again."
            data = json.dumps({"type": "token", "content": full_content})
            yield f"data: {data}\n\n"

        # Save to DB BEFORE sending done
        if full_content:
            print(f"[MINTO] Saving: widgets={len(widgets)}")
            _save_assistant_message(
                supabase, chat_id, user.user_id, full_content, widgets
            )
            add_memory(
                user.user_id, f"User: {payload.content}\nAssistant: {full_content}"
            )

        done_data = json.dumps({"type": "done", "widgets": widgets})
        print(f"[MINTO] Done event: {done_data[:200]}")
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


@router.get("/voice/token")
async def get_voice_token(user: UserContext = Depends(get_user_context)):
    """Fetch an ephemeral token for the OpenAI Realtime API (WebRTC)."""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured.",
        )

    supabase = get_supabase_client(user.token)
    chat_id = _get_or_create_thread(supabase, user.user_id)
    portfolio, memory, recent_history, risk_profile, financial_profile = (
        _load_chat_context(supabase, user, chat_id)
    )

    system_prompt = _build_system_prompt(risk_profile)
    agent_instructions = "\n".join(prompts.agent_instructions)
    context_prompt = _build_user_prompt("", memory, portfolio, financial_profile)

    voice_hint = (
        "\n\nVOICE BEHAVIOR: You are in a voice conversation. "
        "Keep responses concise and conversational — speak naturally as if talking to a person. "
        "When you need to look something up using a tool, briefly say so first "
        "(e.g. 'Let me check that for you') before the tool call completes. "
        "Avoid reading out long lists, markdown, or bullet points — convert them to natural speech."
    )
    full_instructions = f"{system_prompt}\n\n{agent_instructions}\n\n{context_prompt}{voice_hint}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "voice": "verse",
                    "instructions": full_instructions,
                    "input_audio_transcription": {
                        "model": "whisper-1",
                    },
                    "tools": [
                        {
                            "type": "function",
                            "name": "get_current_stock_price",
                            "description": "Get the current stock price for an Indian equity.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "symbol": {
                                        "type": "string",
                                        "description": "The stock symbol with .NS or .BO suffix (e.g., SBIN.NS)",
                                    }
                                },
                                "required": ["symbol"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "_get_mf_nav",
                            "description": "Get the current NAV for a mutual fund.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "scheme_code": {
                                        "type": "integer",
                                        "description": "The mutual fund scheme code",
                                    }
                                },
                                "required": ["scheme_code"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "_search_instrument",
                            "description": "Search for stocks or mutual fund schemes by name, symbol, or ISIN.",
                            "parameters": {
                                "type": "object",
                                "properties": {"query": {"type": "string"}},
                                "required": ["query"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "_get_market_overview",
                            "description": "Get current Indian market overview including Nifty 50, Sensex, and Bank Nifty.",
                            "parameters": {"type": "object", "properties": {}},
                        },
                        {
                            "type": "function",
                            "name": "_update_financial_profile",
                            "description": "Update the user's financial profile / balance sheet.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "updates": {
                                        "type": "string",
                                        "description": "JSON string of field:value pairs",
                                    }
                                },
                                "required": ["updates"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "get_company_news",
                            "description": "Get latest news for a specific company symbol.",
                            "parameters": {
                                "type": "object",
                                "properties": {"symbol": {"type": "string"}},
                                "required": ["symbol"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "web_search",
                            "description": "Search the web using DuckDuckGo.",
                            "parameters": {
                                "type": "object",
                                "properties": {"query": {"type": "string"}},
                                "required": ["query"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "search_news",
                            "description": "Search latest news on DuckDuckGo.",
                            "parameters": {
                                "type": "object",
                                "properties": {"query": {"type": "string"}},
                                "required": ["query"],
                            },
                        },
                        {
                            "type": "function",
                            "name": "read_article",
                            "description": "Read and extract content from a URL.",
                            "parameters": {
                                "type": "object",
                                "properties": {"url": {"type": "string"}},
                                "required": ["url"],
                            },
                        },
                    ],
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            data["recent_history"] = recent_history
            return data
    except Exception as e:
        logger.error(f"Error fetching Realtime API token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch Realtime API token.",
        )


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict


@router.post("/voice/tool")
async def execute_voice_tool(
    payload: ToolCallPayload, user: UserContext = Depends(get_user_context)
):
    """Proxy tool calls from the voice agent to the backend services."""
    from ..services.research_agent import (
        _get_mf_nav,
        _search_instrument,
        _get_market_overview,
        _make_profile_update_tool,
    )

    try:
        if payload.name == "get_current_stock_price":
            from ..services.yfinance_service import get_quote

            symbol = str(payload.arguments.get("symbol", ""))
            quote = get_quote(symbol, None)
            return quote or {"error": "Could not fetch quote"}
        elif payload.name == "_get_mf_nav":
            scheme_code = int(payload.arguments.get("scheme_code", 0))
            return json.loads(_get_mf_nav(scheme_code))
        elif payload.name == "_search_instrument":
            query = str(payload.arguments.get("query", ""))
            return json.loads(_search_instrument(query))
        elif payload.name == "_get_market_overview":
            return json.loads(_get_market_overview())
        elif payload.name == "_update_financial_profile":
            updates = str(payload.arguments.get("updates", "{}"))
            supabase = get_supabase_client(user.token)
            tool = _make_profile_update_tool(supabase, user.user_id)
            return {"result": tool(updates)}
        elif payload.name == "get_company_news":
            from ..services.yfinance_service import get_news

            symbol = str(payload.arguments.get("symbol", ""))
            return get_news(symbol)
        elif payload.name == "web_search":
            from agno.tools.duckduckgo import DuckDuckGoTools

            query = str(payload.arguments.get("query", ""))
            tool = DuckDuckGoTools(
                enable_search=True, fixed_max_results=5, region="in-en"
            )
            return tool.duckduckgo_search(query)
        elif payload.name == "search_news":
            from agno.tools.duckduckgo import DuckDuckGoTools

            query = str(payload.arguments.get("query", ""))
            tool = DuckDuckGoTools(
                enable_news=True, fixed_max_results=5, region="in-en"
            )
            return tool.duckduckgo_news(query)
        elif payload.name == "read_article":
            from agno.tools.newspaper4k import Newspaper4kTools

            url = str(payload.arguments.get("url", ""))
            tool = Newspaper4kTools(include_summary=True, article_length=3000)
            return tool.read_article(url)
        else:
            return {"error": f"Unknown tool: {payload.name}"}
    except Exception as e:
        logger.error(f"Error executing tool {payload.name}: {e}")
        return {"error": str(e)}
