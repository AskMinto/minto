from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from agno.agent import Agent, RunOutput, RunEvent
from agno.models.google import Gemini
from agno.tools.yfinance import YFinanceTools
from agno.tools.newspaper4k import Newspaper4kTools
from agno.tools.duckduckgo import DuckDuckGoTools

from ..core.config import GEMINI_API_KEY
from .mfapi_service import get_latest_nav as mf_get_nav, search_schemes
from .yfinance_service import search as yf_search

logger = logging.getLogger(__name__)

AGENT_INSTRUCTIONS = [
    "You are Minto — a chill, sharp portfolio assistant for Indian retail investors.",
    "You make finance fun and easy to understand. Casual tone, relatable analogies.",
    "",
    "MANDATORY TOOL USAGE:",
    "- You have NO knowledge of current stock prices. Your training data prices are OUTDATED.",
    "- Before stating ANY stock price, you MUST call get_current_stock_price first.",
    "- Before stating ANY mutual fund NAV, you MUST call _get_mf_nav first.",
    "- For Indian stocks, ALWAYS use the .NS suffix (e.g., HDFCBANK.NS, SBIN.NS, TCS.NS).",
    "- Report the EXACT number the tool returns. Never round, adjust, or estimate.",
    "- If a tool errors, say 'data unavailable right now'. NEVER make up a number.",
    "- NEVER ask the user 'would you like me to look that up?' — just look it up.",
    "",
    "RESEARCH STRATEGY — pick the right tool:",
    "- Stock-specific news → get_company_news (uses Yahoo Finance, needs .NS/.BO symbol)",
    "- Broader topics, macro events, general market news → web_search (DuckDuckGo)",
    "- Breaking news, trending topics → search_news (DuckDuckGo News)",
    "- Full article content from a URL → read_article",
    "- Market indices (Nifty, Sensex, Bank Nifty) → _get_market_overview",
    "- For complex questions, use MULTIPLE tools: search first, then read articles for depth.",
    "",
    "RESEARCH PROCESS:",
    "1. For any question about current events or news, SEARCH first using the appropriate tool",
    "2. If you find interesting articles, READ them using read_article for full context",
    "3. Cross-reference with portfolio holdings and market data when relevant",
    "4. Synthesize into a clear, punchy answer backed by real facts",
    "",
    "RESPONSE RULES:",
    "- Keep it tight: 3-5 sentences unless they ask for more detail",
    "- Lead with the insight, skip the preamble",
    "- Never give buy/sell instructions or target prices",
    "- Use ₹ and Indian market context (Nifty, Sensex, NSE, BSE)",
]


class AgentNotConfigured(Exception):
    pass


def _get_mf_nav(scheme_code: int) -> str:
    """Get the latest NAV for a mutual fund scheme by its MFAPI scheme code.

    Args:
        scheme_code: The MFAPI scheme code (integer).

    Returns:
        JSON string with scheme_name, scheme_code, nav, fund_house, date.
    """
    result = mf_get_nav(scheme_code)
    return json.dumps(result) if result else json.dumps({"error": "Scheme not found"})


def _get_market_overview() -> str:
    """Get current Indian market overview including Nifty 50, Sensex, and Bank Nifty indices.

    Returns:
        JSON string with current index levels and day changes.
    """
    import yfinance as yf
    indices = {
        "^NSEI": "Nifty 50",
        "^BSESN": "Sensex",
        "^NSEBANK": "Bank Nifty",
    }
    results = []
    for symbol, name in indices.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="2d", interval="1d")
            if hist is not None and not hist.empty:
                close = float(hist["Close"].iloc[-1])
                prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else None
                change = close - prev if prev else None
                change_pct = (change / prev * 100) if prev and prev != 0 else None
                results.append({
                    "name": name,
                    "symbol": symbol,
                    "value": round(close, 2),
                    "change": round(change, 2) if change else None,
                    "change_pct": round(change_pct, 2) if change_pct else None,
                })
        except Exception:
            continue
    return json.dumps(results) if results else json.dumps({"error": "Could not fetch market data"})


def _search_instrument(query: str) -> str:
    """Search for stocks or mutual fund schemes by name, symbol, or ISIN.

    Args:
        query: Search query — can be a company name, stock symbol, or scheme name.

    Returns:
        JSON string with matching equities and mutual fund schemes.
    """
    yf_data = yf_search(query)
    equity_results = [
        {"symbol": q.get("symbol"), "name": q.get("name"), "exchange": q.get("exchange"), "type": "EQUITY"}
        for q in yf_data.get("quotes", [])[:6]
    ]
    mf_results = [
        {"scheme_code": m.get("scheme_code"), "name": m.get("scheme_name"), "type": "MUTUAL_FUND"}
        for m in search_schemes(query)[:6]
    ]
    return json.dumps(equity_results + mf_results)


def _build_agent(system_prompt: str, chat_history: list[dict] | None = None) -> Agent:
    """Build an Agno Agent with tools for financial research."""
    if not GEMINI_API_KEY:
        raise AgentNotConfigured("GEMINI_API_KEY is not configured")

    yf_tools = YFinanceTools(
        enable_stock_price=True,
        enable_company_info=True,
        enable_company_news=True,
        enable_stock_fundamentals=True,
        enable_analyst_recommendations=True,
    )

    newspaper_tools = Newspaper4kTools(
        include_summary=True,
        article_length=3000,
    )

    ddg_tools = DuckDuckGoTools(
        enable_search=True,
        enable_news=True,
        fixed_max_results=5,
        region="in-en",
    )

    agent = Agent(
        model=Gemini(id="gemini-2.0-flash", temperature=0),
        tools=[yf_tools, newspaper_tools, ddg_tools, _get_mf_nav, _search_instrument, _get_market_overview],
        description=system_prompt,
        instructions=AGENT_INSTRUCTIONS,
        markdown=False,
        tool_call_limit=12,
        add_datetime_to_context=True,
    )
    return agent


def _extract_widgets(run_output: RunOutput) -> list[dict]:
    """Extract widget data from tool execution results."""
    widgets: list[dict] = []
    if not run_output.tools:
        return widgets

    for tool_exec in run_output.tools:
        name = tool_exec.tool_name or ""
        args = tool_exec.tool_args or {}
        result_str = tool_exec.result or ""

        try:
            result = json.loads(result_str) if result_str else None
        except (json.JSONDecodeError, TypeError):
            result = result_str  # Keep raw string for tools that return plain text

        # get_current_stock_price returns a plain decimal string like "1201.7000"
        if name == "get_current_stock_price":
            price = None
            symbol = args.get("symbol", "")
            if isinstance(result, (int, float)):
                price = float(result)
            elif isinstance(result, str):
                try:
                    price = float(result)
                except ValueError:
                    pass
            if price:
                # Strip .NS/.BO suffix for display
                display_symbol = symbol
                for suffix in (".NS", ".BO", ".ns", ".bo"):
                    if display_symbol.endswith(suffix):
                        display_symbol = display_symbol[:-len(suffix)]
                        break
                widgets.append({
                    "type": "ticker_card",
                    "data": {
                        "symbol": display_symbol,
                        "price": price,
                        "previous_close": None,
                    },
                })

        elif name == "_get_mf_nav" and isinstance(result, dict) and result.get("nav"):
            widgets.append({
                "type": "ticker_card",
                "data": {
                    "scheme_name": result.get("scheme_name"),
                    "scheme_code": result.get("scheme_code") or args.get("scheme_code"),
                    "nav": result.get("nav"),
                    "fund_house": result.get("fund_house"),
                },
            })

        # get_company_news returns JSON array with nested content objects:
        # [{"id": "...", "content": {"title": "...", ...}, ...}, ...]
        elif name == "get_company_news" and isinstance(result, list):
            news_items = []
            for item in result[:5]:
                if not isinstance(item, dict):
                    continue
                # News data can be nested in "content" sub-object
                content_obj = item.get("content", item)
                title = content_obj.get("title", "")
                link = (
                    content_obj.get("canonicalUrl", {}).get("url", "")
                    or content_obj.get("link", "")
                    or content_obj.get("url", "")
                    or item.get("link", "")
                    or item.get("url", "")
                )
                publisher = content_obj.get("provider", {}).get("displayName", "") if isinstance(content_obj.get("provider"), dict) else content_obj.get("publisher", "")
                if title:
                    news_items.append({
                        "title": title,
                        "link": link,
                        "publisher": publisher,
                    })
            if news_items:
                widgets.append({
                    "type": "news_card",
                    "data": {
                        "query": args.get("symbol", ""),
                        "items": news_items,
                    },
                })

    # Deduplicate widgets by type+key
    seen = set()
    unique: list[dict] = []
    for w in widgets:
        data = w.get("data", {})
        key = (w["type"], data.get("symbol", ""), data.get("scheme_code", ""), data.get("query", ""))
        if key not in seen:
            seen.add(key)
            unique.append(w)
    return unique


def run_research_agent(
    system_prompt: str,
    user_prompt: str,
    chat_history: list[dict] | None = None,
) -> tuple[str, list[dict]]:
    """Run the Agno research agent and return (reply_text, widgets).

    This is the main entry point, replacing generate_response_with_tools().
    """
    agent = _build_agent(system_prompt, chat_history)

    # Convert chat history to Agno message format and pass as additional_input
    history_messages = []
    for msg in (chat_history or []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if content:
            history_messages.append({"role": role, "content": content})

    if history_messages:
        agent.additional_input = [
            {"role": m["role"], "content": m["content"]}
            for m in history_messages
        ]

    result: RunOutput = agent.run(user_prompt)

    text = ""
    if result and result.content:
        text = str(result.content).strip()

    widgets = _extract_widgets(result) if result else []
    return text, widgets


def run_research_agent_stream(
    system_prompt: str,
    user_prompt: str,
    chat_history: list[dict] | None = None,
) -> Iterator[dict]:
    """Run the Agno research agent in streaming mode.

    Yields dicts with:
      {"type": "token", "content": "..."}
      {"type": "tool_started", "tool_name": "..."}
      {"type": "tool_completed", "tool_name": "...", "tool_exec": ToolExecution}
      {"type": "done", "content": "...", "widgets": [...]}
    """
    agent = _build_agent(system_prompt, chat_history)

    history_messages = []
    for msg in (chat_history or []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if content:
            history_messages.append({"role": role, "content": content})

    if history_messages:
        agent.additional_input = [
            {"role": m["role"], "content": m["content"]}
            for m in history_messages
        ]

    stream = agent.run(user_prompt, stream=True, stream_events=True)
    full_content = ""
    all_widgets: list[dict] = []

    for chunk in stream:
        if chunk.event == RunEvent.run_content:
            token = chunk.content or ""
            if token:
                full_content += token
                yield {"type": "token", "content": token}

        elif chunk.event == RunEvent.tool_call_started:
            tool_name = ""
            if hasattr(chunk, "tool") and chunk.tool:
                tool_name = chunk.tool.tool_name or ""
            yield {"type": "tool_started", "tool_name": tool_name}

        elif chunk.event == RunEvent.tool_call_completed:
            tool_name = ""
            tool_widgets: list[dict] = []
            if hasattr(chunk, "tool") and chunk.tool:
                tool_name = chunk.tool.tool_name or ""
                # Extract widget immediately from this tool's result
                mock = RunOutput()
                mock.tools = [chunk.tool]
                tool_widgets = _extract_widgets(mock)
                all_widgets.extend(tool_widgets)
            yield {
                "type": "tool_completed",
                "tool_name": tool_name,
                "widgets": tool_widgets,
            }

    yield {"type": "done", "content": full_content, "widgets": all_widgets}
