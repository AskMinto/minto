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
- **Purpose**: Multi-platform app ("Minto") for portfolio tracking, conversational financial insights, and tax harvesting. Users authenticate with Supabase, import holdings (manual add, CAS PDF upload, or Zerodha import), complete financial profiling, view portfolio analytics, chat with an AI research agent, and use the Tax Saver to optimise capital gains before March 31.
- **Target users**: Retail investors managing Indian market portfolios (NSE/BSE equities + mutual funds) who want analytics, risk profiling, financial planning, conversational help, and capital gains tax optimisation.
- **Key features**:
  - Supabase-authenticated onboarding (risk acknowledgment + risk quiz + optional Zerodha import).
  - **Two-tier user access**: new users (no risk_ack) go through phone OTP verification and get tax-saver-only access; existing users get the full portfolio app.
  - Financial profiling wizard (17-step conversational flow computing NISM-prescribed ratios, balance sheet, cash flow analysis, goal mapping).
  - Portfolio holdings management (manual add, CAS PDF upload, Zerodha Kite Connect import).
  - Dashboard analytics (totals, top holdings, sector/mcap/asset splits, concentration risk flags).
  - Conversational chat with SSE streaming, Agno-based research agent (YFinance, DuckDuckGo, Newspaper4k tools), memory, guardrails, and inline widgets (price summaries, news).
  - Price alerts: users set price/percentage-move thresholds via chat or the Alerts page; a background poller fires notifications into the chat thread when conditions are met.
  - Market search with instrument detail pages (equities with charts + MFs with NAV history).
  - Mutual fund data via MFAPI (NAV, history, scheme search, ISIN resolution).
  - **WhatsApp Tax Harvesting Bot**: Twilio-powered WhatsApp bot (POST /whatsapp/incoming) that guides users through the full tax harvesting flow — onboarding Q&A, CAS/broker/ITR document collection, capital gains netting, loss harvesting, gains harvesting, and PDF report — via an Agno agent with 12 tools and Supabase-persisted session state.
  - **Web Tax Saver wizard**: Step-by-step form wizard at /tax-saver (not chat-based) covering all the same user stories. Deterministic Python tax engine (no LLM for computation). /documents page for DPDPA audit trail.

## 2. Architecture Overview
- **Mobile frontend**: Expo + React Native app using Expo Router for navigation. Uses Supabase auth and a custom API client to call the backend.
- **Web frontend**: Next.js 15 app with SSR Supabase auth (@supabase/ssr), Tailwind CSS v4, recharts. Proxies API calls via `/api/proxy` rewrites to avoid CORS.
- **Backend**: FastAPI service providing portfolio, chat, risk, market, CAS, Zerodha, financial profile, tax harvesting, and WhatsApp bot endpoints. Uses Supabase for data storage with RLS policies. Integrates external services.
- **Data flow**:
  - Clients authenticate with Supabase → access token is attached to backend API calls.
  - Backend verifies JWT via Supabase `/auth/v1/user` endpoint → uses Supabase client with user JWT to read/write data.
  - Portfolio analytics use holdings data + Yahoo Finance quotes + MFAPI NAV data.
  - Chat flow: user message → portfolio snapshot + news + Mem0 memory → Agno Team (route mode) → Research Agent or Alert Agent → guardrails filter → widget extraction → SSE stream to client → persist messages/memory.
  - Alert flow: APScheduler polls active alerts every 5 minutes → fetches live prices (yfinance/MFAPI) → on condition match, marks alert triggered and injects a notification message into the user's chat thread via service-role Supabase client.
  - **WhatsApp bot flow**: Twilio webhook (POST /whatsapp/incoming) → verify X-Twilio-Signature → load session from wa_agent_sessions (Supabase service-role) → wa_agent.arun() with session_state injected → agent calls tools (document parse, tax engine, GCS) → save updated session → send response via Twilio. Reminder scheduler runs daily at 9 AM IST via APScheduler.
  - **Web tax wizard flow**: step-by-step form wizard → POST /tax/onboarding per answer → POST /tax/upload for documents (LLM parse via Gemini File API) → POST /tax/analyse (pure Python tax engine, no LLM) → structured result cards with loss/gains harvesting plans.
- **External dependencies**:
  - **Supabase** (auth + Postgres + RLS).
  - **Yahoo Finance** (quotes/search/news via yfinance, cached with TTL).
  - **MFAPI** (mutual fund NAV, scheme search, NAV history).
  - **Google Gemini** (`gemini-3-flash-preview` model via Agno framework and google-genai SDK).
  - **Agno** (AI agent framework — route-mode Team with Research Agent + Alert Agent; YFinance, Newspaper4k, DuckDuckGo tools; also powers WhatsApp tax bot and web tax agent).
  - **Mem0** (long-term chat memory per user).
  - **Zerodha Kite Connect** (OAuth-based holdings/positions/MF import).
  - **Twilio** (WhatsApp messaging — inbound webhooks + outbound messages; TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env).
  - **Google Cloud Storage** (temporary raw document storage for DPDPA compliance — deleted within 60s of parsing; GCS_BUCKET_NAME env var; ADC auth on Cloud Run).
  - **pikepdf** (PDF encryption detection + decryption for password-protected CAS/ITR PDFs).
  - **reportlab** (PDF report generation for the final tax harvest plan).
  - **openpyxl** (Excel broker report parsing in llm_doc_parser).

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
- **WhatsApp bot dependencies**: twilio 9.4.5, pikepdf ≥9.0, google-cloud-storage ≥2.18, reportlab ≥4.4, openpyxl ≥3.1.
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
  - `src/app/(app)/`: Chat, dashboard, holdings, search, settings, alerts, tax-saver, documents pages.
  - `src/app/(app)/tax-saver/`: Tax Saver wizard page + components/ (tax-wizard, wizard-nav, steps/).
  - `src/app/(app)/documents/`: Documents page (DPDPA audit trail for tax uploads).
  - `src/app/onboarding/`: Risk ack, risk quiz, financial profile wizard, verify-phone (OTP).
  - `src/components/`: UI components (chat, dashboard, holdings, search, layout, ui primitives).
  - `src/hooks/`: Custom hooks (use-chat, use-dashboard, use-holdings, use-search, use-alerts, use-tax-chat, use-tax-wizard).
  - `src/lib/`: API client (with proxy), SSE streaming (fetch ReadableStream), Supabase (browser + SSR + middleware), formatters, fund classifier, constants.
  - `src/providers/auth-provider.tsx`: AuthProvider with userTier (new/existing), phoneVerified, and needsPhoneVerify state.
- `backend/`: FastAPI backend.
  - `app/main.py`: FastAPI app with CORS, all routers registered + whatsapp_router at /whatsapp; APScheduler started/stopped via `lifespan` with alert poller + WA reminder scheduler.
  - `app/routers/`: API endpoints (risk, holdings, cas, chats, market, dashboard, zerodha, financial_profiles, alerts, tax_chat, user).
  - `app/routers/tax_chat.py`: Tax saver endpoints — chat (messages, stream, upload) AND wizard (session, onboarding, analyse, holdings-context, sync-holdings, documents, documents/{id}).
  - `app/routers/user.py`: User phone endpoints including POST /user/verify-phone-complete (marks phone_verified=true after Supabase OTP).
  - `app/services/`: Business logic (portfolio, fund_weights, cas_parser, gemini, research_agent, alert_agent, alert_poller, guardrails, mem0, yfinance_service, mfapi_service, kite_service, whatsapp).
  - `app/whatsapp_bot/`: Complete WhatsApp Tax Harvesting Bot package — agent.py, tools.py, tax_engine.py, llm_doc_parser.py, document_parser.py, gcs_client.py, models.py, session_store.py, web_session_store.py, web_agent.py, reminder_scheduler.py, report_generator.py, router.py.
  - `app/prompts.yaml`: Single source of truth for all prompts. Sections: system_prompt, agent_instructions, user_prompt, guardrails, alert_agent, team_router, risk_agent, whatsapp_tax_agent, tax_web_agent.
  - `app/core/`: config.py (env loader — includes TWILIO_*, GCS_BUCKET_NAME, SUPABASE_DB_URL), auth.py, prompts.py, model_config.py.
  - `app/model_config.yaml`: Model IDs and runtime config. Sections: research_agent, alert_agent, team_router, risk_agent, whatsapp_bot, tax_web_agent, voice_agent.
  - `scripts/`: Utility scripts (backfill_holdings.py).
  - `app/db/`: Supabase client wrapper.
  - `tests/`: pytest test files (guardrails, portfolio, yfinance, cas_parser, mfapi).
  - `sql/`: schema.sql, migrations (001–010), seed data.
  - `Dockerfile`: Python 3.13-slim, uvicorn on port 8080.
- `PRDs/`: Product requirement documents (User_Stories_v5_ORIGINAL.md — 36 user stories for the WhatsApp tax bot).
- `summaries/`: Documentation.
- `assets/`: Fonts (SpaceMono) and images (icon, splash, minto.png).
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
  - `web-app/src/app/(app)/layout.tsx`: Auth guard with two-tier access — new users (no risk_ack) are gated to /tax-saver only after phone OTP; existing users go through full onboarding gates; needsPhoneVerify → /onboarding/verify-phone.
  - `web-app/src/app/(app)/chat/page.tsx`: Chat with SSE streaming, markdown, widgets.
  - `web-app/src/app/(app)/dashboard/page.tsx`: Portfolio dashboard with recharts donut charts.
  - `web-app/src/app/(app)/settings/page.tsx`: Profile settings, Zerodha connection (popup OAuth).
  - `web-app/src/app/(app)/alerts/page.tsx`: Price alerts management — list active alerts, create new alerts (equity or MF, four condition types), cancel alerts.
  - `web-app/src/app/(app)/tax-saver/page.tsx`: Tax Saver wizard (renders `<TaxWizard />`). Step-by-step form flow: welcome → residency → portfolio type → NPS/ULIP subflows → carry-forward → tax regime → documents → analysis results.
  - `web-app/src/app/(app)/documents/page.tsx`: Lists all tax documents from tax_documents table with delete (soft) per row.
  - `web-app/src/app/onboarding/verify-phone/page.tsx`: Supabase Phone OTP verification for new users — sends OTP via updateUser({phone}), verifies via verifyOtp, calls POST /user/verify-phone-complete.
  - `web-app/src/app/onboarding/financial-profile/page.tsx`: 17-step conversational financial profiling wizard (1589 lines).
- **Backend**:
  - `backend/app/main.py`: FastAPI app with CORS (allow all origins), 11 routers; lifespan context manager starts/stops APScheduler (alert poller + WA reminder scheduler).
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
  - `/user/phone` GET/POST, `/user/verify-phone-complete` POST (phone management + OTP verification).
  - `/tax/messages`, `/tax/message/stream`, `/tax/upload`, `/tax/session` (tax chat + wizard).
  - `/tax/onboarding`, `/tax/analyse`, `/tax/holdings-context`, `/tax/sync-holdings` (wizard computation).
  - `/tax/documents`, `/tax/documents/{id}` DELETE (document audit trail).
  - `/tax/session` DELETE (DPDPA right to erasure).
  - `/whatsapp/incoming`, `/whatsapp/status`, `/whatsapp/health` (WhatsApp bot Twilio webhooks).

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
- **Prompt management**: All prompts, agent instructions, guardrail patterns, and agent config are externalized in `backend/app/prompts.yaml`. The `app/core/prompts.py` module provides a `prompts` singleton that loads and templates the YAML. `prompts.raw` gives direct dict access to any YAML section. Sections: system_prompt, agent_instructions, user_prompt, guardrails, alert_agent, team_router, risk_agent, `whatsapp_tax_agent` (plain-text, 1600-char limit, all 36 US covered), `tax_web_agent` (markdown enabled, no length limit). Model config is in `app/model_config.yaml` (sections: research_agent, alert_agent, team_router, risk_agent, whatsapp_bot, tax_web_agent, voice_agent).
- **SSE streaming**: Chat supports real-time streaming — mobile uses XHR-based SSE (React Native compatibility), web uses fetch ReadableStream.
- **Memory**: Optional Mem0 integration for storing/retrieving user conversation memory.
- **Fund classifier**: Client-side mutual fund type classification (index/equity/debt/arbitrage/gold/silver) by regex patterns in `web-app/src/lib/fund-classifier.ts`.
- **Holdings backfill**: `backend/scripts/backfill_holdings.py` enriches holdings with missing sector/mcap_bucket data. Uses yfinance `Ticker.info` for equities (sector + marketCap → bucket) and fund name classification for mutual funds. Supports dry-run and `--apply` modes. Uses a service_role JWT (built from `SUPABASE_JWT_SECRET`) to bypass RLS.
- **Zerodha import in onboarding**: The web financial profile wizard (step 14 — assets) includes an optional Zerodha import via popup OAuth. Imported holdings are listed with editable values and pre-fill the Direct Shares and Equity MF fields.
- **WhatsApp Tax Bot**: `backend/app/whatsapp_bot/` — full self-contained package.
  - `router.py`: Twilio webhook at POST /whatsapp/incoming. Verifies X-Twilio-Signature (reconstructs HTTPS URL from X-Forwarded-Proto on Cloud Run). File uploads detected via NumMedia → builds `[FILE_UPLOADED] type=... url=...` sentinel for agent. Splits responses >1550 chars on paragraph boundaries.
  - `agent.py`: Shared stateless `wa_agent` Agno Agent (gemini-3-flash-preview, markdown=False, no db — session persisted explicitly). `session_state={}` — actual state injected per `arun()` call from session_store.
  - `web_agent.py`: Same tools, `markdown=True`, uses `tax_web_agent` prompt section.
  - `tools.py`: 12 Agno tool functions — `save_onboarding_answer`, `process_uploaded_document`, `unlock_and_parse_document`, `run_tax_analysis`, `get_loss_harvest_plan`, `get_gains_harvest_plan`, `opt_in_reminder`, `generate_pdf_report`, `save_notification_contact`, `get_days_to_deadline`, `delete_user_data`, `get_user_data_summary`.
  - `tax_engine.py`: Pure Python deterministic capital gains computation — `compute_tax_analysis()` (Sec 70/71/72/112A/87A netting), `get_loss_harvest_candidates_mf()` (Sec 94(7)/(8) checks), `get_loss_harvest_candidates_stocks()`, `get_gains_harvest_candidates_mf()`, `compute_cf_strategy()`.
  - `llm_doc_parser.py`: Gemini 3 Flash File API parsing for all 4 doc types (CAS, broker_pl, broker_holdings, ITR). Uses google-genai SDK. Immediately deletes File API uploads after parsing. Excel files read via openpyxl then sent as inline text.
  - `document_parser.py`: Low-level helpers — `download_from_twilio()` (httpx Basic Auth), `is_pdf_encrypted()` and `decrypt_pdf()` (pikepdf), `upload_to_gcs_and_audit()`, `delete_from_gcs_and_audit()`, `mark_parse_status()`.
  - `session_store.py`: Supabase-backed session for WhatsApp — table `wa_agent_sessions` (wa_phone key). `load_session()`, `save_session()`, `delete_session()`. Uses service-role client.
  - `web_session_store.py`: Same pattern for web — table `tax_sessions` (user_id key). `load_tax_session()`, `save_tax_session()`, `delete_tax_session()`.
  - `models.py`: Pydantic schemas for structured LLM outputs — `CASResult`, `BrokerPLResult`, `BrokerHoldingsResult`, `ITRResult` (+ nested models for lots, transactions, trades, holdings).
  - `reminder_scheduler.py`: Daily 9 AM IST APScheduler job — queries `wa_agent_sessions` for `reminder_opted_in=true` and `reminder_date=today`, sends WhatsApp reminder with staleness warning. Key: table uses `wa_phone` (not `user_id`).
  - `gcs_client.py`: Async GCS wrapper (ADC) — `upload_bytes()`, `delete_object()`, `gcs_path_from_uri()`.
  - `report_generator.py`: reportlab PDF generation for the final tax harvest report.
- **Two-tier user access (web)**:
  - `auth-provider.tsx` exposes `userTier: 'loading' | 'new' | 'existing'` and `phoneVerified: boolean`. New users (no risk_ack row) with verified phone land on tax-saver only. Unverified new users are sent to /onboarding/verify-phone.
  - `(app)/layout.tsx` enforces the gate: new + complete → only /tax-saver allowed; new + needsPhoneVerify → /onboarding/verify-phone.
  - Sidebar conditionally shows limited nav (Tax Saver only) for new users; Settings link hidden.
- **Web Tax Saver wizard**: `use-tax-wizard.ts` hook + `tax-wizard.tsx` orchestrator + 9 step components (steps/ subdirectory). Deterministic backend (`POST /tax/analyse`) — no LLM for tax computation. Steps: welcome, residency, portfolio-type, nps-tier (conditional), ulip-check (conditional), carry-forward, tax-regime + income-bracket, documents (with upload modal + holdings context banner), analysis (tax summary cards + loss/gains harvesting + sync holdings).
- **Tax Documents page**: `/documents` lists `tax_documents` rows (doc_type, broker, filename, parse_status, upload date) with soft-delete. `tax_documents` table tracks web uploads for DPDPA compliance; raw files are never stored — only parsed summaries in session.

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
- **13 tables** (9 original + 4 new), all with RLS enabled and user-scoped policies:
  - `users` — id (FK auth.users), email, full_name, phone_number, **phone_verified boolean** (true only after Supabase OTP confirmation).
  - `risk_acknowledgments` — user_id, accepted_at, version.
  - `risk_profiles` — user_id (unique), risk_level, risk_score, quiz_answers (JSONB).
  - `holdings` — user_id, source, isin, symbol, exchange, instrument_id, qty, avg_cost, asset_type, sector, mcap_bucket, scheme_code, scheme_name, fund_house.
  - `chats` — user_id, title, last_message_at.
  - `chat_messages` — chat_id, user_id, role, content, metadata (JSONB for widget data).
  - `cas_uploads` — user_id, status, parsed_holdings (JSONB), errors (JSONB).
  - `financial_profiles` — user_id (unique), version, responses (JSONB), metrics (JSONB).
  - `price_alerts` — user_id, symbol, exchange, scheme_code, display_name, alert_type (`above`/`below`/`pct_change_up`/`pct_change_down`), target_value, status (`active`/`triggered`/`cancelled`), triggered_at, triggered_price, created_at. Indexed on `status='active'`.
  - `wa_agent_sessions` — **wa_phone** text unique (E.164, primary key for all queries), session_state JSONB, messages JSONB (last 30), created_at, updated_at. No RLS — service-role only. Used by WhatsApp bot.
  - `wa_documents` — wa_phone, doc_type, broker_name, gcs_path, parse_status, uploaded_at, parsed_at, **gcs_deleted_at** (DPDPA compliance timestamp). No RLS — service-role only.
  - `tax_sessions` — user_id uuid unique (FK auth.users), session_state JSONB, messages JSONB (last 30), created_at, updated_at. RLS enabled (users own their row). Used by web tax saver.
  - `tax_documents` — user_id uuid (FK auth.users), doc_type, broker_name, file_name, parse_status, uploaded_at, **deleted_at** (soft-delete for DPDPA). RLS enabled.
- **Migrations**: all under `backend/sql/migrations/`.
  - `001_mf_support.sql` — adds scheme_code, scheme_name, fund_house to holdings.
  - `002–003` — risk analyses table.
  - `004_price_alerts.sql` — price_alerts table + RLS + index.
  - `005_user_phone.sql` — phone_number column on users.
  - `006_chat_messages_chat_id.sql` — chat_id FK on chat_messages.
  - `007_wa_bot.sql` — wa_agent_sessions + wa_documents tables.
  - `008_tax_sessions.sql` — tax_sessions table with RLS.
  - `009_phone_verified.sql` — phone_verified boolean on users.
  - `010_tax_documents.sql` — tax_documents table with RLS.
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
  - Root `.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required for alert poller, WA bot, tax sessions), `GEMINI_API_KEY`, `MEM0_*` keys, `KITE_API_KEY`, `KITE_API_SECRET`, `YFINANCE_*` settings, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (default: sandbox number), `TWILIO_WEBHOOK_URL` (public HTTPS URL for signature verification), `GCS_BUCKET_NAME` (default: minto-wa-uploads), `SUPABASE_DB_URL` (direct postgres+psycopg:// URI — documented for future Agno PostgresDb use, not currently required).
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
- **WhatsApp bot on Cloud Run**: Same APScheduler instance also runs the daily reminder job (`wa_tax_reminders` at 9 AM IST). `send_whatsapp_alert()` in `services/whatsapp.py` is the shared Twilio send helper used by both the alert poller notifications and the WA bot reminder scheduler. `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` must be set.
- **Twilio signature verification on Cloud Run**: Cloud Run terminates TLS before the container, so `request.url` is http://. The router reconstructs the HTTPS URL from `X-Forwarded-Proto` + `Host` headers for `RequestValidator.validate()`. No `TWILIO_WEBHOOK_URL` env var needed — URL is derived from the request itself.
- **Tax engine accuracy**: `tax_engine.compute_tax_analysis()` is pure Python with no LLM. It implements Sec 70/71 (current-year STCL vs STCG, targeting higher-taxed gains first), Sec 72 (CF LTCL vs non-exempt non-equity LTCG first), Sec 112A (₹1.25L exemption), and 87A rebate re-check (total income including ALL capital gains). The `optimal_vs_naive_saving` field shows how much is saved by the non-exempt-first CF allocation vs naive allocation.
- **LLM document parsing**: `llm_doc_parser.py` uses `google.genai.Client` (not `google.generativeai` — the newer SDK). All PDFs are uploaded via `client.files.upload()` (File API) then immediately deleted after parsing. Returns typed Pydantic models validated with `model_validate(data, strict=False)` to tolerate partial LLM outputs.
- **DPDPA compliance pattern**: Raw files (PDFs, CSVs) go GCS → parsed → GCS deleted within 60s. `wa_documents` tracks `gcs_deleted_at`. `tax_documents` has no GCS column (web uploads are never stored in GCS — bytes come in, parsed in memory, bytes discarded). Both tables support DPDPA right-of-access (GET /tax/documents) and right-to-erasure (DELETE /tax/session or "Delete my data").
- **Session state persistence pattern**: Both WA bot and web tax agent are stateless Agno Agents. Session state is injected per `arun()` call from Supabase and saved back after. No Agno `PostgresDb` is used — all state goes through the Supabase REST client with `SUPABASE_SERVICE_ROLE_KEY`. History is reconstructed from the `messages` JSONB array and injected as `additional_context` (not via Agno's built-in history). This means no direct Postgres connection string is needed for the tax/WA features.
