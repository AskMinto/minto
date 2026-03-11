# AI Agents

Minto uses **Agno** as its agent framework with **Google Gemini** (`gemini-3-flash-preview`) for all chat agents and **OpenAI Realtime API** (`gpt-realtime-1.5`) for voice. All agent configuration and prompts are externalised to YAML — no model names or instruction strings live in Python code.

> For the full agent reference including step-by-step guides for making changes, see [`backend/AGENTS.md`](../backend/AGENTS.md).

## Architecture overview

```
User message
    │
    ▼
Agno Team (route mode) — Gemini leader
    │
    ├── Research Agent ──► YFinance, DuckDuckGo, Newspaper4k, MF NAV, Market Overview, Search, Profile Update
    │
    └── Alert Agent ──────► create_alert, list_alerts, cancel_alert, request_alert_widget
```

The **team leader** classifies the user's intent and routes to exactly one specialist. Research questions, portfolio analysis, and market data go to the Research Agent. Alert management (create, list, cancel, incomplete alert requests) goes to the Alert Agent.

## Directory layout

```
backend/app/
├── agents/
│   ├── research_agent.py   # Agno Team + Research Agent builder + streaming entry points
│   ├── alert_agent.py      # Alert Agent builder (thin — delegates tools to agent_tools/)
│   └── risk_agent.py       # Portfolio risk analysis agent (structured output, no tools)
│
└── agent_tools/
    ├── research_tools.py   # get_mf_nav, get_market_overview, search_instrument, make_profile_update_tool
    └── alert_tools.py      # make_alert_tools() → (create_alert, list_alerts, cancel_alert, request_alert_widget)
```

## Configuration files

### `backend/app/prompts.yaml`

Every string that reaches an LLM. Sections:

- `system_prompt` — Minto identity and rules
- `agent_instructions` — detailed behavioural rules for the research agent
- `user_prompt` — template for assembling per-request context (portfolio, memory, financial profile)
- `guardrails` — regex patterns for blocked phrases, safe response, disclaimer
- `alert_agent` — role and instructions for the alert agent
- `team_router` — routing rules for the Agno Team leader
- `risk_agent` — description and instructions for the risk analysis agent
- `voice_agent` — voice-specific behavioural hint

### `backend/app/model_config.yaml`

Every model ID, temperature, and limit. Sections: `research_agent`, `alert_agent`, `team_router`, `risk_agent`, `voice_agent`. **Change a model here and it propagates everywhere — no Python edits needed.**

## Research Agent

The main chat agent. Handles market data, portfolio Q&A, financial news, and company research.

**Tools:**

| Tool | Source | What it does |
|---|---|---|
| `get_current_stock_price` | YFinanceTools (Agno built-in) | Live equity price |
| `get_company_info` | YFinanceTools | Fundamentals, sector, description |
| `get_company_news` | YFinanceTools | Latest news for a symbol |
| `get_stock_fundamentals` | YFinanceTools | PE, EPS, market cap, etc. |
| `get_analyst_recommendations` | YFinanceTools | Analyst ratings |
| `web_search` | DuckDuckGoTools | Broad web search (in-en region) |
| `search_news` | DuckDuckGoTools | News search |
| `read_article` | Newspaper4kTools | Full article content from URL |
| `get_mf_nav` | `research_tools.py` | Latest NAV from MFAPI |
| `get_market_overview` | `research_tools.py` | Nifty 50, Sensex, Bank Nifty |
| `search_instrument` | `research_tools.py` | Search equities + MF schemes |
| `update_financial_profile` | `research_tools.py` | Update user's balance sheet in Supabase |

**Widget extraction:**

After each run, `_extract_widgets()` scans tool execution results and produces:
- `price_summary` widget — from `get_current_stock_price` and `get_mf_nav` calls (includes day change via cached `get_quote()`)
- `news_summary` widget — from `get_company_news` calls
- `alert_setup` widget — from `request_alert_widget` calls (alert agent only)

Widgets are delivered to the frontend in the final SSE `done` event.

## Alert Agent

Handles all alert management intents routed by the team leader.

**Decision rule (from `prompts.yaml`):**
- Call `create_alert` only when display name, alert type, target value, and instrument identifier are all known.
- Call `request_alert_widget` in all other cases — missing info, ambiguous intent, or bare "set an alert" requests. Prefill whatever is known, leave the rest null. The frontend renders an interactive widget for the user to complete.

**Alert types:** `above` (price exceeds threshold), `below` (price drops below threshold), `pct_change_up` (rises by X% in a day), `pct_change_down` (falls by X% in a day).

## Risk Agent

Runs on demand (dashboard load, Zerodha import). Analyses portfolio concentration and diversification using structured output — returns a `RiskAnalysis` Pydantic model with a risk score (0–100), risk level, concentration flags (red/yellow/green), diversification notes, and a summary.

Uses `tool_call_limit: 0` — no tools, pure reasoning on the portfolio context passed as `additional_context`.

## Voice Agent

Uses the **OpenAI Realtime API** over WebRTC. The session is created via a backend token endpoint (`/chat/voice/token`) which:

1. Loads portfolio context, memory, and financial profile.
2. Assembles `full_instructions` with static content first (system prompt, agent instructions, voice hint) and dynamic context last — optimised for prompt caching at $0.40/M tokens.
3. Requests an ephemeral token from OpenAI with model `gpt-realtime-1.5`, voice `verse`, and Whisper transcription.
4. Returns the token + recent chat history to the frontend.

The frontend establishes a WebRTC connection and sends tool call results back via a `/chat/voice/tool` endpoint.

## Guardrails

`services/guardrails.py` checks all assistant responses against 15 regex patterns defined in `prompts.yaml`. Matches block the response and return a safe fallback. The app UI shows a persistent disclaimer banner so per-message disclaimers are suppressed.

## Memory

Mem0 integration stores and retrieves per-user conversation summaries. Memory is injected into the user prompt context block on every request.
