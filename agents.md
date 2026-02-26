# Project Knowledge Base

## 1. Project Overview
- **Purpose**: Mobile app (“Minto”) for portfolio tracking and conversational insights. Users authenticate with Supabase, upload holdings (manual or CAS PDF), view portfolio analytics, and chat with an AI assistant.
- **Target users**: Retail investors managing Indian market portfolios (NSE/BSE) who want analytics, risk profiling, and conversational help.
- **Key features**:
  - Supabase-authenticated onboarding (risk acknowledgment + risk quiz).
  - Portfolio holdings management (manual add, CAS PDF upload).
  - Dashboard analytics (totals, top holdings, sector/mcap/asset splits, concentration risk flags).
  - Conversational chat with memory and guardrails.
  - Market search and news via Yahoo Finance.

## 2. Architecture Overview
- **Frontend**: Expo + React Native app using Expo Router for navigation. Uses Supabase auth and a custom API client to call the backend.
- **Backend**: FastAPI service providing portfolio, chat, risk, market, and CAS endpoints. Uses Supabase for data storage with RLS policies. Integrates external services (Yahoo Finance, Gemini, Mem0).
- **Data flow**:
  - Mobile app authenticates with Supabase → access token is attached to backend API calls.
  - Backend verifies JWT via Supabase JWKS → uses Supabase client with user JWT to read/write data.
  - Portfolio analytics use holdings data + Yahoo Finance quotes.
  - Chat flow pulls portfolio snapshot + news + memory → Gemini response → guardrails → persist messages/memory.
- **External dependencies**:
  - **Supabase** (auth + Postgres + RLS).
  - **Yahoo Finance** (quotes/search/news).
  - **Google Gemini** (LLM responses).
  - **Mem0** (long-term chat memory).

## 3. Tech Stack
- **Languages**: TypeScript (frontend), Python (backend).
- **Frontend**: Expo ~54, React 19, React Native 0.81, Expo Router, Supabase JS client.
- **Backend**: FastAPI, Uvicorn, Supabase Python client, Pydantic, Python-JOSE, HTTPX.
- **LLM/AI**: google-generativeai (Gemini), Mem0 API.
- **Market data**: yfinance.
- **CAS parsing**: casparser, pdfplumber.
- **Testing**: react-test-renderer (snapshot test only).
- **Build/package managers**: npm/pnpm (package.json + pnpm-lock), pip (requirements.txt).

## 4. Directory Structure
- `app/`: Expo Router screens and routes (tabs, onboarding, chat, portfolio).
- `components/`: Shared UI components + hooks (Themed, StyledText, etc.).
- `constants/`: Constants (colors).
- `lib/`: Frontend API client and Supabase client.
- `backend/`: FastAPI backend.
  - `app/main.py`: FastAPI app and router registration.
  - `app/routers/`: API endpoints (risk, holdings, cas, chat, market, dashboard).
  - `app/services/`: Business logic (portfolio, CAS parsing, Gemini, guardrails, Mem0, yfinance).
  - `app/core/`: Config + auth helpers.
  - `app/db/`: Supabase client wrapper.
  - `sql/schema.sql`: Supabase table schema + RLS policies.
- `assets/`: Fonts and images.
- `exper/`: Experimental scripts (e.g., yfinance probe).
- `ios/`: iOS project artifacts.

## 5. Key Entry Points
- **Frontend**:
  - `app/_layout.tsx`: Root navigation + auth/onboarding gating.
  - `app/(tabs)/_layout.tsx`: Bottom tab navigation.
  - `app/index.tsx`: Landing screen.
  - `app/login.tsx`: OAuth login flow with Supabase.
- **Backend**:
  - `backend/app/main.py`: FastAPI app with CORS, routers.
- **API endpoints (overview)**:
  - `/risk/ack`, `/risk/quiz`, `/risk/profile` (risk onboarding).
  - `/holdings` CRUD.
  - `/cas/upload`, `/cas/confirm` (CAS PDF ingestion).
  - `/dashboard`, `/risk/concentration` (portfolio analytics).
  - `/instruments/search`, `/prices/quote`, `/news` (market data).
  - `/chats`, `/chats/{id}`, `/chats/{id}/messages` (chat).

## 6. Core Concepts
- **Risk onboarding**: Users must accept a disclaimer and complete a risk quiz; stored in `risk_acknowledgments` and `risk_profiles` tables.
- **Holdings**: Central portfolio records, created manually or via CAS upload; enriched with pricing data for analytics.
- **Portfolio analytics**: `services/portfolio.py` computes totals, PnL, splits, top holdings, and concentration risk flags.
- **CAS parsing**: `services/cas_parser.py` extracts holdings from CAS PDFs and maps ISINs to tickers via Yahoo Finance search.
- **Chat with guardrails**: Chat replies generated via Gemini (if configured), filtered with guardrails to avoid explicit buy/sell advice, and disclaimers appended.
- **Memory**: Optional Mem0 integration for storing/retrieving user conversation memory.

## 7. Development Patterns
- **Auth pattern**:
  - Frontend uses Supabase session access token.
  - Backend verifies JWT with Supabase JWKS and scopes queries by `user_id`.
- **Data access**:
  - Backend uses Supabase client with per-user JWT headers.
  - Supabase RLS policies enforce user-level access in schema.
- **Error handling**:
  - FastAPI uses `HTTPException` for auth/validation errors.
  - API client throws on non-OK responses.
- **Guardrails**:
  - `services/guardrails.py` blocks investment advice phrases and appends disclaimers.
- **Configuration**:
  - `.env` + `backend/app/core/config.py` loads all config. Frontend reads `EXPO_PUBLIC_*` vars.

## 8. Testing Strategy
- **Frontend**: One snapshot test in `components/__tests__/StyledText-test.js` using react-test-renderer.
- **Backend**: No tests found.
- **How to run tests**: No explicit test scripts in `package.json`; testing setup is minimal.

## 9. Getting Started
- **Prerequisites**:
  - Node.js + npm/pnpm (Expo tooling).
  - Python 3 with pip (FastAPI backend).
  - Supabase project + environment variables.
- **Frontend**:
  - Install deps: `npm install` (or `pnpm install`).
  - Run: `npm run start` / `npm run ios` / `npm run android` / `npm run web`.
- **Backend**:
  - Install deps: `pip install -r backend/requirements.txt`.
  - Run server: use `uvicorn` with `backend.app.main:app` (not scripted in repo).
- **Environment variables** (see `.env`):
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`.
  - Backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWKS_URL`, `GEMINI_API_KEY`, `MEM0_*` keys, `YFINANCE_*` settings.

## 10. Areas of Complexity
- **CAS PDF parsing**: Parsing PDFs can fail and falls back to raw text extraction with manual errors; ISIN-to-ticker mapping may be incomplete.
- **Portfolio analytics**: Live pricing and splits depend on Yahoo Finance reliability; caching and normalization logic in `yfinance_service.py` is nuanced.
- **Chat guardrails**: Ensuring compliance by blocking certain phrases and adding disclaimers can affect response quality.
- **Auth flow**: Both frontend onboarding gating and backend JWT verification must stay in sync with Supabase RLS policies.
