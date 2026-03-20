# Web App

Next.js app with App Router, Tailwind CSS v4, and Supabase SSR auth. Authenticated routes run client-side; session management runs server-side via middleware.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js + React |
| Styling | Tailwind CSS v4, custom `@theme` design tokens |
| Auth | @supabase/ssr (SSR + middleware session refresh) |
| Charts | recharts |
| Markdown | react-markdown + remark-gfm |
| Icons | lucide-react |
| SSE streaming | fetch ReadableStream (native browser API) |
| Package manager | npm |

## Directory structure

```
web-app/src/
├── app/
│   ├── (app)/                    # Authenticated routes (guarded by layout.tsx)
│   │   ├── chat/page.tsx         # Chat with SSE streaming + widgets
│   │   ├── dashboard/page.tsx    # Portfolio analytics + donut charts
│   │   ├── holdings/page.tsx     # Holdings table + add modal
│   │   ├── search/page.tsx       # Instrument search
│   │   ├── alerts/page.tsx       # Price alerts management
│   │   ├── settings/page.tsx     # Profile + Zerodha connection
│   │   └── layout.tsx            # Auth guard + onboarding state machine
│   ├── onboarding/               # Risk ack, risk quiz, financial profile wizard
│   ├── login/page.tsx
│   └── auth/callback/            # Supabase OAuth callback
│
├── components/
│   ├── chat/
│   │   ├── message-list.tsx      # Scrollable message list with widget rendering
│   │   ├── message-bubble.tsx    # User / assistant bubbles with markdown
│   │   ├── chat-input.tsx        # Textarea + send + voice button
│   │   ├── voice-chat-modal.tsx  # WebRTC voice modal (portal-rendered)
│   │   ├── widget-price.tsx      # Price summary chip + detail modal
│   │   ├── widget-news.tsx       # News summary cards
│   │   └── widget-alert-setup.tsx # Interactive alert creation widget
│   ├── dashboard/                # Donut charts, portfolio summary, holdings tables
│   ├── holdings/                 # Add holding modal
│   ├── layout/
│   │   └── sidebar.tsx           # Navigation sidebar with market badges
│   └── ui/                       # Primitives: Card, Button, Badge, Spinner, Input, Modal
│
├── hooks/
│   ├── use-chat.ts               # Messages, SSE streaming, pagination
│   ├── use-dashboard.ts          # Portfolio analytics data
│   ├── use-holdings.ts           # Holdings CRUD
│   ├── use-search.ts             # Debounced instrument search
│   ├── use-alerts.ts             # Price alerts CRUD
│   └── use-financial-profile.ts
│
└── lib/
    ├── api.ts                    # apiGet/apiPost/apiPatch/apiDelete (proxied)
    ├── api-stream.ts             # SSE streaming via fetch ReadableStream
    ├── supabase/                 # Browser, server, and middleware Supabase clients
    ├── fund-classifier.ts        # Client-side MF type classification by regex
    ├── format.ts                 # Currency, percentage formatters
    └── constants.ts
```

## Auth and routing

Auth is handled entirely by Supabase. `middleware.ts` refreshes the session on every request. The `(app)/layout.tsx` checks `onboardingState` (from the `AuthProvider`) and redirects unauthenticated or incomplete users:

```
Not logged in           → /login
Logged in, no risk ack  → /onboarding/risk-ack
Logged in, no quiz      → /onboarding/risk-quiz
Logged in, no profile   → /onboarding/financial-profile
All complete            → render the app
```

## API proxying

The web app never calls the backend directly from the browser. All requests go through a Next.js rewrite:

```
/api/proxy/* → NEXT_PUBLIC_API_BASE_URL/*
```

This avoids CORS entirely. The rewrite is configured in `next.config.ts`.

## Chat and SSE streaming

`use-chat.ts` manages the full chat lifecycle:

1. Sends a message to `/chat/message/stream` via `apiStream()` (fetch ReadableStream).
2. Each `token` SSE event appends to the last assistant message in state — giving a live typing effect.
3. On stream end, refetches the latest page of messages from `/chat/messages` to get the persisted version with widgets.
4. Widget data lives in `metadata.widgets` on assistant messages. `MessageList` aggregates all `price_summary`, `news_summary`, and `alert_setup` widgets from a message and renders them below the bubble.

## Voice chat

`VoiceChatModal` is rendered via a React **Portal** directly onto `document.body` — bypassing the layout's `overflow-hidden` constraint that would clip a `position: fixed` element.

The modal:
1. Fetches an ephemeral token from `/chat/voice/token`.
2. Creates an `RTCPeerConnection`, adds the local microphone track, and sets up a data channel (`oai-events`).
3. Sends an SDP offer to `https://api.openai.com/v1/realtime?model=gpt-realtime-1.5`.
4. Receives audio from OpenAI and plays it via an `<audio autoplay>` element.
5. Transcripts stream in via `response.audio_transcript.delta` events. Two lines are shown below the orb — the previous speaker's completed line (dimmed) and the live streaming line — using `display: -webkit-box; -webkit-line-clamp: 2` so text wraps naturally as it streams rather than truncating.
6. Tool calls from OpenAI are proxied back through `/chat/voice/tool`.

## Design system

Tailwind CSS v4 with custom `@theme` tokens defined in `globals.css`:

| Token | Value | Usage |
|---|---|---|
| `minto-accent` | `#3d5a3e` | Primary green — buttons, active states, user transcript |
| `minto-positive` | `#3d8b4f` | Gains, up arrows |
| `minto-negative` | `#c4483e` | Losses, down arrows |
| `minto-text` | Near-black | Body text |
| `minto-text-muted` | Mid-grey | Secondary text, labels |

**Glassmorphism tiers:**
- `glass-card` — standard surfaces (0.25 opacity, 20px blur)
- `glass-elevated` — sidebar, chat input, voice modal (0.55 opacity, 24px blur)
- `glass-subtle` — nested elements (0.18 opacity, 14px blur)

Background: animated gradient with a 60-second breathing cycle via `background-position` on an oversized gradient.

## Running locally

```bash
cd web-app
npm install
npm run dev
```

Requires a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
