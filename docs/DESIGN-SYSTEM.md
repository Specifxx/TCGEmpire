# RiftCompare Design System

Written at the end of the September 2026 UI/UX sophistication pass (P0–P8, see
`DECISIONS.md`). This is the reference for anyone adding a component or a
new piece of chrome — read it before reaching for a bare `duration-300`,
`z-[N]`, or a new overlay pattern.

**The one rule everything below serves**: sophistication is added
client-side, on top of HTML the server already produces. No new server
reads, no new `unstable_cache`, no lowered `revalidate`, no
`generateStaticParams`. See "How to add a component" at the bottom.

## Palette

Dark is the default theme; a light theme exists under
`:root[data-theme="light"]` (`src/lib/theme-shared.ts`) and redefines every
variable below — `tests/theme.test.ts` pins that both sets stay in sync.
Colors are RGB triplets in CSS custom properties (`--c-*` in
`src/app/globals.css`), wrapped by `tailwind.config.ts` as
`rgb(var(--c-x) / <alpha-value>)` so opacity modifiers (`bg-ink-900/50`)
keep working.

| Token | Dark value | Use |
|---|---|---|
| `ink-950`…`ink-600` | `#0a0c10`→`#333b4d` | Backgrounds, borders, surfaces — the neutral graphite scale |
| `brand` / `brand-400` | `#1ea65c` / `#34d17e` | The one sharp accent. `brand-400` is the link/text shade; `500`/`600` are fills and borders |
| `slate-100`…`slate-900` | lifted off Tailwind stock | Secondary text. **Lifted for contrast** — stock `slate-500`/`600` measured under 4.5:1 on this palette's surfaces; these replacements clear it with margin. Never reach for an un-themed grey |
| `accent` | `#eef1f5` | High-contrast numerals — prices, tickers |
| `gold` | `#caa85a` | Reserved for genuine gold/foil semantics (Premium, rarity). Never generic UI chrome |
| `up` / `down` | `#3fb950` / `#f0506e` | Market deltas. Calm, not neon |

## Radius

A tightened scale (`tailwind.config.ts`'s `borderRadius`) — the Tailwind
default (12–24px) reads soft and consumer-app; this reads terminal:

```
md: 4px   lg: 6px   xl: 8px   2xl: 10px   3xl: 12px
```

## Shadows

Two only, both flat — a hairline top highlight plus a quiet drop, no
coloured glow:

```
shadow-card: 0 1px 0 rgba(255,255,255,.02), 0 1px 2px rgba(0,0,0,.4)
shadow-glow: 0 1px 0 rgba(255,255,255,.03), 0 4px 12px rgba(0,0,0,.45)
```

## Motion tokens

Single source of truth: `src/lib/motion-tokens.ts` — a dependency-free
plain object, imported by both `tailwind.config.ts` (relative path; the
`@/` alias doesn't resolve in Next's jiti-loaded config) and runtime JS via
`src/lib/motion.ts`. `tests/design-system.test.ts` pins that the Tailwind
config's `extend` blocks equal these numbers exactly.

**Durations** (`duration-*`, owner brief: "refined & fast"):

| Token | ms | Use |
|---|---|---|
| `fast` | 120 | Overlay exits, hover states, focus rings |
| `base` | 200 | The default — overlay entrances, nudges, tab indicators |
| `slow` | 320 | Deliberate motion — the phone nav menu, image hover zoom |
| `page` | 150 | Route-change fade (`template.tsx`) |
| `count` | 1100 | `CountUp`'s number-ticking duration (not a CSS transition) |

**Easing** (`ease-*` — before this pass there were **zero** `ease-*`
usages anywhere in `src/`; every transition rode the browser default):

- `out` — `cubic-bezier(0.16, 1, 0.3, 1)` — the one curve used everywhere
  motion "settles". Set as Tailwind's `transitionTimingFunction.DEFAULT`,
  so every bare `transition-*`/`transition-colors` utility already in the
  codebase inherited it for free.
- `in-out` — `cubic-bezier(0.65, 0, 0.35, 1)` — for state that animates
  both in and out through the same path (tab indicators sliding between
  positions).

## Z-index scale

`z-*` Tailwind utilities from `src/lib/motion-tokens.ts`'s `Z` object.
Reach for one of these; don't invent a bare `z-[N]`.

| Token | Value | Use |
|---|---|---|
| `rail` | 20 | SideNav |
| `flyout` | 30 | SideNav's hover flyouts |
| `header` | 40 | Navbar |
| `bottombar` | 40 | BottomTabBar (mobile) |
| `dropdown` | 50 | SearchBar's dropdown, CountrySwitcher |
| `overlay` | 60 | QuickView / SealedQuickView |
| `nudge` | 70 | *(the three corner nudges use a hardcoded `z-[70]`, see below)* |
| `toast` | 80 | `ui/Toast` |
| `sheet` | 85 | Bottom-sheet dialogs (`Dialog placement="sheet"`) |
| `menu` | 95 | CinematicNavMenu |
| `modal` | 120 | PremiumDialog and other true modals |
| `skip` | 200 | *(the skip link uses a hardcoded `focus:z-[200]`, see below)* |

**Two literals stay hardcoded outside the scale, on purpose**: the corner
nudges' `z-[70]` (`SignupPromoPopup.tsx`, `PremiumSlideIn.tsx`,
`AnnualSwitchNudge.tsx` — pinned by `tests/signup-slidein.test.ts`) and the
skip link's `focus:z-[200]` (`layout.tsx`). Both predate `motion-tokens.ts`;
changing the literal string, not just the underlying number, would break
their tests for no visual gain. `NextTopLoader` also sits at `200` so the
route progress bar always wins over every overlay's backdrop.

## The `motion-safe:` convention

Every hidden/entering state introduced since this pass is written with a
`motion-safe:` prefix — e.g. `motion-safe:opacity-0
motion-safe:translate-y-2` — **never** a bare `opacity-0`. A
reduced-motion visitor's first render already resolves the class variant
to nothing, so there's no hidden frame to flash past. The global
`@media (prefers-reduced-motion: reduce)` block at the bottom of
`globals.css` (verified last by `tests/design-system.test.ts`) is the
belt — it forcibly zeroes every animation/transition duration for
anything that slips through (JS-driven state, a missed prefix);
`motion-safe:` is the braces. `src/lib/motion.ts`'s `usePresence()` is the
JS half of the same contract: under reduced motion it sets `entered` true
(and unmounts) immediately rather than waiting out a transition that will
never visibly run.

**The one exception**: a component that stays permanently mounted and
class-toggled rather than mount/unmount (`CinematicNavMenu` is the only
one) must NOT gate its hidden state behind `motion-safe:` — that state has
to stay visually hidden for every visitor, reduced-motion included, since
there's no unmount to fall back on. Only the transition *speed* skips for
those, via the same global reduced-motion nuke.

## The one-shimmer rule

Exactly one shimmer effect exists sitewide: `.premium-shimmer` (gold
sheen), used on exactly one element — the "✦ Premium" phone-header link
(`Navbar.tsx`). Defined once (keyframes in `tailwind.config.ts`, the
gradient utility in `globals.css`, declared before the reduced-motion
block), and carries `motion-reduce:animate-none`.
`tests/premium-pitch-panel.test.ts` pins all of this. A retired
headline shimmer (`.brand-shimmer`) and CTA sweep (`.cta-shine`) are
tombstoned in `globals.css` — don't resurrect either. If a new surface
wants a shine effect, that's a product conversation first: "make one
element on Premium shimmer" was an explicit, narrow decision, not a
pattern to extend.

## Primitives

**Base classes** (`globals.css` `@layer components`):

- `.card-surface` — the flat terminal panel: hairline border, square-ish
  corners, quiet elevation (`shadow-card`).
- `.btn` / `.btn-primary` / `.btn-ghost` — button base + variants.
  `.btn[aria-busy="true"]` dims and disables pointer events, driven by
  Tailwind's native `aria-busy:` variant — pair with `ui/Skeleton`'s
  `<Spinner>` for an in-flight action.
- `.input` — text inputs.
- `.chip` — small pill (filters, tags, tier badges).
- `.num` — tabular numerals for prices/tickers (the terminal voice).
- `.tap-link` / `.tap-link-block` / `.tap-icon` / `.min-h-11` — under
  `(pointer: coarse)`, these grow to a 48px floor (Lighthouse's
  touch-target minimum). `.tap-list > * + *` drops the list gap on top of
  that so a list of 48px rows doesn't double-stack spacing.
- `.above-bottombar` — anchors a fixed bottom-corner element above the
  mobile tab bar AND the native AdMob banner, wherever either applies;
  collapses to a plain `1rem` inset on desktop. Use this, never a
  hardcoded `bottom-4`, for anything `fixed` to a bottom corner.
- `.rb-eyebrow` — tracked, uppercase micro-heading for short labels only
  ("Recently viewed", "NEW SET"). Not a substitute for a real `<h2>`.

**`src/components/ui/`** — the shared overlay/feedback/loading primitives.
Every one of these owns its own motion (`usePresence`), so a caller never
hand-rolls mount/unmount timing:

| Component | Exports | Notes |
|---|---|---|
| `Dialog.tsx` | `Dialog`, `useScrollLock`, `useModalFlag`, `DialogSize`/`DialogPlacement`/`DialogZ` | The shell every modal/sheet is built on. `placement="sheet"` gives a true bottom sheet below `sm`, centred from `sm` up. `useScrollLock`/`useModalFlag` are **refcounted module-level** state — several overlays share one scroll lock and one `document.body.dataset.rcDialog` flag, so nudges yield to whichever one is open. |
| `Skeleton.tsx` | `Skeleton`, `SkeletonText`, `SkeletonTile`, `Spinner` | Shaped loading placeholders. Prefer a shape that mirrors the real content (`SkeletonTile` mirrors `CardTile`) over a generic spinner — a skeleton whose shape differs from what arrives is worse than no skeleton. |
| `EmptyState.tsx` | `EmptyState` | `{ icon?, title, body?, primary?, secondary?, bare?, children? }`. `bare` drops the card chrome for compact contexts (the notification bell's dropdown). |
| `Toast.tsx` | `Toast` | Presentational bottom toast, `role="status" aria-live="polite"`. Anchored via `.above-bottombar`. |
| `Tooltip.tsx` | `Tooltip` | Render-prop trigger — hands the caller `aria-describedby` + hover/focus/Escape handlers. First tap on touch reveals; a second tap (or any mouse click) follows through. |
| `SegmentedTabs.tsx` | `SegmentedTabs`, `SegmentedTab` | Real WAI-ARIA tabs (roving tabindex, Arrow/Home/End) with a measured, animated pill/underline indicator. `renderAllPanels` keeps every panel in the DOM (`hidden`, not unmounted) when crawlability/JSON-LD parity matters. |

## Icons: `NavIcon`

`src/components/NavIcon.tsx` — drawn-in-house SVGs, one idiom sitewide:
24px viewBox, `currentColor` stroke, 1.75 width, round caps, no `<title>`
(the caller's own `aria-label` already names the control), `aria-hidden` +
`focusable="false"`. No icon library dependency for what is, as of this
pass, under twenty glyphs — nothing here carries a licence or an
attribution requirement.

**Adding one**: add the name to the `NavIconName` union, then a matching
key in the `ICONS` record — `tests/design-system.test.ts` fails the build
if a union member has no drawing (a type error, not a silent blank
square). Check first whether an existing icon already covers the concept
(`Search` and `Portfolio` in `BottomTabBar.tsx` reuse `browse` and
`collection` rather than drawing near-duplicates) — readable-at-20px is
the whole constraint, and two similar silhouettes are worse than one
shared icon.

## The emoji policy

**Chrome uses `NavIcon`. Game content keeps its emoji.** Decorative emoji
in nav, headings, CTAs and chrome — `nav-groups.ts`'s per-link `emoji`
field, the phone menu, ⌘K, headings across the site — is gone; every
repeated chrome CONCEPT (bell, lock, chart, trophy, wrench, import, gift,
home, menu) got a drawn `NavIcon` instead, and a one-off tile decoration
that appeared once was simply dropped to text. This is because emoji
render as a different visual language from everything else on the site,
a different typeface (and shape) per OS, can't take the brand colour, and
can't go semi-transparent when inactive — it's the single strongest
"looks AI-generated" signal a reviewer named.

**Explicitly kept**: Riftle's share-result grid and in-game glyphs, rank
medals (🥇🥈🥉) on game leaderboards, and any emoji that IS the content
(a card's own printed text, a user's display name). If you're touching a
component and see an emoji, ask "is this decorating chrome, or is it the
thing itself" before removing it.

## Islands render empty on the server

Every client-only feature added in this pass — `RecentlyViewedRail`,
`WelcomeBack`, `WelcomeChecklist`, `PremiumProofLine`, `WatchlistSnapshot`,
`BottomTabBar`'s watch-count badge — renders **nothing** (or its
loading/empty state) on the server and hydrates into its real state
client-side. None of them add a server read, a cookie/header read, or any
per-visitor branching to an ISR-cached route's render path. This is what
lets a homepage-audit run signed-out with empty `localStorage` and see the
exact same DOM budget the page always had — the new surfaces are additive
to hydration, never to the cached HTML.

If you're adding a personalised surface: fetch client-side (a `useEffect`
or a shared module-level store like `use-me.ts`/`use-watchlist.ts`/
`use-unread.ts`), gate the render on `loaded`, and return `null` (or a
skeleton) until it resolves. Never make the page component itself
`force-dynamic` or read a cookie just to personalise one small island —
that's the difference between "cached HTML plus a client patch" and
"the whole page opts out of caching."

## How to add a component

1. **Overlay/modal?** Build it on `ui/Dialog`, don't hand-roll scroll
   lock, focus trap or the `rcDialog` flag. Pick a `placement`
   (`center`/`top`/`sheet`) and a `z`.
2. **Loading state?** Reach for `ui/Skeleton`'s exports before a bare
   spinner; shape it like the real content if it's replacing a grid/list.
3. **Nothing here yet?** `ui/EmptyState`, not a hand-written `<p>` +
   `<Link>` block.
4. **Entrance/exit timing?** `usePresence(open, exitMs)` from
   `src/lib/motion.ts` — never a hand-rolled double-`requestAnimationFrame`
   or a bare `setTimeout` for "wait for the transition to finish."
5. **Any new hidden/entering class?** Write it `motion-safe:`-prefixed.
6. **A `fixed` bottom-corner element?** `.above-bottombar`, not
   `bottom-4`.
7. **Personalised or client-only content on a cached route?** Read
   "Islands render empty on the server" above first.
8. **An icon?** Check `NavIcon`'s existing set before drawing a new one;
   emoji is for game content only.
9. **Run the guardrails**: `npm run typecheck && npm run lint && npm test`
   (needs `npx prisma generate` first) — `tests/design-system.test.ts`
   specifically exists to catch a new component quietly reinventing a
   pattern this file already names.
