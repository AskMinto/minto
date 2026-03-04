# Project Knowledge Base

## 1. Project Overview
- **Purpose**: Multi-platform app ("Minto") for portfolio tracking and conversational financial insights. Users authenticate with Supabase, import holdings (manual add, CAS PDF upload, or Zerodha import), complete financial profiling, view portfolio analytics, and chat with an AI research agent.
- **Target users**: Retail investors managing Indian market portfolios (NSE/BSE equities + mutual funds) who want analytics, risk profiling, financial planning, and conversational help.
- **Key features**:
  - Supabase-authenticated onboarding (risk acknowledgment + risk quiz + optional Zerodha import).
  - Financial profiling wizard (17-step conversational flow computing NISM-prescribed ratios, balance sheet, cash flow analysis, goal mapping).
  - Portfolio holdings management (manual add, CAS PDF upload, Zerodha Kite Connect import).
  - Dashboard analytics (totals, top holdings, sector/mcap/asset splits, concentration risk flags).
  - Conversational chat with SSE streaming, Agno-based research agent (YFinance, DuckDuckGo, Newspaper4k tools), memory, guardrails, and inline widgets (price summaries, news).
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
  - Chat flow: user message → portfolio snapshot + news + Mem0 memory → Agno research agent (with tool calls) → guardrails filter → widget extraction → SSE stream to client → persist messages/memory.
- **External dependencies**:
  - **Supabase** (auth + Postgres + RLS).
  - **Yahoo Finance** (quotes/search/news via yfinance, cached with TTL).
  - **MFAPI** (mutual fund NAV, scheme search, NAV history).
  - **Google Gemini** (`gemini-3-flash-preview` model via Agno framework).
  - **Agno** (AI agent framework with YFinance, Newspaper4k, DuckDuckGo tools).
  - **Mem0** (long-term chat memory per user).
  - **Zerodha Kite Connect** (OAuth-based holdings/positions/MF import).

## 3. Tech Stack
- **Languages**: TypeScript (frontends), Python (backend).
- **Mobile frontend**: Expo ~54, React 19, React Native 0.81, Expo Router ~6, Supabase JS client ^2.97, react-native-reanimated ~4.1, lucide-react-native ^0.575, react-native-svg 15.12, react-native-markdown-display ^7.0, expo-linear-gradient ~15.0, expo-document-picker ~14.0, DM Sans font (@expo-google-fonts/dm-sans).
- **Web frontend**: Next.js ^15.1, React ^19.0, Tailwind CSS v4, @supabase/ssr ^0.5, recharts ^2.15, react-markdown ^9.0, lucide-react ^0.470, clsx + tailwind-merge.
- **Backend**: FastAPI 0.133, Uvicorn 0.41, Supabase Python 2.28, HTTPX 0.28, cachetools 6.2.
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
  - `src/hooks/`: Custom hooks (use-chat, use-dashboard, use-holdings, use-search).
  - `src/lib/`: API client (with proxy), SSE streaming (fetch ReadableStream), Supabase (browser + SSR + middleware), formatters, fund classifier, constants.
- `backend/`: FastAPI backend.
  - `app/main.py`: FastAPI app with CORS, 8 routers registered.
  - `app/routers/`: API endpoints (risk, holdings, cas, chats, market, dashboard, zerodha, financial_profiles).
  - `app/services/`: Business logic (portfolio, fund_weights, cas_parser, gemini, research_agent, guardrails, mem0, yfinance_service, mfapi_service, kite_service).
  - `scripts/`: Utility scripts (backfill_holdings.py for enriching holdings with missing sector/mcap data).
  - `app/core/`: config.py (env loader) + auth.py (JWT verification via Supabase endpoint).
  - `app/db/`: Supabase client wrapper.
  - `tests/`: pytest test files (guardrails, portfolio, yfinance, cas_parser, mfapi).
  - `sql/`: schema.sql (8 tables + RLS), migrations (001_mf_support.sql), seed data.
  - `Dockerfile`: Python 3.13-slim, uvicorn on port 8080.
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
  - `web-app/src/app/onboarding/financial-profile/page.tsx`: 17-step conversational financial profiling wizard (1589 lines).
- **Backend**:
  - `backend/app/main.py`: FastAPI app with CORS (allow all origins), 8 routers.
- **API endpoints (overview)**:
  - `/risk/ack`, `/risk/quiz`, `/risk/profile` (risk onboarding).
  - `/holdings` CRUD.
  - `/cas/upload`, `/cas/confirm` (CAS PDF ingestion).
  - `/dashboard`, `/risk/concentration` (portfolio analytics).
  - `/instruments/search`, `/prices/quote`, `/instruments/{symbol}/detail`, `/mf/{scheme_code}/detail`, `/news` (market data).
  - `/chat/home-context`, `/chat/messages`, `/chat/message`, `/chat/message/stream` (chat with SSE).
  - `/zerodha/redirect`, `/zerodha/login-url`, `/zerodha/callback`, `/zerodha/status` (Zerodha integration).
  - `/financial-profile` POST (upsert financial profile).

## 6. Core Concepts
- **Risk onboarding**: Users must accept a disclaimer and complete a risk quiz; stored in `risk_acknowledgments` and `risk_profiles` tables.
- **Financial profiling**: 17-step conversational wizard computing NISM-prescribed financial ratios (DTI, solvency, liquidity, savings ratio), personal balance sheet, cash flow analysis, ESOP concentration analysis, suggested allocation, and goal mapping. Stored in `financial_profiles` table.
- **Holdings**: Central portfolio records, created manually, via CAS upload, or Zerodha import; enriched with pricing data for analytics. Supports both equities (symbol/ISIN) and mutual funds (scheme_code/scheme_name/fund_house).
- **Portfolio analytics**: `services/portfolio.py` computes totals, PnL, splits, top holdings, and concentration risk flags. Uses **look-through analysis** for mutual funds — instead of labelling an index fund as "Index", distributes its value across underlying sectors/mcap proportionally via `services/fund_weights.py`.
- **Fund weights**: `services/fund_weights.py` provides sector and mcap weightage breakdowns for mutual funds. Hardcoded Nifty 50/Bank/Next 50 sector weights from NSE factsheets; category-based heuristic breakdowns (large/mid/small/flexi cap, hybrid, gold, debt) for active MFs.
- **CAS parsing**: `services/cas_parser.py` extracts holdings from CAS PDFs and maps ISINs to tickers via Yahoo Finance search + MFAPI resolution.
- **Mutual fund data**: `services/mfapi_service.py` provides scheme search, NAV retrieval, NAV history, and ISIN-to-scheme resolution with TTL caching.
- **Zerodha integration**: `services/kite_service.py` handles OAuth flow, fetches holdings/positions/MF from Kite Connect, maps to Minto schema.
- **Chat with research agent**: Agno-based research agent (`services/research_agent.py`) with YFinance, Newspaper4k, DuckDuckGo tools, custom MF NAV tool, market overview tool, and instrument search tool. Extracts inline widgets (price_summary, news_summary) from tool execution results.
- **Chat guardrails**: `services/guardrails.py` blocks 24 investment advice patterns and appends disclaimers.
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
  - `services/guardrails.py` blocks investment advice phrases and appends disclaimers.
- **Styling**:
  - Mobile: Custom `Theme.ts` design system (colors, radii, fonts), `StyleSheet.create`, glassmorphism (`rgba(255,255,255,0.55)`), green nature palette (accent `#3d5a3e`).
  - Web: Tailwind CSS v4 with custom `@theme` colors matching mobile palette, `glass-card` CSS utility.
- **Configuration**:
  - `.env` + `backend/app/core/config.py` loads all backend config (also sets `GOOGLE_API_KEY` for Agno).
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
- **8 tables**, all with RLS enabled and user-scoped policies:
  - `users` — id (FK auth.users), email, full_name.
  - `risk_acknowledgments` — user_id, accepted_at, version.
  - `risk_profiles` — user_id (unique), risk_level, risk_score, quiz_answers (JSONB).
  - `holdings` — user_id, source, isin, symbol, exchange, instrument_id, qty, avg_cost, asset_type, sector, mcap_bucket, scheme_code, scheme_name, fund_house.
  - `chats` — user_id, title, last_message_at.
  - `chat_messages` — chat_id, user_id, role, content, metadata (JSONB for widget data).
  - `cas_uploads` — user_id, status, parsed_holdings (JSONB), errors (JSONB).
  - `financial_profiles` — user_id (unique), version, responses (JSONB), metrics (JSONB).
- **Migrations**: `sql/migrations/001_mf_support.sql` adds scheme_code, scheme_name, fund_house to holdings.
- **Seed data**: `sql/seed_demo_holdings.sql` with 12 equities + 6 mutual funds.

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
  - Root `.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `MEM0_*` keys, `KITE_API_KEY`, `KITE_API_SECRET`, `YFINANCE_*` settings.
  - Web `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`.

## 11. Areas of Complexity
- **CAS PDF parsing**: Parsing PDFs can fail and falls back to raw text extraction; ISIN-to-ticker mapping uses both Yahoo Finance and MFAPI and may be incomplete.
- **Portfolio analytics**: Live pricing depends on Yahoo Finance (equities) and MFAPI (mutual funds); caching and normalization logic in both services is nuanced. Look-through analysis distributes MF values across constituent sectors using hardcoded index weights or category heuristics.
- **CAS scheme_code mapping**: CAS-imported MF scheme_codes can be stale/mismatched. The backfill script and fund_weights service prioritize the fund name stored in the DB over MFAPI scheme_code lookups. MFAPI's ISIN data is also unreliable for resolving to correct funds.
- **Research agent**: Agno-based agent with multiple tool integrations; widget extraction from tool results requires specific output format parsing.
- **Chat guardrails**: 24 blocked phrase patterns and disclaimer appending can affect response quality.
- **Financial profiling wizard**: 1589-line 17-step conversational flow with complex financial ratio computations; tightly coupled UI + calculation logic.
- **Auth flow**: Three clients (mobile, web, backend) must stay in sync with Supabase auth and RLS policies. Web uses SSR auth (@supabase/ssr) with middleware session refresh.
- **Zerodha integration**: OAuth popup flow, token management, mapping Kite holdings schema to Minto holdings schema.
- **SSE streaming divergence**: Mobile (XHR-based) and web (fetch ReadableStream) use different SSE implementations due to React Native limitations.
