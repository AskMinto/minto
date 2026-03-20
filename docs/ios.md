# iOS / Mobile App

Expo + React Native app using Expo Router for file-based navigation. Targets iOS and Android from a single codebase, sharing the same Supabase backend and REST API as the web app.

## Stack

| Layer | Technology |
|---|---|
| Framework | Expo + React Native + React |
| Navigation | Expo Router (file-based, tab + stack) |
| Auth | Supabase JS + expo-web-browser (Google OAuth) |
| Animation | react-native-reanimated |
| Charts | react-native-svg |
| Markdown | react-native-markdown-display |
| Fonts | DM Sans (@expo-google-fonts/dm-sans) |
| Gradient | expo-linear-gradient |
| File picker | expo-document-picker (CAS PDF upload) |
| Icons | lucide-react-native |
| Package manager | pnpm |

## Directory structure

```
app/
├── _layout.tsx               # Root layout: auth gating, animated gradient background
├── index.tsx                 # "Ask Minto" home screen: greeting, market badges, commentary chips
├── login.tsx                 # Google OAuth via Supabase + expo-web-browser
│
├── (tabs)/
│   ├── _layout.tsx           # Custom animated bottom tab bar (4 tabs + expandable chat input)
│   ├── home.tsx              # Home / Ask Minto
│   ├── dashboard.tsx         # Portfolio dashboard
│   ├── search.tsx            # Market search
│   └── profile.tsx           # User profile
│
├── (onboarding)/
│   ├── risk-ack.tsx          # Risk disclaimer acknowledgment
│   ├── risk-quiz.tsx         # 5-question risk profiling quiz
│   └── connect-zerodha.tsx   # Optional Zerodha import during onboarding
│
├── chat/
│   └── index.tsx             # Chat screen with XHR-based SSE streaming
│
├── portfolio/
│   ├── index.tsx             # Holdings list
│   ├── add.tsx               # Add holding form
│   └── connections.tsx       # Data source connections
│
└── instrument/
    ├── [symbol].tsx          # Equity detail: 30-day chart, stats, news
    └── mf/[code].tsx         # MF detail: NAV chart, returns, fund info

components/
├── AnimatedGradient.tsx      # Breathing gradient background (12s cycle)
├── Themed.tsx                # Theme-aware Text and View wrappers
└── StyledText.tsx

lib/
├── api.ts                    # apiGet/apiPost/apiStream (XHR-based SSE)
├── supabase.ts               # Supabase client
└── onboarding-context.tsx    # Onboarding state provider

constants/
├── Theme.ts                  # Design system: colors, radii, fonts, spacing
└── Colors.ts                 # Light/dark palette
```

## Navigation

Expo Router uses file-based routing. The root `_layout.tsx` checks auth and onboarding state:

- No session → redirect to `login`
- No risk ack → redirect to `(onboarding)/risk-ack`
- No risk quiz → redirect to `(onboarding)/risk-quiz`
- All complete → render `(tabs)` layout

The `(tabs)` layout renders a custom animated bottom tab bar with 4 tabs (Home, Dashboard, Search, Profile) and an expandable chat input that slides up from the bar.

## SSE streaming

React Native does not support the browser `EventSource` API, so chat streaming uses a custom **XHR-based** implementation in `lib/api.ts`. The `apiStream` function opens an `XMLHttpRequest` in streaming mode and manually parses `data:` prefixed lines from the response chunks as they arrive — equivalent to what the web app does with `fetch` ReadableStream.

## Auth

Google OAuth is handled via `expo-web-browser` opening a Supabase OAuth URL, with the result returned via deep link. The Supabase JS client manages the session and token refresh automatically.

## Design system

`constants/Theme.ts` defines the full design token set:

| Token | Value | Usage |
|---|---|---|
| Accent | `#3d5a3e` | Buttons, active tabs, highlights |
| Positive | `#3d8b4f` | Gains |
| Negative | `#c4483e` | Losses |
| Glass | `rgba(255,255,255,0.55)` | Card surfaces |
| Radius | 16 / 20 / 24 | Card / sheet / pill |

The animated gradient background (`AnimatedGradient.tsx`) uses `react-native-reanimated` to cycle through 4 muted green/sage tones on a 12-second loop, giving the app its signature ambient feel.

## Running locally

```bash
pnpm install
pnpm start        # Expo dev server
pnpm ios          # Run on iOS simulator
pnpm android      # Run on Android emulator
pnpm web          # Run in browser (limited)
```

Requires environment variables in a root `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_BASE_URL=https://your-backend-url
```

## Key differences from the web app

| Area | Web | Mobile |
|---|---|---|
| SSE streaming | fetch ReadableStream | XHR with manual chunk parsing |
| Auth flow | @supabase/ssr + middleware | Supabase JS + expo-web-browser |
| Navigation | Next.js App Router | Expo Router (file-based) |
| Styling | Tailwind CSS v4 | StyleSheet.create + Theme.ts |
| Rendering | SSR + client | Client only (RN) |
| Voice chat | WebRTC (browser native) | Not yet implemented |
