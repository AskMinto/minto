# AI Agents

Minto uses **Agno** as its agent framework with **Google Gemini** for all AI agents. All model IDs, temperatures, and limits live in `model_config.yaml`. All prompts and instructions live in `prompts.yaml`. Nothing LLM-facing is hardcoded in Python.

> For step-by-step guides on modifying agents, see [`backend/AGENTS.md`](../backend/AGENTS.md).

## Portfolio / Chat agents

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

The team leader classifies intent and routes to exactly one specialist. Research, portfolio analysis, and market data go to the Research Agent. Alert management goes to the Alert Agent.

```
backend/app/
├── agents/
│   ├── research_agent.py   # Agno Team + Research Agent builder + SSE streaming entry points
│   ├── alert_agent.py      # Alert Agent builder
│   └── risk_agent.py       # Portfolio risk analyser (structured output, no tools)
│
└── agent_tools/
    ├── research_tools.py   # get_mf_nav, get_market_overview, search_instrument, update_financial_profile
    └── alert_tools.py      # make_alert_tools() factory → create/list/cancel/widget tools
```

## Research Agent tools

| Tool | What it does |
|---|---|
| `get_current_stock_price` | Live equity price from Yahoo Finance |
| `get_company_info` | Fundamentals, sector, description |
| `get_company_news` | Latest news for a symbol |
| `get_stock_fundamentals` | PE, EPS, market cap |
| `get_analyst_recommendations` | Analyst ratings |
| `web_search` | Broad web search via DuckDuckGo |
| `search_news` | News search via DuckDuckGo |
| `read_article` | Full article text from URL |
| `get_mf_nav` | Latest NAV from MFAPI |
| `get_market_overview` | Nifty 50, Sensex, Bank Nifty |
| `search_instrument` | Search equities + MF schemes |
| `update_financial_profile` | Update user's balance sheet in Supabase |

### Widget extraction

After each Research Agent run, `_extract_widgets()` scans tool results and emits structured widget payloads in the final SSE `done` event:
- `price_summary` — from stock price and NAV tool calls (includes day change)
- `news_summary` — from news tool calls
- `alert_setup` — from `request_alert_widget` calls

## Alert Agent

**Decision rule:** call `create_alert` only when all four fields are known (display name, alert type, target value, instrument identifier). Otherwise call `request_alert_widget` — it pre-fills whatever is known and the frontend renders an interactive widget for the user to complete.

Alert types: `above`, `below`, `pct_change_up`, `pct_change_down`.

## Risk Agent

Runs on demand at dashboard load and after Zerodha import. Analyses concentration and diversification using structured output — no tools, pure reasoning on the portfolio context. Returns a `RiskAnalysis` Pydantic model with a score (0–100), risk level, and colour-coded flags.

## Voice Agent

Uses the **OpenAI Realtime API** over WebRTC. The backend token endpoint (`/chat/voice/token`):
1. Assembles full instructions (system prompt + agent instructions + voice hint) with static content first — optimised for prompt caching.
2. Fetches an ephemeral token from OpenAI.
3. Returns token + recent chat history to the frontend.

The frontend creates a WebRTC peer connection, streams audio bidirectionally, and proxies tool calls back through `/chat/voice/tool`.

## Configuration files

### `prompts.yaml`

Every string that reaches an LLM. Edit this to change agent behaviour without touching Python.

| Section | Purpose |
|---|---|
| `system_prompt` | Minto identity and rules |
| `agent_instructions` | Detailed behavioural rules for the research agent |
| `user_prompt` | Per-request context template (portfolio, memory, financial profile) |
| `guardrails` | Regex patterns: blocked phrases, safe response, disclaimer |
| `alert_agent` | Role and instructions for the alert agent |
| `team_router` | Routing rules for the Agno Team leader |
| `risk_agent` | Description and instructions for the risk agent |
| `voice_agent` | Voice-specific behavioural overlay |
| `whatsapp_tax_agent` | Full multi-section instructions for the WhatsApp tax bot |

Access from Python: `from app.core.prompts import prompts` — typed accessors for each section, plus `prompts.raw` for direct dict access.

### `model_config.yaml`

All model IDs, temperatures, and limits. Change a model name here and it propagates everywhere.

| Section | Agent |
|---|---|
| `research_agent` | Main chat agent |
| `alert_agent` | Price alert specialist |
| `team_router` | Agno Team leader |
| `risk_agent` | Portfolio risk analyser |
| `voice_agent` | OpenAI Realtime voice |
| `whatsapp_bot` | WhatsApp tax bot + document parser |

Access from Python: `from app.core.model_config import model_config`.

## Guardrails

`services/guardrails.py` checks all assistant responses against regex patterns defined in `prompts.yaml`. Blocked responses return a safe fallback. The UI shows a persistent disclaimer banner so per-message disclaimers are suppressed.

## Memory

Mem0 provides per-user long-term memory. On each chat request, recent memories are fetched and injected into the user prompt context block. After each assistant response, new facts are stored asynchronously.

---

## WhatsApp Tax Harvesting Bot

A separate Agno-powered conversational bot accessible at `POST /whatsapp/incoming`, driven entirely by WhatsApp messages via Twilio. Implements all 36 user stories from the PRD covering tax analysis, loss harvesting, and gains harvesting for FY 2025-26.

### Architecture

```
Twilio webhook → POST /whatsapp/incoming
    │
    ├── load session (Supabase wa_agent_sessions)
    │
    ├── Agno Agent (gemini-3-flash-preview)
    │   ├── save_onboarding_answer       # persist answers to session_state
    │   ├── process_uploaded_document    # download → pikepdf → Gemini parse
    │   ├── unlock_and_parse_document    # retry with user-supplied password
    │   ├── run_tax_analysis             # pure-Python netting engine
    │   ├── get_loss_harvest_plan        # MF + stock + non-equity candidates
    │   ├── get_gains_harvest_plan       # equity MF LTCG exemption candidates
    │   ├── generate_pdf_report          # ReportLab → GCS → signed URL
    │   ├── get_days_to_deadline         # March 31 countdown
    │   ├── opt_in_reminder              # schedule WhatsApp reminder
    │   ├── save_notification_contact    # name + email for blocked users
    │   ├── delete_user_data             # DPDPA right to erasure
    │   └── get_user_data_summary        # DPDPA right of access
    │
    └── save session (Supabase wa_agent_sessions)
```

### Session persistence

No direct Postgres connection needed. `whatsapp_bot/session_store.py` uses the existing service-role Supabase client to upsert `session_state` (JSONB) and a rolling window of the last 30 messages into `wa_agent_sessions`, keyed by phone number. This is the same pattern used by `alert_poller.py`.

### Document parsing

All four document types are parsed by Gemini via the File API — no `casparser` dependency for the WhatsApp bot:

| Document | Format | How parsed |
|---|---|---|
| MFCentral CAS | PDF (usually password-protected) | pikepdf decrypt → Gemini File API |
| Broker Tax P&L | CSV / Excel / PDF | Inline text or Gemini File API |
| Broker Holdings | CSV / Excel / PDF | Inline text or Gemini File API |
| ITR | PDF | Gemini File API (Schedule CFL only) |

`response_mime_type="application/json"` guarantees valid JSON back from the model. Pydantic `model_validate(strict=False)` handles any type coercions.

### Password-protected PDFs

The agent handles password collection as a multi-turn conversation:

1. User uploads PDF → `process_uploaded_document` detects encryption via pikepdf → saves `pending_doc_url` to session state → returns `NEEDS_PASSWORD`
2. Agent asks for the password over WhatsApp
3. User types password → `unlock_and_parse_document` re-downloads and decrypts → parses → clears pending state
4. Up to 3 attempts before the user is asked to re-download with a fresh password

### Tax engine

`whatsapp_bot/tax_engine.py` is pure Python, no LLM. Implements the full capital gains netting logic per the Income Tax Act:

- Section 70/71: current-year set-off (higher-taxed gains targeted first)
- Section 72: carry-forward set-off (non-exempt gains targeted first to preserve the Rs 1.25L exemption)
- Section 112A: Rs 1.25L LTCG exemption on equity gains only
- Section 87A: rebate re-check when total income crosses the threshold
- Sections 94(7)/94(8): bonus and dividend stripping checks for MF loss harvesting

25 pytest tests cover all scenarios including the complete PRD example.

### DPDPA compliance

- Privacy notice shown before the first document upload
- Raw files uploaded to GCS, deleted within 60 seconds of parsing
- `wa_documents` table tracks upload/deletion timestamps as an audit trail
- GCS bucket has a 1-day lifecycle rule as a safety net
- "Delete my data" → immediate deletion of session + audit rows
- "My data" → summary of all stored data
