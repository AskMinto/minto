# Landing Page Edit Guide

How to edit the Minto web app landing page.

## Primary File

```
web-app/src/app/page.tsx
```

This is the **only file you need to edit** for content and layout changes. It's a single React component (`LandingPage`) that renders everything.

## Page Structure

The landing page has 4 sections, top to bottom:

```
┌──────────────────────────────────────┐
│  HEADER — logo + "Get Started" CTA   │
├──────────────────────────────────────┤
│                                      │
│  HERO — icon, headline, subtitle,    │
│         description, CTA button      │
│                                      │
├──────────────────────────────────────┤
│  FEATURE PILLS — 3 glass cards       │
├──────────────────────────────────────┤
│  FOOTER — disclaimer text            │
└──────────────────────────────────────┘
```

### Section Breakdown

**Header** (lines ~33–44):
```tsx
<header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
```
- Logo: `<Image src="/minto.png" ... />` — the logo lives at `web-app/public/minto.png`
- Brand name: `<span>Minto</span>`
- CTA button: links to `/login`

**Hero** (lines ~47–72):
```tsx
<main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-3xl mx-auto -mt-16">
```
- Logo icon in a glass card
- Headline: `"Meet Minto"` — `text-5xl md:text-6xl font-bold`
- Subtitle: `"Your AI Portfolio Assistant"` — `text-xl md:text-2xl`
- Description paragraph — `text-base max-w-lg`
- CTA button: `"Get Started"` with arrow icon, links to `/login`

**Feature Pills** (lines ~74–88):
```tsx
<div className="flex flex-wrap justify-center gap-4 mt-16">
```
- Array of `{ icon, label }` objects rendered as glass cards
- Icons from `lucide-react`: `MessageCircle`, `BarChart3`, `Shield`
- To add/remove/change features, edit the array

**Footer** (lines ~91–93):
```tsx
<footer className="text-center py-6 text-sm text-minto-text-muted">
```
- Disclaimer text

## Auth Redirect Behavior

The page checks auth state on mount. **Logged-in users are immediately redirected to `/chat`** and never see the landing page:

```tsx
useEffect(() => {
  if (!loading && session) {
    router.replace("/chat");
  }
}, [session, loading, router]);
```

While loading or if the user has a session, a spinner is shown instead of the page content. If you want to show the landing page to logged-in users too (e.g., for marketing), remove this redirect logic.

## Styling Reference

### Tailwind Color Classes

All custom colors are available as Tailwind utilities via `@theme` in `globals.css`:

| Class prefix | Color | Hex |
|---|---|---|
| `text-minto-text` | Primary text | `#2d3a2e` |
| `text-minto-text-secondary` | Secondary text | `#5a6b5c` |
| `text-minto-text-muted` | Muted/label text | `#8a9a8c` |
| `bg-minto-accent` | Primary green | `#3d5a3e` |
| `text-minto-positive` | Gain green | `#3d8b4f` |
| `text-minto-negative` | Loss red | `#c4483e` |
| `text-minto-gold` | Gold accent | `#b8943e` |

Usage: `text-minto-accent`, `bg-minto-accent/10` (10% opacity), `border-minto-gold/20`, etc.

### Glass Effects

Three CSS utility classes available (defined in `globals.css`):

| Class | Background | Blur | Use for |
|---|---|---|---|
| `glass-card` | `rgba(255,255,255,0.25)` | 20px | Standard cards, badges, feature pills |
| `glass-elevated` | `rgba(255,255,255,0.55)` | 24px | Prominent panels, headers |
| `glass-subtle` | `rgba(255,255,255,0.18)` | 14px | Nested elements, inputs |

All include `backdrop-filter`, `saturate()`, `border`, `box-shadow`, and `inset` highlight.

### Background

The animated gradient is applied globally via `<div className="animated-gradient-bg" />` in `layout.tsx`. The landing page sits on top of it — no need to set a background.

### Typography

- Font: **DM Sans** (400/500/700), applied globally via `--font-dm-sans` CSS variable
- Large headings: `text-5xl md:text-6xl font-bold tracking-tight`
- Subtitles: `text-xl md:text-2xl text-minto-text-secondary`
- Body: `text-base text-minto-text-muted`
- Labels/pills: `text-sm font-medium`

### Buttons

Primary CTA pattern used on the landing page:
```tsx
<Link
  href="/login"
  className="bg-minto-accent text-white px-8 py-3.5 rounded-full text-base font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
>
  Get Started <ArrowRight size={18} />
</Link>
```

Alternatively, use the `<Button>` component from `@/components/ui/button` which has `primary`, `secondary`, `destructive`, and `ghost` variants.

### Icons

Icons come from `lucide-react`. Browse available icons at [lucide.dev/icons](https://lucide.dev/icons).

```tsx
import { MessageCircle, BarChart3, Shield } from "lucide-react";
<Icon size={18} className="text-minto-accent" />
```

## Files That Affect the Landing Page

| File | What it controls |
|---|---|
| `web-app/src/app/page.tsx` | Page content, layout, and logic |
| `web-app/src/app/globals.css` | Glass effects, animated background, color theme, markdown styles |
| `web-app/src/app/layout.tsx` | Root layout — animated gradient `<div>`, font loading, `<AuthProvider>` |
| `web-app/src/lib/constants.ts` | `THEME` colors object (used by chart components, not directly by landing page) |
| `web-app/src/providers/auth-provider.tsx` | Auth state — controls the redirect-if-logged-in behavior |
| `web-app/public/minto.png` | Logo image |
| `web-app/src/components/ui/button.tsx` | Reusable `<Button>` component (optional — landing page currently uses raw `<Link>`) |

## Common Edits

### Change the headline
```tsx
// In page.tsx, find:
<h1 className="text-5xl md:text-6xl font-bold text-minto-text tracking-tight mb-6 leading-tight">
  Meet Minto
</h1>
// Change the text inside
```

### Change the subtitle / description
```tsx
// Subtitle:
<p className="text-xl md:text-2xl text-minto-text-secondary mb-4 leading-relaxed">
  Your AI Portfolio Assistant
</p>
// Description:
<p className="text-base text-minto-text-muted mb-10 max-w-lg">
  Track your Indian market portfolio...
</p>
```

### Add a new feature pill
```tsx
// Find the feature pills array and add an entry:
{[
  { icon: MessageCircle, label: "AI Chat Assistant" },
  { icon: BarChart3, label: "Portfolio Analytics" },
  { icon: Shield, label: "Risk Insights" },
  { icon: TrendingUp, label: "Market News" },  // ← new
].map(({ icon: Icon, label }) => (
```
Remember to import the icon: `import { TrendingUp } from "lucide-react";`

### Add a new section (e.g., testimonials, screenshots)
Insert a new `<section>` between `</main>` and `<footer>`:
```tsx
{/* Testimonials */}
<section className="max-w-4xl mx-auto px-6 py-16">
  <h2 className="text-2xl font-bold text-minto-text text-center mb-8">
    What investors say
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="glass-card p-6">
      <p className="text-sm text-minto-text-secondary">"Quote here"</p>
      <p className="text-xs text-minto-text-muted mt-2">— Name</p>
    </div>
    {/* ... more cards */}
  </div>
</section>
```

### Change the background gradient colors
Edit `globals.css`:
```css
.animated-gradient-bg {
  background: linear-gradient(
    160deg,
    #d4dcc8 0%,    /* ← lightest sage */
    #9ebf9c 14%,   /* ← medium green */
    #c8d5c0 28%,   /* ← light sage */
    ...
  );
}
```

### Change the accent color
Edit `globals.css` under `@theme`:
```css
@theme {
  --color-minto-accent: #3d5a3e;  /* ← change this */
}
```
This propagates to all `bg-minto-accent`, `text-minto-accent`, `border-minto-accent` usages.

### Replace the logo
Replace `web-app/public/minto.png` with a new image (same filename), or update the `src` in the `<Image>` tags.

## Dev Server

```bash
cd web-app
npm run dev
```

The landing page is at `http://localhost:3000`. Changes to `page.tsx` hot-reload instantly. Changes to `globals.css` also hot-reload. If you see stale content, delete `.next/` and restart.
