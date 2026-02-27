from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from agno.agent import Agent, RunOutput, RunEvent
from agno.models.google import Gemini
from agno.tools.yfinance import YFinanceTools
from agno.tools.newspaper4k import Newspaper4kTools

from ..core.config import GEMINI_API_KEY
from .mfapi_service import get_latest_nav as mf_get_nav, search_schemes
from .yfinance_service import search as yf_search

logger = logging.getLogger(__name__)

AGENT_INSTRUCTIONS = [
    "You are Minto — a chill, sharp portfolio assistant for Indian retail investors.",
    "You make finance fun and easy to understand. Think gen-z/millennial energy: "
    "casual tone, relatable analogies, maybe an emoji here and there.",
    "",
    "RESEARCH PROCESS:",
    "1. When asked about news or reasons for price moves, SEARCH for relevant news first",
    "2. READ the full articles using the read_article tool — don't just skim headlines",
    "3. Cross-reference with the user's portfolio holdings when relevant",
    "4. Synthesize into a clear, punchy answer",
    "",
    "RESPONSE RULES:",
    "- Keep it tight: 3-5 sentences unless they ask for more detail",
    "- Lead with the insight, skip the preamble",
    "- Use real facts, dates, and numbers from articles you actually read",
    "- If news has nothing to do with the user's question, skip it entirely",
    "- Never give buy/sell instructions or target prices",
    "- Use ₹ and Indian market context (Nifty, Sensex, NSE, BSE)",
    "- Make it conversational — you're their smart friend who reads the news, not a textbook",
    "- Analogies > jargon. If you must use a term, explain it in one line",
    "- When looking up Indian stocks, always append .NS (NSE) or .BO (BSE) to the symbol",
    "- For mutual fund queries, use the get_mf_nav tool with the scheme code",
    "- For instrument discovery, use the search_instrument tool",
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

    agent = Agent(
        model=Gemini(id="gemini-2.0-flash"),
        tools=[yf_tools, newspaper_tools, _get_mf_nav, _search_instrument],
        description=system_prompt,
        instructions=AGENT_INSTRUCTIONS,
        markdown=False,
        tool_call_limit=8,
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
            result = json.loads(result_str) if result_str else {}
        except (json.JSONDecodeError, TypeError):
            result = {}

        if name == "get_current_stock_price" and isinstance(result, dict):
            price = result.get("price") or result.get("current_price")
            if price:
                widgets.append({
                    "type": "ticker_card",
                    "data": {
                        "symbol": result.get("symbol") or args.get("symbol", ""),
                        "price": price,
                        "previous_close": result.get("previous_close"),
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

        elif name == "get_company_news" and isinstance(result, (list, str)):
            items = result if isinstance(result, list) else []
            if items:
                news_items = []
                for item in items[:5]:
                    if isinstance(item, dict):
                        news_items.append({
                            "title": item.get("title", ""),
                            "link": item.get("link") or item.get("url", ""),
                            "publisher": item.get("publisher", ""),
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
    all_tool_executions: list[Any] = []

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
            if hasattr(chunk, "tool") and chunk.tool:
                all_tool_executions.append(chunk.tool)
            tool_name = ""
            if hasattr(chunk, "tool") and chunk.tool:
                tool_name = chunk.tool.tool_name or ""
            yield {"type": "tool_completed", "tool_name": tool_name}

    # Build a mock RunOutput to extract widgets
    mock_output = RunOutput()
    mock_output.tools = all_tool_executions if all_tool_executions else None
    widgets = _extract_widgets(mock_output)

    yield {"type": "done", "content": full_content, "widgets": widgets}
