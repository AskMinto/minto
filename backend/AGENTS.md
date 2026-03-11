# Minto — Agents Guide

This document covers the agent architecture, directory layout, configuration files, and the exact steps required to make changes to any AI agent in the backend.

---

## Directory Structure

```
backend/app/
├── agents/                     # Agent orchestration — builds agents, runs them, handles streaming
│   ├── research_agent.py       # Main chat agent + Agno Team (route mode) + streaming entry points
│   ├── alert_agent.py          # Alert specialist agent (create / list / cancel price alerts)
│   └── risk_agent.py           # Portfolio risk analysis agent (structured output, no tools)
│
├── agent_tools/                # Tool definitions — pure callables passed to agents
│   ├── research_tools.py       # get_mf_nav, get_market_overview, search_instrument, make_profile_update_tool
│   └── alert_tools.py          # make_alert_tools() → (create_alert, list_alerts, cancel_alert)
│
├── core/
│   ├── prompts.py              # Typed accessors for prompts.yaml (prompts singleton)
│   ├── model_config.py         # Typed accessors for model_config.yaml (model_config singleton)
│   └── config.py               # Env var loader (Supabase, API keys, etc.)
│
├── prompts.yaml                # ALL prompts, instructions, guardrail patterns — one file
├── model_config.yaml           # ALL model IDs and runtime config (temperature, limits) — one file
│
└── services/                   # Non-agent business logic (portfolio, yfinance, mfapi, etc.)
```

---

## The Two Config Files

### `prompts.yaml` — prompts only

Every string that gets sent to an LLM lives here. No model names, no temperatures.

| Section | What it contains |
|---|---|
| `system_prompt` | Minto identity, rules, risk profile section |
| `agent_instructions` | Detailed behavioural rules for the research agent |
| `user_prompt` | Template sections for user message assembly |
| `guardrails` | Blocked phrase patterns, safe response, disclaimer strip patterns |
| `alert_agent` | Role description + instructions for the alert agent |
| `team_router` | Routing instructions for the Agno Team leader |
| `risk_agent` | Description + full instructions for the risk analysis agent |
| `voice_agent` | Voice-specific behavioural hint appended to the voice session |

Access in Python:
```python
from app.core.prompts import prompts

prompts.agent_instructions          # list[str]
prompts.voice_agent_hint            # str
prompts.alert_agent_instructions    # list[str]
prompts.team_router_instructions    # list[str]
prompts.build_system_prompt(risk_profile)   # assembled str
prompts.build_user_prompt(...)              # assembled str
```

### `model_config.yaml` — model config only

Every model ID, temperature, and runtime limit lives here. No prompt strings.

| Section | What it contains |
|---|---|
| `defaults` | Shared values (timezone) |
| `research_agent` | model, temperature, tool_call_limit, max_history_messages, max_holdings_in_prompt, max_assistant_message_length |
| `alert_agent` | model, temperature |
| `team_router` | model, temperature |
| `risk_agent` | model, temperature, tool_call_limit |
| `voice_agent` | model, voice, input_audio_transcription_model, turn_detection |

Access in Python:
```python
from app.core.model_config import model_config

model_config.research_agent["model"]        # "gemini-3-flash-preview"
model_config.voice_agent["model"]           # "gpt-realtime-1.5"
model_config.voice_agent["voice"]           # "verse"
model_config.timezone                       # "Asia/Kolkata"
```

**To change a model**, edit `model_config.yaml` only — no Python changes needed.

---

## Agent Responsibilities

### Research Agent (`agents/research_agent.py`)
The main chat agent. Handles all market data, portfolio, news, and financial Q&A. Runs inside a route-mode Agno Team alongside the Alert Agent. Entry points used by routers:
- `run_research_agent(...)` — synchronous, returns `(reply_text, widgets)`
- `run_research_agent_stream(...)` — generator, yields SSE-shaped event dicts

When `supabase_client` and `user_id` are passed, both functions automatically route through the full Agno Team (enabling alert intent routing). Without them, the bare research agent is used directly.

### Alert Agent (`agents/alert_agent.py`)
Handles alert management intents routed by the Team leader. Thin file — builds an `Agent` with tools from `agent_tools/alert_tools.py`. No streaming; the Team surfaces its response as content.

### Risk Agent (`agents/risk_agent.py`)
Runs portfolio concentration analysis on demand (triggered by dashboard load and Zerodha import). Uses structured output (`RiskAnalysis` Pydantic model), no tools, no streaming. Entry point: `run_risk_analysis(portfolio, financial_profile)`.

---

## Tool Responsibilities

### `agent_tools/research_tools.py`
Pure functions — no Agno imports, no state. Passed directly to the Agno research agent as callable tools. Also imported directly by the voice tool proxy in `routers/chats.py`.

| Function | What it does |
|---|---|
| `get_mf_nav(scheme_code)` | Fetches latest NAV from MFAPI |
| `get_market_overview()` | Fetches Nifty 50 / Sensex / Bank Nifty via yfinance |
| `search_instrument(query)` | Searches equities (yfinance) + MF schemes (MFAPI) |
| `make_profile_update_tool(supabase_client, user_id)` | Factory — returns a closure that updates the user's financial profile in Supabase |

### `agent_tools/alert_tools.py`
Closure factories — tools capture `supabase_client` and `user_id` at build time.

| Function | What it does |
|---|---|
| `make_alert_tools(supabase_client, user_id)` | Returns `(create_alert, list_alerts, cancel_alert)` — three Supabase-backed callables |

---

## How to Make Changes

### Change a model or temperature
Edit `model_config.yaml` only. The change propagates to all agents automatically on next request (YAML is `lru_cache`-loaded; restart the server to pick up changes in production).

### Change agent instructions or system prompt
Edit `prompts.yaml` only. Same cache behaviour — restart to reload in production. Use `prompts.reload()` to hot-reload in development without restarting.

### Add a new tool to the research agent
1. Add the function to `agent_tools/research_tools.py`.
2. Import it in `agents/research_agent.py` and add it to `all_tools` in `_build_research_agent`.
3. If the tool should be available to the voice agent, add its declaration to the `tools` list in the `/chat/voice/token` handler in `routers/chats.py`, and add a matching `elif payload.name == "..."` case in the `/chat/voice/tool` handler.

### Add a new agent
1. Create `agents/your_agent.py`. Import model config from `model_config` and prompts from `prompts`. Add a new section to each YAML file for the agent's config and instructions.
2. If the agent needs its own tools, create `agent_tools/your_tools.py`.
3. If it should participate in the chat Team, add it to `_build_minto_team` in `agents/research_agent.py` and add routing rules to `team_router.instructions` in `prompts.yaml`.
4. If it has a dedicated endpoint, create `routers/your_router.py` and register it in `main.py`.

### Change the chat routing logic
Edit the `team_router.instructions` list in `prompts.yaml`. The Team leader (Gemini) uses these instructions to decide which agent to route to. No Python changes needed.

### Add a guardrail pattern
Add a regex string to `guardrails.blocked_patterns` in `prompts.yaml`. Patterns are applied case-insensitively by `services/guardrails.py`.

---

## Widget Extraction

Widgets (price summaries, news) are extracted from research agent tool results during streaming. The extraction logic lives in `_extract_widgets` in `agents/research_agent.py`. It matches on tool names:
- `get_current_stock_price` → price widget (fetches day change from `yfinance_service` cache)
- `get_mf_nav` → MF NAV widget
- `get_company_news` → news widget

Widgets are accumulated during streaming and delivered to the frontend in the final `done` SSE event alongside the full response text.

---

## Running Tests

```bash
cd backend
pytest
```

Test files live in `backend/tests/`. The `test_guardrails.py` file has 3 pre-existing failures unrelated to agent structure (guardrail pattern coverage gap). All other tests pass.
