from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..core.config import ASSISTANT_DISCLAIMER
from ..db.supabase import get_supabase_client
from ..services.gemini import generate_response, generate_response_with_tools, GeminiNotConfigured
from ..services.guardrails import append_disclaimer, contains_blocked_phrase, safe_response
from ..services.mem0 import add_memory, get_memory
from ..services.mfapi_service import get_latest_nav as mf_get_nav, search_schemes
from ..services.portfolio import compute_portfolio
from ..services.yfinance_service import get_news, get_quote, search as yf_search

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
        "RULES:\n"
        "- Never give buy/sell instructions or specific investment recommendations.\n"
        "- Always use Indian market examples (Reliance, HDFC Bank, TCS, Nifty 50) "
        "instead of US examples.\n"
        "- Explain concepts at a Class 10 reading level using simple language.\n"
        "- Follow the pattern: Definition → Example → What to watch for.\n"
        "- When discussing holdings, use the exact numbers from the portfolio snapshot.\n"
        "- Clearly label facts vs. your interpretation.\n"
        "- Use the available tools (get_price, get_mf_nav, get_news, search_instrument) "
        "to fetch live data when the user asks about specific stocks, mutual funds, or news.\n"
        "- Keep responses concise but thorough. Use bullet points for lists.\n"
        f"{risk_section}"
    )


def _build_user_prompt(message: str, memory: str, portfolio: dict, news_items: list[dict]) -> str:
    # Build a concise portfolio summary instead of dumping raw JSON
    totals = portfolio.get("totals", {})
    top_holdings = portfolio.get("top_holdings", [])

    portfolio_summary = (
        f"Total value: ₹{totals.get('total_value', 0):,.0f}, "
        f"Invested: ₹{totals.get('invested', 0):,.0f}, "
        f"P&L: ₹{totals.get('pnl', 0):,.0f} ({totals.get('pnl_pct', 0):.1f}%), "
        f"Today: ₹{totals.get('today_pnl', 0):,.0f}"
    )

    holdings_lines = []
    for h in top_holdings[:10]:
        name = h.get("symbol") or h.get("scheme_name") or h.get("isin") or "Unknown"
        holdings_lines.append(
            f"  {name}: ₹{h.get('value', 0):,.0f} ({h.get('pnl_pct', 0):.1f}%)"
        )
    holdings_block = "\n".join(holdings_lines) if holdings_lines else "  No holdings"

    news_block = ""
    if news_items:
        news_lines = [f"  - {n.get('title', '')}" for n in news_items[:5] if isinstance(n, dict)]
        news_block = f"\nRecent news:\n" + "\n".join(news_lines) + "\n"

    memory_block = f"Previous conversation context:\n{memory}\n\n" if memory else ""

    return (
        f"{memory_block}"
        f"Portfolio summary:\n{portfolio_summary}\n"
        f"Top holdings:\n{holdings_block}\n"
        f"{news_block}\n"
        f"User question: {message}"
    )


def _should_fetch_news(message: str) -> bool:
    keywords = ["news", "headline", "latest", "recent", "update", "story"]
    lower = (message or "").lower()
    return any(keyword in lower for keyword in keywords)


def _extract_symbols_from_holdings(holdings: list[dict], message: str) -> list[str]:
    lower = (message or "").lower()
    symbols = []
    for holding in holdings:
        symbol = holding.get("symbol")
        if symbol and symbol.lower() in lower:
            symbols.append(symbol)
    if symbols:
        return symbols
    return [h.get("symbol") for h in holdings if h.get("symbol")][:3]


def _collect_news(symbols: list[str]) -> list[dict]:
    seen = set()
    items: list[dict] = []
    for symbol in symbols:
        for news in get_news(symbol):
            title = news.get("title") if isinstance(news, dict) else None
            if not title or title in seen:
                continue
            seen.add(title)
            items.append(news)
            if len(items) >= 6:
                return items
    return items


def _execute_tool(name: str, args: dict) -> dict | list | str:
    """Execute a tool call from Gemini and return the result."""
    if name == "get_price":
        return get_quote(
            symbol=args.get("symbol"),
            exchange=args.get("exchange"),
        )
    if name == "get_mf_nav":
        code = args.get("scheme_code")
        if code is not None:
            return mf_get_nav(int(code))
        return {}
    if name == "get_news":
        query = args.get("query", "")
        return get_news(query, limit=5)
    if name == "search_instrument":
        query = args.get("query", "")
        yf_data = yf_search(query)
        equity_results = [
            {"symbol": q.get("symbol"), "name": q.get("name"), "exchange": q.get("exchange"), "type": "EQUITY"}
            for q in yf_data.get("quotes", [])[:6]
        ]
        mf_results = [
            {"scheme_code": m.get("scheme_code"), "name": m.get("scheme_name"), "type": "MUTUAL_FUND"}
            for m in search_schemes(query)[:6]
        ]
        return equity_results + mf_results
    return f"Unknown tool: {name}"


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

    holdings = (
        supabase.table("holdings")
        .select("*")
        .eq("user_id", user.user_id)
        .execute()
    ).data or []
    portfolio = compute_portfolio(holdings)
    memory = get_memory(user.user_id)

    # Fetch recent chat history for conversational context
    recent_history = (
        supabase.table("chat_messages")
        .select("role,content")
        .eq("chat_id", chat_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    ).data or []
    # Reverse so oldest is first, and exclude the message we just inserted
    recent_history = list(reversed(recent_history))[:-1]  # drop last (the current user msg)

    # Fetch risk profile for personalized prompt
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
    news_items: list[dict] = []
    if _should_fetch_news(payload.content):
        symbols = _extract_symbols_from_holdings(holdings, payload.content)
        if symbols:
            news_items = _collect_news(symbols)
    prompt = _build_user_prompt(payload.content, memory, portfolio, news_items)
    system_prompt = _build_system_prompt(risk_profile)
    try:
        assistant_reply, widgets = generate_response_with_tools(
            system_prompt, prompt, chat_history=recent_history, tool_executor=_execute_tool
        )
        if not assistant_reply:
            assistant_reply = ""
        if contains_blocked_phrase(assistant_reply):
            assistant_reply = safe_response(assistant_reply)
            widgets = []
        else:
            assistant_reply = append_disclaimer(assistant_reply)
    except GeminiNotConfigured:
        assistant_reply = (
            "AI is not configured yet. Please set GEMINI_API_KEY to enable chat responses.\n\n"
            f"{ASSISTANT_DISCLAIMER}"
        )
    except Exception:
        # Fallback to non-tool generation
        try:
            assistant_reply = generate_response(system_prompt, prompt)
            if contains_blocked_phrase(assistant_reply):
                assistant_reply = safe_response(assistant_reply)
            else:
                assistant_reply = append_disclaimer(assistant_reply)
        except GeminiNotConfigured:
            assistant_reply = (
                "AI is not configured yet. Please set GEMINI_API_KEY to enable chat responses.\n\n"
                f"{ASSISTANT_DISCLAIMER}"
            )

    metadata = {"widgets": widgets} if widgets else {}

    supabase.table("chat_messages").insert(
        {
            "chat_id": chat_id,
            "user_id": user.user_id,
            "role": "assistant",
            "content": assistant_reply,
            "metadata": metadata,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    supabase.table("chats").update({"last_message_at": datetime.now(timezone.utc).isoformat()}).eq(
        "id", chat_id
    ).execute()

    add_memory(user.user_id, f"User: {payload.content}\nAssistant: {assistant_reply}")

    return {"reply": assistant_reply, "widgets": widgets}
