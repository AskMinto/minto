# Python Backend

FastAPI service handling all data access, business logic, AI agent orchestration, external API integration, and the WhatsApp tax bot. Deployed to Google Cloud Run (asia-south1) via Docker.

## Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Database | Supabase (Postgres + RLS + Auth) |
| HTTP client | HTTPX |
| Market data | yfinance (equities), MFAPI (mutual funds) |
| CAS parsing | casparser + pdfminer-six (portfolio app); Gemini File API (WhatsApp bot) |
| PDF handling | pikepdf (password-protected PDF unlock) |
| Broker | Zerodha Kite Connect (OAuth) |
| Caching | cachetools TTLCache (in-process) |
| Scheduling | APScheduler (alert poller + WhatsApp reminders) |
| Testing | pytest + pytest-asyncio + respx |
| Deployment | Docker (Python 3.13-slim), Cloud Run |

## Directory structure

```
backend/
├── app/
│   ├── main.py               # App entry: CORS, router registration, lifespan (scheduler)
│   ├── prompts.yaml          # ALL LLM prompts, instructions, guardrail patterns
│   ├── model_config.yaml     # ALL model IDs, temperatures, limits
│   │
│   ├── agents/               # Agno agent builders
│   │   ├── research_agent.py # Main chat agent (Agno Team, route mode)
│   │   ├── alert_agent.py    # Price alert specialist
│   │   └── risk_agent.py     # Portfolio risk analyser (structured output)
│   │
│   ├── agent_tools/          # Tool functions passed to portfolio/chat agents
│   │   ├── research_tools.py
│   │   └── alert_tools.py
│   │
│   ├── whatsapp_bot/         # WhatsApp Tax Harvesting Bot (see agents.md)
│   │   ├── router.py         # POST /whatsapp/incoming + /status + /health
│   │   ├── agent.py          # Agno agent singleton
│   │   ├── tools.py          # 12 tool functions (document ingestion, tax, DPDPA)
│   │   ├── tax_engine.py     # Pure-Python capital gains computation (no LLM)
│   │   ├── llm_doc_parser.py # Gemini File API: CAS / broker P&L / holdings / ITR
│   │   ├── document_parser.py# Twilio download, pikepdf unlock, GCS audit
│   │   ├── session_store.py  # Supabase-backed session persistence
│   │   ├── models.py         # Pydantic output schemas for all document types
│   │   ├── gcs_client.py     # GCS upload/delete (DPDPA raw-file compliance)
│   │   ├── report_generator.py # ReportLab PDF report (Schedule CG format)
│   │   └── reminder_scheduler.py # Daily 9AM IST WhatsApp reminder job
│   │
│   ├── routers/              # REST API route handlers
│   │   ├── chats.py          # Chat messages, SSE stream, voice token
│   │   ├── holdings.py       # Portfolio holdings CRUD
│   │   ├── dashboard.py      # Portfolio analytics + risk
│   │   ├── alerts.py         # Price alerts CRUD
│   │   ├── market.py         # Instrument search, quotes, news
│   │   ├── risk.py           # Risk onboarding (ack + quiz)
│   │   ├── cas.py            # CAS PDF upload + confirmation
│   │   ├── zerodha.py        # Kite Connect OAuth + import
│   │   └── financial_profiles.py
│   │
│   ├── services/             # Business logic
│   │   ├── portfolio.py      # Compute totals, PnL, splits, look-through analysis
│   │   ├── yfinance_service.py
│   │   ├── mfapi_service.py
│   │   ├── alert_poller.py   # APScheduler: poll + fire price alerts every 5 min
│   │   ├── whatsapp.py       # send_whatsapp_alert() via Twilio
│   │   ├── guardrails.py     # Blocked phrases, disclaimer
│   │   ├── fund_weights.py   # MF sector/mcap look-through weights
│   │   ├── cas_parser.py     # CAS PDF parsing (portfolio import flow)
│   │   ├── kite_service.py
│   │   ├── mem0.py
│   │   └── financial_profile.py
│   │
│   └── core/
│       ├── config.py         # Env var loader (all secrets read here)
│       ├── auth.py           # JWT verification via Supabase /auth/v1/user
│       ├── prompts.py        # Typed accessors for prompts.yaml + .raw dict
│       └── model_config.py   # Typed accessors for model_config.yaml
│
├── sql/
│   ├── schema.sql            # Full schema (reference)
│   └── migrations/           # Sequential migration files (run in order on Supabase)
│
└── tests/                    # pytest suite
```

## Auth pattern

Every protected endpoint uses:

```python
user: UserContext = Depends(get_user_context)
```

`get_user_context` verifies `Authorization: Bearer <token>` against Supabase `/auth/v1/user` and returns `UserContext(user_id, token)`. That token is used to create a per-request Supabase client, so all DB queries are automatically scoped to the authenticated user via RLS.

Background jobs (alert poller, WhatsApp session store) use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS — never use this in user-facing handlers.

## API routes

| Prefix | Purpose |
|---|---|
| `/chat` | Messages, SSE stream, voice token, voice tool proxy |
| `/holdings` | Portfolio holdings CRUD |
| `/dashboard` | Portfolio analytics, concentration risk |
| `/alerts` | Price alerts CRUD |
| `/instruments` | Search, quotes, instrument detail, MF detail |
| `/risk` | Risk acknowledgment, quiz, profile |
| `/cas` | CAS PDF upload and parse confirmation |
| `/zerodha` | Kite Connect OAuth, import holdings |
| `/financial-profile` | Upsert financial profile |
| `/whatsapp` | WhatsApp Tax Bot webhooks (incoming, status, health) |

## Background scheduler

`main.py` starts an `AsyncIOScheduler` via the FastAPI `lifespan` context manager. Two jobs run on it:

- **Alert poller** (`services/alert_poller.py`) — every 5 minutes, checks active price alerts and fires notifications into the user's chat thread when conditions are met.
- **WhatsApp reminders** (`whatsapp_bot/reminder_scheduler.py`) — daily at 9:00 AM IST, sends tax plan reminders to opted-in users.

Both jobs use the service-role Supabase client to bypass RLS. The scheduler requires `SUPABASE_SERVICE_ROLE_KEY`.

## Caching

All external API calls are TTL-cached in-process via `cachetools.TTLCache`. Don't add calls to yfinance or MFAPI in request handlers without going through the service layer — the caches live there.

| Data | TTL |
|---|---|
| Stock quotes | 30s |
| yfinance search | 60s |
| Company news | 5 min |
| Failed symbol lookups | 10 min |
| MF NAV | 5 min |
| MF scheme search | 60s |

## Environment variables

All env vars are loaded in `backend/app/core/config.py`. For local dev, put them in a `.env` file at the repo root.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project REST URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — background jobs only |
| `SUPABASE_JWT_SECRET` | For service-role JWT construction |
| `GEMINI_API_KEY` | Google Gemini (also exported as `GOOGLE_API_KEY` for Agno) |
| `OPENAI_API_KEY` | OpenAI Realtime API (voice) — from Secret Manager |
| `MEM0_API_KEY` | Mem0 long-term memory |
| `KITE_API_KEY` / `KITE_API_SECRET` | Zerodha Kite Connect |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio — from Secret Manager |
| `TWILIO_WHATSAPP_FROM` | Twilio sender number (e.g. `whatsapp:+14155238886`) |
| `GCS_BUCKET_NAME` | GCS bucket for WhatsApp document DPDPA compliance |

## Running locally

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

## Running tests

```bash
cd backend
pytest
```

Test files: `test_guardrails`, `test_portfolio`, `test_yfinance_service`, `test_cas_parser`, `test_mfapi_service`, `test_tax_engine`. Three pre-existing failures in `test_guardrails` are a known gap in guardrail pattern coverage, not regressions.

## Deployment

Push to `main` triggers Cloud Build via `cloudbuild.yaml`:

1. `docker build` from `backend/Dockerfile`
2. `docker push` to Google Container Registry
3. `gcloud run deploy minto-api` (asia-south1) with env vars inline and secrets pulled from GCP Secret Manager at deploy time

`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, and `TWILIO_AUTH_TOKEN` come from Secret Manager — never hardcode them.
