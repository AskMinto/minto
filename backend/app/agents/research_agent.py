from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from agno.agent import Agent, RunOutput, RunEvent
from agno.models.google import Gemini
from agno.team import Team
from agno.team.mode import TeamMode
from agno.run.team import TeamRunEvent
from agno.tools.yfinance import YFinanceTools
from agno.tools.newspaper4k import Newspaper4kTools
from agno.tools.duckduckgo import DuckDuckGoTools

from ..core.config import GEMINI_API_KEY
from ..core.prompts import prompts
from ..core.model_config import model_config
from ..agent_tools.research_tools import (
    get_mf_nav,
    get_market_overview,
    search_instrument,
    make_profile_update_tool,
)

logger = logging.getLogger(__name__)


class AgentNotConfigured(Exception):
    pass


def _build_research_agent(system_prompt: str, chat_history: list[dict] | None = None, extra_tools: list | None = None) -> Agent:
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

    cfg = model_config.research_agent
    all_tools = [yf_tools, newspaper_tools, ddg_tools, get_mf_nav, search_instrument, get_market_overview]
    if extra_tools:
        all_tools.extend(extra_tools)
    agent = Agent(
        model=Gemini(id=cfg.get("model", "gemini-3-flash-preview"), temperature=cfg.get("temperature", 0.3)),
        tools=all_tools,
        description=system_prompt,
        instructions=prompts.agent_instructions,
        markdown=False,
        tool_call_limit=cfg.get("tool_call_limit", 12),
        add_datetime_to_context=True,
        timezone_identifier=model_config.timezone,
    )
    return agent

def _extract_widgets(run_output: RunOutput) -> list[dict]:
    """Extract widget data from tool execution results.

    Aggregates all price lookups into a single price_summary widget
    and all news into a single news_summary widget (max 2 widgets total).
    """
    price_items: list[dict] = []
    news_items: list[dict] = []

    if not run_output.tools:
        return []

    for tool_exec in run_output.tools:
        name = tool_exec.tool_name or ""
        args = tool_exec.tool_args or {}
        result_str = tool_exec.result or ""

        try:
            result = json.loads(result_str) if result_str else None
        except (json.JSONDecodeError, TypeError):
            result = result_str

        # Stock price → add to price_items with change data
        if name == "get_current_stock_price":
            # YFinanceTools returns a natural-language string like
            # "The current price of SBIN is ₹823.45" — not a raw number.
            # Use get_quote() directly for both price and previous_close
            # (it has a 30s TTL cache so the agent's prior call is a hit).
            symbol = args.get("symbol", "")
            display_symbol = symbol
            exchange = None
            for suffix in (".NS", ".BO", ".ns", ".bo"):
                if display_symbol.endswith(suffix):
                    exchange = "BSE" if suffix.upper() == ".BO" else "NSE"
                    display_symbol = display_symbol[:-len(suffix)]
                    break
            try:
                quote = get_quote(symbol=display_symbol, exchange=exchange)
                price = quote.get("price")
                prev_close = quote.get("previous_close")
                if price:
                    change = (price - prev_close) if prev_close and prev_close > 0 else None
                    change_pct = (change / prev_close * 100) if change is not None else None
                    price_items.append({
                        "symbol": display_symbol,
                        "price": price,
                        "change": change,
                        "change_pct": change_pct,
                        "type": "equity",
                    })
            except Exception:
                pass

        # MF NAV → add to price_items
        elif name == "get_mf_nav" and isinstance(result, dict) and result.get("nav"):
            price_items.append({
                "scheme_name": result.get("scheme_name"),
                "scheme_code": result.get("scheme_code") or args.get("scheme_code"),
                "nav": result.get("nav"),
                "fund_house": result.get("fund_house"),
                "type": "mf",
            })

        # Company news → add to news_items
        elif name == "get_company_news" and isinstance(result, list):
            for item in result[:5]:
                if not isinstance(item, dict):
                    continue
                content_obj = item.get("content", item)
                title = content_obj.get("title", "")
                link = (
                    content_obj.get("canonicalUrl", {}).get("url", "")
                    or content_obj.get("link", "")
                    or content_obj.get("url", "")
                    or item.get("link", "")
                    or item.get("url", "")
                )
                publisher = (
                    content_obj.get("provider", {}).get("displayName", "")
                    if isinstance(content_obj.get("provider"), dict)
                    else content_obj.get("publisher", "")
                )
                if title:
                    news_items.append({"title": title, "link": link, "publisher": publisher})

    # Deduplicate price items by symbol/scheme_code
    seen_prices: set[str] = set()
    unique_prices: list[dict] = []
    for p in price_items:
        key = p.get("symbol", "") or str(p.get("scheme_code", ""))
        if key and key not in seen_prices:
            seen_prices.add(key)
            unique_prices.append(p)

    # Deduplicate news by title
    seen_titles: set[str] = set()
    unique_news: list[dict] = []
    for n in news_items:
        if n["title"] not in seen_titles:
            seen_titles.add(n["title"])
            unique_news.append(n)

    widgets: list[dict] = []
    if unique_prices:
        widgets.append({"type": "price_summary", "data": {"items": unique_prices}})
    if unique_news:
        widgets.append({"type": "news_summary", "data": {"items": unique_news}})
    return widgets


def _build_minto_team(
    system_prompt: str,
    chat_history: list[dict] | None = None,
    extra_tools: list | None = None,
    supabase_client: Any = None,
    user_id: str = "",
) -> Team:
    """Build a route-mode Agno Team with Research and Alert specialist agents."""
    from .alert_agent import make_alert_agent

    research_agent = _build_research_agent(system_prompt, chat_history, extra_tools)
    alert_agent = make_alert_agent(supabase_client, user_id)

    cfg = model_config.team_router

    return Team(
        name="Minto Team",
        mode=TeamMode.route,
        model=Gemini(
            id=cfg.get("model", "gemini-3-flash-preview"),
            temperature=cfg.get("temperature", 0.1),
        ),
        members=[research_agent, alert_agent],
        instructions=prompts.team_router_instructions,
        show_members_responses=False,
        markdown=False,
        add_datetime_to_context=True,
        timezone_identifier=model_config.timezone,
    )


def _set_agent_history(agent: Agent, chat_history: list[dict] | None) -> None:
    """Attach chat history to an agent as additional_input."""
    history_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in (chat_history or [])
        if m.get("content")
    ]
    if history_messages:
        agent.additional_input = history_messages


def run_team(
    system_prompt: str,
    user_prompt: str,
    chat_history: list[dict] | None = None,
    extra_tools: list | None = None,
    supabase_client: Any = None,
    user_id: str = "",
) -> tuple[str, list[dict]]:
    """Run the Minto Agno Team (route mode) and return (reply_text, widgets).

    Routes to Research Agent for market/portfolio questions and Alert Agent for
    alert management. Widgets are only extracted from research agent responses.
    """
    team = _build_minto_team(system_prompt, chat_history, extra_tools, supabase_client, user_id)

    result = team.run(user_prompt)

    text = ""
    if result and result.content:
        text = str(result.content).strip()

    # Widget extraction works on member RunOutputs surfaced by the team
    widgets: list[dict] = []
    try:
        if result and hasattr(result, "member_responses") and result.member_responses:
            for member_resp in result.member_responses:
                if hasattr(member_resp, "tools") and member_resp.tools:
                    widgets.extend(_extract_widgets(member_resp))
    except Exception:
        pass

    return text, widgets


def run_team_stream(
    system_prompt: str,
    user_prompt: str,
    chat_history: list[dict] | None = None,
    extra_tools: list | None = None,
    supabase_client: Any = None,
    user_id: str = "",
) -> Iterator[dict]:
    """Stream events from the Minto Team.

    Yields dicts with same shape as run_research_agent_stream:
      {"type": "token", "content": "..."}
      {"type": "tool_started", "tool_name": "..."}
      {"type": "tool_completed", "tool_name": "...", "widgets": [...]}
      {"type": "done", "content": "...", "widgets": [...]}
    """
    team = _build_minto_team(system_prompt, chat_history, extra_tools, supabase_client, user_id)

    stream = team.run(user_prompt, stream=True, stream_events=True)
    full_content = ""
    all_widgets: list[dict] = []

    for chunk in stream:
        event = getattr(chunk, "event", None)

        # Final team content (routed member response)
        if event == TeamRunEvent.run_content:
            token = chunk.content or ""
            if token:
                full_content += token
                yield {"type": "token", "content": token}

        # Member tool call started — surface to caller for UI feedback
        elif event in (TeamRunEvent.tool_call_started, RunEvent.tool_call_started):
            tool_name = ""
            if hasattr(chunk, "tool") and chunk.tool:
                tool_name = chunk.tool.tool_name or ""
            yield {"type": "tool_started", "tool_name": tool_name}

        # Member tool call completed — extract widgets immediately
        elif event in (TeamRunEvent.tool_call_completed, RunEvent.tool_call_completed):
            tool_name = ""
            tool_widgets: list[dict] = []
            if hasattr(chunk, "tool") and chunk.tool:
                tool_name = chunk.tool.tool_name or ""
                mock = RunOutput()
                mock.tools = [chunk.tool]
                tool_widgets = _extract_widgets(mock)
                all_widgets.extend(tool_widgets)
            yield {
                "type": "tool_completed",
                "tool_name": tool_name,
                "widgets": tool_widgets,
            }

        # Member intermediate content (agent streaming its response)
        elif event == TeamRunEvent.run_intermediate_content:
            token = chunk.content or ""
            if token:
                full_content += token
                yield {"type": "token", "content": token}

    yield {"type": "done", "content": full_content, "widgets": all_widgets}


def run_research_agent(
    system_prompt: str,
    user_prompt: str,
    chat_history: list[dict] | None = None,
    extra_tools: list | None = None,
    supabase_client: Any = None,
    user_id: str = "",
) -> tuple[str, list[dict]]:
    """Run the Agno research agent and return (reply_text, widgets).

    When supabase_client and user_id are provided, runs via the full Minto Team
    (enabling alert routing). Otherwise falls back to the bare research agent.
    """
    if supabase_client and user_id:
        return run_team(system_prompt, user_prompt, chat_history, extra_tools, supabase_client, user_id)

    agent = _build_research_agent(system_prompt, chat_history, extra_tools=extra_tools)
    _set_agent_history(agent, chat_history)
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
    extra_tools: list | None = None,
    supabase_client: Any = None,
    user_id: str = "",
) -> Iterator[dict]:
    """Run the Agno research agent in streaming mode.

    When supabase_client and user_id are provided, streams via the full Minto Team.
    Otherwise falls back to the bare research agent stream.

    Yields dicts with:
      {"type": "token", "content": "..."}
      {"type": "tool_started", "tool_name": "..."}
      {"type": "tool_completed", "tool_name": "...", "widgets": [...]}
      {"type": "done", "content": "...", "widgets": [...]}
    """
    if supabase_client and user_id:
        yield from run_team_stream(system_prompt, user_prompt, chat_history, extra_tools, supabase_client, user_id)
        return

    agent = _build_research_agent(system_prompt, chat_history, extra_tools=extra_tools)
    _set_agent_history(agent, chat_history)

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
