# Project Knowledge Base

## gstack

gstack is installed globally at `~/.cosine/skills/gstack`.

**Web browsing — always use `/browse`**: Never use built-in browser tools or web search tools directly. Always use the `$gstack-browse` skill (i.e. prefix your prompt with `$gstack-browse`) for any web browsing, URL reading, or web research tasks.

**Available skills:**

| Skill | Purpose |
|---|---|
| `/browse` | Web browsing — use this instead of browser/websearch tools |
| `/office-hours` | Async advice and review from the team |
| `/plan-ceo-review` | CEO review of a plan |
| `/plan-eng-review` | Engineering review of a plan |
| `/plan-design-review` | Design review of a plan |
| `/design-consultation` | Design consultation |
| `/review` | Code and implementation review |
| `/ship` | Ship a feature end-to-end |
| `/qa` | Full QA pass |
| `/qa-only` | QA without implementation |
| `/design-review` | Design review |
| `/setup-browser-cookies` | Set up browser session cookies |
| `/retro` | Run a retrospective |
| `/investigate` | Investigate a bug or issue |
| `/document-release` | Document a release |
| `/codex` | Codex-specific workflows |
| `/careful` | Extra-careful mode for sensitive changes |
| `/freeze` | Freeze a file or directory from edits |
| `/guard` | Guard mode — protect critical paths |
| `/unfreeze` | Unfreeze a frozen file or directory |
| `/gstack-upgrade` | Upgrade gstack to the latest version |



## 1. Project Overview
- **Purpose**: Multi-platform app ("Minto") for portfolio tracking and conversational financial insights. Users authenticate with Supabase, import holdings (manual add, CAS PDF upload, or Zerodha import), complete financial profiling, view portfolio analytics, and chat with an AI research agent.
- **Target users**: Retail investors managing Indian market portfolios (NSE/BSE equities + mutual funds) who want analytics, risk profiling, financial planning, and conversational help.
- **Key features**:
  - Supabase-authenticated onboarding (risk acknowledgment + risk quiz + optional Zerodha import).
  - Financial profiling wizard (17-step conversational flow computing NISM-prescribed ratios, balance sheet, cash flow analysis, goal mapping).
  - Portfolio holdings management (manual add, CAS PDF upload, Zerodha Kite Connect import).
  - Dashboard analytics (totals, top holdings, sector/mcap/asset splits, concentration risk flags).
  - Conversational chat with SSE streaming, Agno-based research agent (YFinance, DuckDuckGo, Newspaper4k tools), memory, guardrails, and inline widgets (price summaries, news).
  - Price alerts: users set price/percentage-move thresholds via chat or the Alerts page; a background poller fires notifications into the chat thread when conditions are met.
  - Market search with instrument detail pages (equities with charts + MFs with NAV history).
  - Mutual fund data via MFAPI (NAV, history, scheme search, ISIN resolution).

## 2. Architecture Overview
- **Mobile frontend**: Expo + React Native app using Expo Router for navigation. Uses Supabase auth and a custom API client to call the backend.
- **Web frontend**: Next.js 15 app with SSR Supabase auth (@supabase/ssr), Tailwind CSS v4, recharts. Proxies API calls via `/api/proxy` rewrites to avoid CORS.
- **Backend**: FastAPI service providing portfolio, chat, risk, market, CAS, Zerodha, and financial profile endpoints. Uses Supabase for data storage with RLS policies. Integrates external services.
- **Data flow**:
  - Clients authenticate with Supabase → access token is attached to backend API calls.
  - Backend verifies JWT via Supabase `/auth/v1/user` endpoint → uses Supabase client with user JWT to read/write data.
  - Portfolio analytics use holdings data + Yahoo Finance quotes + MFAPI NAV data.
  - Chat flow: user message → portfolio snapshot + news + Mem0 memory → Agno Team (route mode) → Research Agent or Alert Agent → guardrails filter → widget extraction → SSE stream to client → persist messages/memory.
  - Alert flow: APScheduler polls active alerts every 5 minutes → fetches live prices (yfinance/MFAPI) → on condition match, marks alert triggered and injects a notification message into the user's chat thread via service-role Supabase client.
- **External dependencies**:
  - **Supabase** (auth + Postgres + RLS).
  - **Yahoo Finance** (quotes/search/news via yfinance, cached with TTL).
  - **MFAPI** (mutual fund NAV, scheme search, NAV history).
  - **Google Gemini** (`gemini-3-flash-preview` model via Agno framework).
  - **Agno** (AI agent framework — route-mode Team with Research Agent + Alert Agent; YFinance, Newspaper4k, DuckDuckGo tools).
  - **Mem0** (long-term chat memory per user).
  - **Zerodha Kite Connect** (OAuth-based holdings/positions/MF import).

## 3. Tech Stack
- **Languages**: TypeScript (frontends), Python (backend).
- **Mobile frontend**: Expo ~54, React 19, React Native 0.81, Expo Router ~6, Supabase JS client ^2.97, react-native-reanimated ~4.1, lucide-react-native ^0.575, react-native-svg 15.12, react-native-markdown-display ^7.0, expo-linear-gradient ~15.0, expo-document-picker ~14.0, DM Sans font (@expo-google-fonts/dm-sans).
- **Web frontend**: Next.js ^15.1, React ^19.0, Tailwind CSS v4, @supabase/ssr ^0.5, recharts ^2.15, react-markdown ^9.0, lucide-react ^0.470, clsx + tailwind-merge.
- **Backend**: FastAPI 0.133, Uvicorn 0.41, Supabase Python 2.28, HTTPX 0.28, cachetools 6.2, apscheduler 3.10.4.
- **LLM/AI**: google-generativeai 0.8.6, google-genai 1.65, agno 2.5.5 (agent framework), newspaper4k 0.9.4 (article reading), ddgs 9.10 (DuckDuckGo search).
- **Market data**: yfinance 1.2 (equities), MFAPI (mutual funds via httpx).
- **CAS parsing**: casparser 0.8.1, pdfminer-six.
- **Broker integration**: Zerodha Kite Connect (via httpx, OAuth flow).
- **Testing**: pytest 9.0 + pytest-asyncio + respx (backend), react-test-renderer (mobile snapshot).
- **Build/package managers**: pnpm (mobile, pnpm-lock.yaml), npm (web-app), pip (backend requirements.txt).
- **Deployment**: Google Cloud Build → Cloud Run (asia-south1), Docker (Python 3.13-slim).

## 4. Directory Structure
- `app/`: Expo Router mobile screens and routes.
  - `(tabs)/`: Bottom tab screens (home, dashboard, search, profile).
  - `(onboarding)/`: Onboarding flow (risk-ack, risk-quiz, connect-zerodha).
  - `chat/`: Chat screen with SSE streaming.
  - `portfolio/`: Holdings management (list, add, connections).
  - `instrument/`: Instrument detail screens ([symbol].tsx for equities, mf/[code].tsx for MFs).
- `components/`: Shared mobile UI components (AnimatedGradient, Themed, StyledText, hooks).
- `constants/`: Theme.ts (design system: colors, radii, fonts), Colors.ts (legacy light/dark).
- `lib/`: Mobile API client (api.ts with apiStream SSE via XHR), Supabase client, onboarding context.
- `web-app/`: Next.js 15 web application.
  - `src/app/`: Pages and routes (login, onboarding, (app) authenticated area).
  - `src/app/(app)/`: Chat, dashboard, holdings, search, settings pages.
  - `src/app/onboarding/`: Risk ack, risk quiz, financial profile wizard.
  - `src/components/`: UI components (chat, dashboard, holdings, search, layout, ui primitives).
  - `src/hooks/`: Custom hooks (use-chat, use-dashboard, use-holdings, use-search, use-alerts).
  - `src/lib/`: API client (with proxy), SSE streaming (fetch ReadableStream), Supabase (browser + SSR + middleware), formatters, fund classifier, constants.
- `backend/`: FastAPI backend.
  - `app/main.py`: FastAPI app with CORS, 9 routers registered; APScheduler started/stopped via `lifespan` context manager.
  - `app/routers/`: API endpoints (risk, holdings, cas, chats, market, dashboard, zerodha, financial_profiles, alerts).
  - `app/services/`: Business logic (portfolio, fund_weights, cas_parser, gemini, research_agent, alert_agent, alert_poller, guardrails, mem0, yfinance_service, mfapi_service, kite_service).
  - `app/prompts.yaml`: Single source of truth for all prompts, agent instructions, guardrail patterns, and agent config (including `alert_agent` and `team_router` sections).
  - `app/core/`: config.py (env loader), auth.py (JWT verification), prompts.py (YAML prompt loader — exposes `prompts.raw` for direct YAML section access).
  - `scripts/`: Utility scripts (backfill_holdings.py for enriching holdings with missing sector/mcap data).
  - `app/db/`: Supabase client wrapper.
  - `tests/`: pytest test files (guardrails, portfolio, yfinance, cas_parser, mfapi).
  - `sql/`: schema.sql (9 tables + RLS), migrations (001–004), seed data.
  - `Dockerfile`: Python 3.13-slim, uvicorn on port 8080.
- `summaries/`: Documentation (chat-agent-context-flow.md — detailed breakdown of how context is assembled and passed to the chat agent).
- `assets/`: Fonts (SpaceMono) and images (icon, splash, minto.png).
- `exper/`: Experimental scripts (yfinance probe).
- `ios/`: iOS native project artifacts.
- `cloudbuild.yaml`: GCP Cloud Build deployment config.

## 5. Key Entry Points
- **Mobile frontend**:
  - `app/_layout.tsx`: Root navigation + auth/onboarding gating + animated gradient background.
  - `app/(tabs)/_layout.tsx`: Custom animated bottom tab bar (4 tabs + expandable chat input).
  - `app/index.tsx`: "Ask Minto" home screen with greeting, market badges, commentary.
  - `app/login.tsx`: Google OAuth login via Supabase + expo-web-browser.
  - `app/(onboarding)/connect-zerodha.tsx`: Zerodha portfolio import during onboarding.
  - `app/instrument/[symbol].tsx`: Equity detail with 30-day chart, stats, news.
  - `app/instrument/mf/[code].tsx`: Mutual fund detail with NAV chart, returns, fund info.
- **Web frontend**:
  - `web-app/src/app/layout.tsx`: Root layout with DM Sans font, AuthProvider.
  - `web-app/src/app/(app)/layout.tsx`: Auth guard with onboarding state (risk ack, quiz, financial profile).
  - `web-app/src/app/(app)/chat/page.tsx`: Chat with SSE streaming, markdown, widgets.
  - `web-app/src/app/(app)/dashboard/page.tsx`: Portfolio dashboard with recharts donut charts.
  - `web-app/src/app/(app)/settings/page.tsx`: Profile settings, Zerodha connection (popup OAuth).
  - `web-app/src/app/(app)/alerts/page.tsx`: Price alerts management — list active alerts, create new alerts (equity or MF, four condition types), cancel alerts.
  - `web-app/src/app/onboarding/financial-profile/page.tsx`: 17-step conversational financial profiling wizard (1589 lines).
- **Backend**:
  - `backend/app/main.py`: FastAPI app with CORS (allow all origins), 9 routers; lifespan context manager starts/stops APScheduler.
- **API endpoints (overview)**:
  - `/risk/ack`, `/risk/quiz`, `/risk/profile` (risk onboarding).
  - `/holdings` CRUD.
  - `/cas/upload`, `/cas/confirm` (CAS PDF ingestion).
  - `/dashboard`, `/risk/concentration` (portfolio analytics).
  - `/instruments/search`, `/prices/quote`, `/instruments/{symbol}/detail`, `/mf/{scheme_code}/detail`, `/news` (market data).
  - `/chat/home-context`, `/chat/messages`, `/chat/message`, `/chat/message/stream` (chat with SSE).
  - `/zerodha/redirect`, `/zerodha/login-url`, `/zerodha/callback`, `/zerodha/status` (Zerodha integration).
  - `/financial-profile` POST (upsert financial profile).
  - `/alerts` GET/POST, `/alerts/{id}` DELETE (price alerts CRUD).

## 6. Core Concepts
- **Risk onboarding**: Users must accept a disclaimer and complete a risk quiz; stored in `risk_acknowledgments` and `risk_profiles` tables.
- **Financial profiling**: 17-step conversational wizard computing NISM-prescribed financial ratios (DTI, solvency, liquidity, savings ratio), personal balance sheet, cash flow analysis, ESOP concentration analysis, suggested allocation, and goal mapping. Stored in `financial_profiles` table.
- **Holdings**: Central portfolio records, created manually, via CAS upload, or Zerodha import; enriched with pricing data for analytics. Supports both equities (symbol/ISIN) and mutual funds (scheme_code/scheme_name/fund_house).
- **Portfolio analytics**: `services/portfolio.py` computes totals, PnL, splits, top holdings, and concentration risk flags. Uses **look-through analysis** for mutual funds — instead of labelling an index fund as "Index", distributes its value across underlying sectors/mcap proportionally via `services/fund_weights.py`.
- **Fund weights**: `services/fund_weights.py` provides sector and mcap weightage breakdowns for mutual funds. Hardcoded Nifty 50/Bank/Next 50 sector weights from NSE factsheets; category-based heuristic breakdowns (large/mid/small/flexi cap, hybrid, gold, debt) for active MFs.
- **CAS parsing**: `services/cas_parser.py` extracts holdings from CAS PDFs and maps ISINs to tickers via Yahoo Finance search + MFAPI resolution.
- **Mutual fund data**: `services/mfapi_service.py` provides scheme search, NAV retrieval, NAV history, and ISIN-to-scheme resolution with TTL caching.
- **Zerodha integration**: `services/kite_service.py` handles OAuth flow, fetches holdings/positions/MF from Kite Connect, maps to Minto schema.
- **Chat with Agno Team**: `services/research_agent.py` now builds a route-mode Agno `Team` with two specialist members. The team leader (Gemini) classifies intent and routes to one of: (1) **Research Agent** — existing agent with YFinance, Newspaper4k, DuckDuckGo tools, MF NAV tool, market overview tool, instrument search tool; (2) **Alert Agent** (`services/alert_agent.py`) — handles create/list/cancel alert intents via Supabase-backed tools. Widget extraction (price_summary, news_summary) applies to Research Agent responses only. Both agents use IST timezone (`Asia/Kolkata`). `run_research_agent` / `run_research_agent_stream` remain backward-compatible entry points that now route through the Team when `supabase_client` and `user_id` are provided.
- **Price alerts**: Users set thresholds via chat ("alert me when SBIN drops below ₹800") or the dedicated Alerts page. Four condition types: `above`, `below`, `pct_change_up`, `pct_change_down`. Stored in `price_alerts` table. The Alert Agent (`services/alert_agent.py`) creates/lists/cancels alerts via Supabase tools; instructions and config are defined in `prompts.yaml` under `alert_agent`. The `team_router` section in `prompts.yaml` defines the Team leader's routing rules.
- **Alert poller**: `services/alert_poller.py` uses APScheduler (`AsyncIOScheduler`) to poll all active alerts every 5 minutes. Fetches live prices via `yfinance_service.get_quote()` (equities) or `mfapi_service.get_latest_nav()` (MFs). On condition match, marks the alert `triggered` in Supabase and inserts a notification message into the user's most-recent chat thread. Uses a service-role Supabase client (bypasses RLS) — requires `SUPABASE_SERVICE_ROLE_KEY` env var. Scheduler is started/stopped via the FastAPI `lifespan` context manager in `main.py`.
- **Chat widgets**: Price widgets show day change with colored arrows (green ↑ / red ↓) and percentage. Multiple widgets are aggregated into single collated views with "+N more" buttons that open modals. News widgets show 2 inline with expandable modal for the rest.
- **Chat guardrails**: `services/guardrails.py` blocks 15 investment advice patterns and appends disclaimers.
- **Prompt management**: All prompts, agent instructions, guardrail patterns, and agent config are externalized in `backend/app/prompts.yaml`. The `app/core/prompts.py` module provides a `prompts` singleton that loads and templates the YAML. `prompts.raw` gives direct dict access to any YAML section not covered by typed accessors (used by `alert_agent` and `research_agent` to read `alert_agent` and `team_router` config blocks). Prompts and agent config can be edited without touching Python code.
- **SSE streaming**: Chat supports real-time streaming — mobile uses XHR-based SSE (React Native compatibility), web uses fetch ReadableStream.
- **Memory**: Optional Mem0 integration for storing/retrieving user conversation memory.
- **Fund classifier**: Client-side mutual fund type classification (index/equity/debt/arbitrage/gold/silver) by regex patterns in `web-app/src/lib/fund-classifier.ts`.
- **Holdings backfill**: `backend/scripts/backfill_holdings.py` enriches holdings with missing sector/mcap_bucket data. Uses yfinance `Ticker.info` for equities (sector + marketCap → bucket) and fund name classification for mutual funds. Supports dry-run and `--apply` modes. Uses a service_role JWT (built from `SUPABASE_JWT_SECRET`) to bypass RLS.
- **Zerodha import in onboarding**: The web financial profile wizard (step 14 — assets) includes an optional Zerodha import via popup OAuth. Imported holdings are listed with editable values and pre-fill the Direct Shares and Equity MF fields.

## 7. Development Patterns
- **Auth pattern**:
  - Frontend uses Supabase session access token.
  - Backend verifies JWT via Supabase `/auth/v1/user` endpoint (not JWKS) and scopes queries by `user_id` via `UserContext` dataclass.
- **Data access**:
  - Backend uses Supabase client with per-user JWT headers.
  - Supabase RLS policies enforce user-level access on all 8 tables.
- **Error handling**:
  - FastAPI uses `HTTPException` for auth/validation errors.
  - API clients throw on non-OK responses.
- **Caching**:
  - yfinance_service uses TTL caching: 30s quotes, 60s search, 300s news, 600s failed symbol cache.
  - mfapi_service uses TTL caching for NAV and search results.
- **Guardrails**:
  - `services/guardrails.py` blocks investment advice phrases and appends disclaimers. Patterns defined in `prompts.yaml`.
- **Styling**:
  - Mobile: Custom `Theme.ts` design system (colors, radii, fonts), `StyleSheet.create`, glassmorphism (`rgba(255,255,255,0.55)`), animated gradient background (12s breathing cycle), green nature palette (accent `#3d5a3e`).
  - Web: Tailwind CSS v4 with custom `@theme` colors matching mobile palette. Three glassmorphism tiers in `globals.css`: `glass-card` (standard, 0.25 opacity, 20px blur), `glass-elevated` (sidebar/chat input, 0.55 opacity, 24px blur), `glass-subtle` (nested elements, 0.18 opacity, 14px blur). Animated gradient background (60s breathing cycle via `background-position` animation on oversized gradient). Layout uses `h-screen overflow-hidden` to pin chat input at bottom with scrollable message area. Chat area uses `max-w-5xl` for wider responses. User bubbles are near-opaque white glass (`bg-white/95`) with iMessage-style rounded corners. Typing indicator uses bouncing dots in a glass bubble. `summaries/landing-page-edit-guide.md` documents how to edit the landing page.
- **Configuration**:
  - `.env` + `backend/app/core/config.py` loads all backend config (also sets `GOOGLE_API_KEY` for Agno).
  - `backend/app/prompts.yaml` is the single source of truth for all prompts, instructions, guardrail patterns, and agent config (model, temperature, timezone, limits). Sections: `system_prompt`, `agent_instructions`, `user_prompt`, `guardrails`, `agent_config`, `alert_agent`, `team_router`, `risk_agent`.
  - `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env` for the alert poller to bypass RLS when writing notification messages.
  - Mobile reads `EXPO_PUBLIC_*` vars.
  - Web reads from `web-app/.env.local`.
- **API proxying** (web): Next.js rewrites `/api/proxy/*` → backend URL to avoid CORS issues.

## 8. Testing Strategy
- **Frontend (mobile)**: One snapshot test in `components/__tests__/StyledText-test.js` using react-test-renderer.
- **Frontend (web)**: No tests found.
- **Backend**: 5 test files using pytest + pytest-asyncio + respx (mocked HTTP):
  - `test_guardrails.py` — Blocked phrases, safe response, disclaimer (9 tests).
  - `test_portfolio.py` — Extract prices, compute portfolio (equity/MF/mixed/empty), splits, concentration flags (7 tests).
  - `test_yfinance_service.py` — Exchange normalization, Indian symbol detection, Yahoo symbol conversion, quote normalization (14 tests).
  - `test_cas_parser.py` — Record flattening, normalization (7 tests).
  - `test_mfapi_service.py` — Search schemes, NAV retrieval, NAV history, ISIN resolution with caching (11 tests).
- **How to run tests**: `pytest` from the `backend/` directory.

## 9. Database Schema
- **9 tables**, all with RLS enabled and user-scoped policies:
  - `users` — id (FK auth.users), email, full_name.
  - `risk_acknowledgments` — user_id, accepted_at, version.
  - `risk_profiles` — user_id (unique), risk_level, risk_score, quiz_answers (JSONB).
  - `holdings` — user_id, source, isin, symbol, exchange, instrument_id, qty, avg_cost, asset_type, sector, mcap_bucket, scheme_code, scheme_name, fund_house.
  - `chats` — user_id, title, last_message_at.
  - `chat_messages` — chat_id, user_id, role, content, metadata (JSONB for widget data).
  - `cas_uploads` — user_id, status, parsed_holdings (JSONB), errors (JSONB).
  - `financial_profiles` — user_id (unique), version, responses (JSONB), metrics (JSONB).
  - `price_alerts` — user_id, symbol, exchange, scheme_code, display_name, alert_type (`above`/`below`/`pct_change_up`/`pct_change_down`), target_value, status (`active`/`triggered`/`cancelled`), triggered_at, triggered_price, created_at. Indexed on `status='active'` for efficient poller scans.
- **Migrations**: all under `backend/sql/migrations/`.
  - `001_mf_support.sql` — adds scheme_code, scheme_name, fund_house to holdings.
  - `002_fix_shaaban_intl_assets.sql`, `002_risk_analyses.sql`, `003_risk_analyses.sql` — risk analyses table.
  - `004_price_alerts.sql` — price_alerts table + RLS + index.
- **Seed data**: `backend/sql/seed_demo_holdings.sql` with 12 equities + 6 mutual funds.

## 10. Getting Started
- **Prerequisites**:
  - Node.js + pnpm (mobile) / npm (web).
  - Python 3.13+ with pip (backend).
  - Supabase project + environment variables.
- **Mobile frontend**:
  - Install deps: `pnpm install`.
  - Run: `pnpm start` / `pnpm ios` / `pnpm android` / `pnpm web`.
- **Web frontend**:
  - `cd web-app && npm install`.
  - Dev: `npm run dev`. Build: `npm run build`. Lint: `npm run lint`.
- **Backend**:
  - Install deps: `pip install -r backend/requirements.txt`.
  - Run server: `uvicorn backend.app.main:app` (Docker uses port 8080).
  - Run tests: `cd backend && pytest`.
- **Deployment**:
  - Backend deploys to Google Cloud Run (asia-south1) via `cloudbuild.yaml` (Docker build → push → deploy).
- **Environment variables**:
  - Root `.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required for alert poller), `GEMINI_API_KEY`, `MEM0_*` keys, `KITE_API_KEY`, `KITE_API_SECRET`, `YFINANCE_*` settings.
  - Web `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`.

## 11. Areas of Complexity
- **CAS PDF parsing**: Parsing PDFs can fail and falls back to raw text extraction; ISIN-to-ticker mapping uses both Yahoo Finance and MFAPI and may be incomplete.
- **Portfolio analytics**: Live pricing depends on Yahoo Finance (equities) and MFAPI (mutual funds); caching and normalization logic in both services is nuanced. Look-through analysis distributes MF values across constituent sectors using hardcoded index weights or category heuristics. Dashboard shows three visualization tiers: asset class bar (Equity/Debt/Gold & Commodity), sector donut (with look-through, small slices <2% grouped as Others), and mcap donut (Large/Mid/Small Cap + Gold/Debt for non-equity funds). Concentration risk flags use fund names (not ISINs) and look-through sector splits.
- **CAS scheme_code mapping**: CAS-imported MF scheme_codes can be stale/mismatched. The backfill script and fund_weights service prioritize the fund name stored in the DB over MFAPI scheme_code lookups. MFAPI's ISIN data is also unreliable for resolving to correct funds.
- **Agno Team routing**: The chat now routes through a route-mode Team. The team leader must correctly classify intent as alert vs. research; ambiguous phrasing (e.g. "what happens when SBIN hits 800?") may route incorrectly. Routing instructions are in `prompts.yaml` under `team_router`. Widget extraction only fires for Research Agent responses; Alert Agent responses produce no widgets.
- **Research agent**: Agno-based agent with multiple tool integrations; widget extraction from tool results requires specific output format parsing. Price widgets now include day change data from `get_quote()`.
- **Chat guardrails**: 15 blocked phrase patterns and disclaimer appending can affect response quality. All patterns defined in `prompts.yaml`.
- **Financial profiling wizard**: 1589-line 17-step conversational flow with complex financial ratio computations; tightly coupled UI + calculation logic.
- **Auth flow**: Three clients (mobile, web, backend) must stay in sync with Supabase auth and RLS policies. Web uses SSR auth (@supabase/ssr) with middleware session refresh.
- **Zerodha integration**: OAuth popup flow, token management, mapping Kite holdings schema to Minto holdings schema.
- **SSE streaming divergence**: Mobile (XHR-based) and web (fetch ReadableStream) use different SSE implementations due to React Native limitations.
- **Alert poller on Cloud Run**: APScheduler runs in-process. Cloud Run with min-instances ≥ 1 keeps it alive; if the instance is cold-started, polling resumes immediately. If `SUPABASE_SERVICE_ROLE_KEY` is not set, the poller skips silently and logs a warning.
