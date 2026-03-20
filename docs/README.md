# Minto Engineering Handbook

The single source of truth for how Minto is built and how to work on it.

Minto is a multi-platform portfolio tracking and conversational financial intelligence app for Indian retail investors. Users import holdings, view portfolio analytics, set price alerts, chat with an AI research agent, and plan tax harvesting — all backed by live NSE/BSE and mutual fund data.

## Sections

| Section | What it covers |
|---|---|
| [Python Backend](backend.md) | FastAPI service, routers, services, DB, deployment |
| [AI Agents](agents.md) | Agent architecture, tools, prompts, model config, WhatsApp bot |
| [Web App](web-app.md) | Next.js frontend, routing, components, SSE streaming |
| [iOS / Mobile](ios.md) | Expo + React Native app, navigation, API client |

## Monorepo layout

```
/
├── backend/          # FastAPI Python backend
├── web-app/          # Next.js web frontend
├── app/              # Expo React Native mobile app
├── docs/             # This handbook
├── PRDs/             # Product requirements documents
├── summaries/        # Deep-dive writeups on specific subsystems
└── cloudbuild.yaml   # GCP Cloud Build → Cloud Run deployment
```

## Core principles

- **One YAML per concern** — all prompts live in `backend/app/prompts.yaml`, all model IDs and runtime config in `backend/app/model_config.yaml`. Nothing LLM-facing is hardcoded in Python.
- **Supabase is the data layer** — all user data lives in Supabase Postgres with RLS. The backend verifies JWTs and scopes every query by `user_id`.
- **Agents are thin wrappers** — agent files in `backend/app/agents/` only build and run agents. Tool logic lives in `backend/app/agent_tools/` or inline in the relevant service package.
- **Cache aggressively** — yfinance and MFAPI responses are TTL-cached in-process. Don't add network calls in hot paths without a cache layer.
- **Service-role key for background jobs only** — `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is used only by the alert poller and WhatsApp bot session store. Never use it in user-facing request handlers.

## Quick start

```bash
# Backend
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload

# Web app
cd web-app && npm install && npm run dev

# Mobile
pnpm install && pnpm ios
```
