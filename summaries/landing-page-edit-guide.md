# Landing Page Edit Guide

How to edit the Minto web landing page after the scrollytelling and animation cleanup.

## Primary Files

```
web-app/src/app/page.tsx
web-app/src/app/globals.css
```

- `page.tsx` owns the landing page structure, section content, and GSAP setup.
- `globals.css` owns shared landing tokens, glass surfaces, the animated background, and cross-browser rendering helpers.

## Current Page Structure

The landing page is a single client component with seven sections:

1. Fixed navigation
2. Hero
3. Macro/problem setup
4. Pinned macro scrollytelling section
5. Chat demo
6. Portfolio demo
7. Pinned horizontal feature rail
8. Final CTA + footer

## Animation Architecture

GSAP lives in `web-app/src/app/page.tsx`.

### Registered plugin

```tsx
gsap.registerPlugin(ScrollTrigger);
```

### Animation patterns in use

- `useLayoutEffect` is used for all GSAP setup so measurements happen before paint.
- Every animated component uses `gsap.context(...)` and returns `ctx.revert()`.
- The two pinned scrollytelling sections also explicitly kill their timeline/tween and `ScrollTrigger` in cleanup.

### Pinned sections

There are two pinned sections:

#### Macro section

Target ref:

```tsx
const macoRef = useRef<HTMLDivElement>(null);
```

This section animates:

- `.macro-title`
- `.macro-card`
- `.macro-insight`

The trigger uses:

```tsx
pin: true,
scrub: 0.8,
anticipatePin: 1,
fastScrollEnd: true,
invalidateOnRefresh: true,
```

If you add new animated elements to the macro section, either:

- include them in the existing timeline, or
- give them their own scoped `gsap.context` with cleanup.

Do not add unmanaged `ScrollTrigger.create(...)` calls in this section.

#### Horizontal feature rail

Target ref:

```tsx
const pinnedSectionRef = useRef<HTMLDivElement>(null);
```

Important detail: the animation now moves the **track**, not each card individually.

```tsx
const track = pinnedSectionRef.current?.querySelector<HTMLElement>(".h-scroll-track");
```

Distance is computed from real layout width:

```tsx
const getDistance = () => {
  const viewportWidth = pinnedSectionRef.current?.offsetWidth ?? window.innerWidth;
  return Math.max(0, track.scrollWidth - viewportWidth);
};
```

This is what keeps the rail stable at 1280px, 1440px, 1920px, and other wide layouts.

If you add or remove cards, keep the `.h-scroll-track` / `.h-scroll-card` structure intact.

## Color and Surface Tokens

Landing-specific tokens now live in `globals.css` under `:root`.

### Core landing tokens

```css
:root {
  --landing-gradient-stop-1: var(--color-minto-bg-end);
  --landing-gradient-stop-2: #afc4a3;
  --landing-gradient-stop-3: var(--color-minto-bg);
  --landing-gradient-stop-4: #8cab89;
  --landing-gradient-stop-5: #d9e2cf;
  --landing-gradient-stop-6: #739673;
  --landing-gradient-stop-7: #bed0b3;
  --landing-gradient-stop-8: #ebf1e4;
  --landing-surface: rgba(255, 255, 255, 0.2);
  --landing-surface-strong: rgba(255, 255, 255, 0.62);
  --landing-dark-surface: rgba(255, 255, 255, 0.08);
  --landing-dark-border: rgba(255, 255, 255, 0.14);
  --landing-dark-bg-start: #1f2821;
  --landing-dark-bg-end: #101512;
}
```

### Shared Tailwind theme colors

These still come from `@theme` and are used as utility classes:

- `text-minto-text`
- `text-minto-text-secondary`
- `text-minto-text-muted`
- `bg-minto-accent`
- `text-minto-positive`
- `text-minto-negative`

### Glass surfaces

`globals.css` now maps the shared glass classes to the landing tokens:

- `.glass-card` → `--landing-surface`
- `.glass-elevated` → `--landing-surface-strong`
- `.landing-dark-glass` → dark pinned section surface

Use `.landing-dark-glass` instead of stacking `glass-elevated` with manual `bg-white/...` overrides inside dark sections.

## Background System

The animated background still renders globally from `web-app/src/app/layout.tsx`:

```tsx
<div className="animated-gradient-bg" />
```

The landing page wrapper should stay:

```tsx
<div className="landing-page min-h-screen overflow-x-hidden">
```

Do **not** add `bg-minto-bg` to the page root. That would flatten the animated gradient and reintroduce abrupt transitions between sections.

## Layout Rules

### Section 2 asymmetric layout

The problem section now uses a controlled grid:

```tsx
<div className="landing-grid grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,28rem)] items-center">
```

This keeps the text column visually dominant while preventing the card stack from collapsing awkwardly at wide-but-not-ultrawide widths.

### Section 5 split layout

The portfolio section uses:

```tsx
<div className="grid xl:grid-cols-[minmax(22rem,1fr)_minmax(0,0.92fr)] gap-16 items-center">
```

If you change content density here, adjust both columns together rather than only changing one side.

### Horizontal cards

Feature cards use viewport-aware minimum widths:

```tsx
min-w-[min(84vw,23rem)]
xl:min-w-[24rem]
```

Keep widths expressed this way so cards remain balanced at uncommon desktop sizes.

## Cross-Browser Rendering Helpers

`globals.css` includes rendering guards for the animated and pinned elements:

```css
.landing-pinned-panel,
.h-scroll-track,
.landing-feature-card,
.macro-card {
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  will-change: transform;
}
```

These are there to reduce jitter during pinned scroll and backdrop-filter transitions in Chrome, Safari, and Firefox.

## Reduced Motion

The landing page now respects reduced motion in `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .animated-gradient-bg {
    animation: none;
  }
}
```

If you add new continuous animations, include them in the same media query.

## Safe Editing Rules

### If you change text only

Edit `page.tsx` content directly. No CSS changes are needed.

### If you add a new card to the horizontal rail

Add another `.h-scroll-card` inside `.h-scroll-track`. Do not change the GSAP target from the track back to the cards.

### If you add a new pinned section

- use `useLayoutEffect`
- scope selectors with `gsap.context`
- kill the tween/timeline and its `ScrollTrigger` in cleanup
- prefer width- or height-based measurements using functions with `invalidateOnRefresh: true`

### If you change colors

Prefer editing landing tokens in `globals.css` instead of scattering new hardcoded values through JSX.

## Verification Commands

From `web-app/`:

```bash
npm run build
```

The production build validates:

- TypeScript correctness
- lint/type checks performed by Next.js during build
- App router compilation

## Files That Affect the Landing Page

- `web-app/src/app/page.tsx`
- `web-app/src/app/globals.css`
- `web-app/src/app/layout.tsx`
- `web-app/public/minto.png`
- `web-app/src/providers/auth-provider.tsx`

## Current Implementation Notes

- Logged-in users are still redirected from the landing page to `/chat`.
- The macro section uses a dedicated dark background and dark glass treatment.
- The global animated gradient remains visible behind all non-dark landing sections.
- Pinned section cleanup is explicit and should stay that way.
