# Minto Engineering Handbook

Welcome to the Minto Engineering Handbook — the single source of truth for how Minto is built, how its systems fit together, and how to work on them safely.

Minto is a multi-platform portfolio tracking and conversational financial intelligence app for Indian retail investors. It lets users import their holdings, view portfolio analytics, set price alerts, and have natural-language conversations with an AI research agent — all backed by live NSE/BSE and mutual fund data.

## What's in this handbook

| Section | What it covers |
|---|---|
| [Python Backend](backend.md) | FastAPI service, routers, services, DB, deployment |
| [AI Agents](agents.md) | Agent architecture, tools, prompts, model config |
| [Web App](web-app.md) | Next.js frontend, routing, components, SSE streaming |
| [iOS / Mobile](ios.md) | Expo + React Native app, navigation, API client |

## Monorepo layout

```
/
├── backend/          # FastAPI Python backend
├── web-app/          # Next.js 15 web frontend
├── app/              # Expo React Native mobile app
├── docs/             # This handbook
├── README.md         # Monorepo overview
└── cloudbuild.yaml   # GCP Cloud Build deployment
```

## Key principles

- **One YAML per concern** — all prompts live in `backend/app/prompts.yaml`, all model config in `backend/app/model_config.yaml`. No LLM-facing strings or model names are hardcoded in Python.
- **Supabase is the source of truth** — all user data is in Supabase Postgres with RLS enforced. The backend verifies JWTs and scopes all queries by `user_id`.
- **Agents are thin orchestrators** — agent files in `backend/app/agents/` only build and run agents. All tool logic lives in `backend/app/agent_tools/`.
- **Cache everything that hits an external API** — yfinance and MFAPI responses are TTL-cached. Prompt caching is enabled on the OpenAI Realtime API.
