# Python Backend

The backend is a **FastAPI** service that handles all data access, business logic, AI agent orchestration, and external API integration. It is deployed to **Google Cloud Run** (asia-south1) via Docker.

## Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.133, Uvicorn 0.41 |
| Database | Supabase (Postgres + RLS + Auth) |
| HTTP client | HTTPX 0.28 |
| Market data | yfinance 1.2 (equities), MFAPI (mutual funds) |
| CAS parsing | casparser 0.8.1, pdfminer-six |
| Broker | Zerodha Kite Connect (OAuth) |
| Caching | cachetools TTLCache |
| Scheduling | APScheduler 3.10 (alert poller) |
| Testing | pytest 9.0, pytest-asyncio, respx |
| Deployment | Docker (Python 3.13-slim), Cloud Run |

## Directory structure

```
backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, router registration, lifespan
│   ├── prompts.yaml          # All LLM prompts and instructions
│   ├── model_config.yaml     # All model IDs and runtime config
│   │
│   ├── agents/               # Agent orchestration
│   │   ├── research_agent.py
│   │   ├── alert_agent.py
│   │   └── risk_agent.py
│   │
│   ├── agent_tools/          # Tool definitions passed to agents
│   │   ├── research_tools.py
│   │   └── alert_tools.py
│   │
│   ├── routers/              # API route handlers
│   │   ├── chats.py          # Chat, SSE streaming, voice token
│   │   ├── holdings.py       # Portfolio holdings CRUD
│   │   ├── dashboard.py      # Portfolio analytics + risk analysis
│   │   ├── alerts.py         # Price alerts CRUD
│   │   ├── market.py         # Instrument search, quotes, news
│   │   ├── risk.py           # Risk onboarding (ack + quiz)
│   │   ├── cas.py            # CAS PDF upload and parsing
│   │   ├── zerodha.py        # Kite Connect OAuth + import
│   │   └── financial_profiles.py
│   │
│   ├── services/             # Business logic (non-agent)
│   │   ├── portfolio.py      # Compute totals, PnL, splits, look-through
│   │   ├── yfinance_service.py
│   │   ├── mfapi_service.py
│   │   ├── alert_poller.py   # APScheduler background job
│   │   ├── guardrails.py     # Blocked phrases, disclaimer
│   │   ├── fund_weights.py   # MF sector/mcap look-through weights
│   │   ├── cas_parser.py
│   │   ├── kite_service.py
│   │   ├── mem0.py
│   │   └── financial_profile.py
│   │
│   └── core/
│       ├── config.py         # Env var loader
│       ├── auth.py           # JWT verification via Supabase
│       ├── prompts.py        # Typed accessors for prompts.yaml
│       └── model_config.py   # Typed accessors for model_config.yaml
│
├── sql/
│   ├── schema.sql
│   └── migrations/           # 001–004
│
└── tests/                    # pytest test suite
```

## Auth pattern

Every protected endpoint depends on `get_user_context`:

```python
user: UserContext = Depends(get_user_context)
```

This verifies the `Authorization: Bearer <token>` header against the Supabase `/auth/v1/user` endpoint and returns a `UserContext(user_id, token)`. The token is then used to create a per-request Supabase client that scopes all queries to the authenticated user via RLS.

## Routers

| Prefix | Purpose |
|---|---|
| `/chat` | Messages, SSE stream, voice token, voice tool proxy |
| `/holdings` | CRUD for portfolio holdings |
| `/dashboard` | Portfolio analytics, concentration risk |
| `/alerts` | Price alerts CRUD |
| `/instruments` | Search, quotes, instrument detail, MF detail |
| `/risk` | Risk acknowledgment, quiz, profile |
| `/cas` | CAS PDF upload and parse confirmation |
| `/zerodha` | Kite Connect OAuth, import holdings |
| `/financial-profile` | Upsert financial profile |

## Caching strategy

| Data | Cache TTL |
|---|---|
| Stock quotes | 30 seconds |
| yfinance search | 60 seconds |
| Company news | 300 seconds |
| Failed symbol lookups | 600 seconds |
| MF NAV | 300 seconds |
| MF scheme search | 60 seconds |

## Alert poller

`services/alert_poller.py` runs an `AsyncIOScheduler` job every 5 minutes inside the FastAPI process. On each tick it:

1. Fetches all `status = 'active'` rows from `price_alerts` using the **service-role key** (bypasses RLS).
2. Fetches the current price via `yfinance_service.get_quote()` (equities) or `mfapi_service.get_latest_nav()` (MFs).
3. If the condition is met, marks the alert `triggered` and writes a notification message into the user's most-recent chat thread.

The scheduler is started and stopped via the FastAPI `lifespan` context manager in `main.py`. It requires `SUPABASE_SERVICE_ROLE_KEY` in the environment.

## Environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (alert poller, bypasses RLS) |
| `SUPABASE_JWT_SECRET` | For service-role JWT construction |
| `GEMINI_API_KEY` | Google Gemini (also set as `GOOGLE_API_KEY` for Agno) |
| `OPENAI_API_KEY` | OpenAI Realtime API (voice) |
| `MEM0_API_KEY` | Mem0 long-term memory |
| `KITE_API_KEY` / `KITE_API_SECRET` | Zerodha Kite Connect |
| `YFINANCE_MAX_RESULTS` | Search result limit (default 12) |

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

Five test files cover guardrails, portfolio computation, yfinance normalization, CAS parsing, and MFAPI service. Three pre-existing failures in `test_guardrails.py` are a known gap in the guardrail pattern coverage — not caused by any recent changes.

## Deployment

The backend deploys to Cloud Run via `cloudbuild.yaml`:

1. `docker build` the image from `backend/Dockerfile` (Python 3.13-slim, uvicorn on port 8080).
2. `docker push` to Google Container Registry.
3. `gcloud run deploy minto-api` with env vars and secrets from Secret Manager.

Secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are injected via `--set-secrets` and pulled from GCP Secret Manager at deploy time.
