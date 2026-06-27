# RiftCompare — Autonomous Improvements Log

Self-driven improvement loop. Branch: `claude/riftcompare-mobile-app-hBUYw`. Every item
is verified (`tsc --noEmit` + `next build` "Compiled successfully") before commit.
Constraint: the app can't be run with live data here, so visual-only tweaks are kept small
and reversible and flagged "visual — verify on Vercel".

**Driver:** `.github/workflows/auto-improve.yml` — a scheduled GitHub Action (every 30 min)
runs Claude Code headlessly to make one verified improvement per run and keep a single PR
to `main` open for review. This runs on GitHub's infrastructure, so it's reliable 24/7
(unlike an in-session timer, which dies when the web container is reclaimed). Requires the
repo secret `CLAUDE_CODE_OAUTH_TOKEN`.

## Backlog (prioritized)

### Accessibility
- [x] Global `:focus-visible` keyboard focus ring (none existed) — shipped.
- [x] `aria-label` audit on icon-only controls — all major controls already labelled; added missing labels to ±qty buttons in ForumBoard + ProxyBuilder.
- [ ] Decorative `<img>` → `alt="" aria-hidden`; meaningful images get real alt text.
- [ ] Reduced-motion: confirm any new motion respects it.

### SEO
- [ ] Pages missing canonical/robots: noindex utility/auth/admin pages (login, register,
      verify, forgot, profile, admin/*, marketplace orders) rather than canonical;
      add canonical to real content pages that lack it. *(Audited — already done site-wide)*
- [x] JSON-LD coverage check — added BreadcrumbList + ItemList to `/guides`; blog index, `/browse`, `/marketplace` still candidates.
- [x] JSON-LD: add Blog + BreadcrumbList to blog index — done.
- [x] JSON-LD: add ItemList to games page — done.
- [ ] JSON-LD: add CollectionPage to marketplace (currently noindex / private beta; defer until public launch).
- [x] Internal-link audit: added footer site-map grid (NAV_GROUPS) so every feature is
      linked on every page even when the xl SideNav is absent (mobile, homepage, smaller desktops).

### Performance
- [ ] Audit unnecessary `"use client"` boundaries; trim homepage/browse client JS.
- [x] `<img>` hygiene: `decoding="async"` — added to all 25 lazy-loaded img tags across 23 files (off-main-thread decode). Remaining: explicit width/height on a few remaining thumbnails; verify hero preload.
- [ ] Over-fetching check on homepage/browse/card data paths.

### Cleanup
- [x] Remove dead `Partners.tsx` (replaced by the hero trust line) — confirmed zero imports, deleted.

### Mobile UX / polish
- [ ] 375px mental-model pass on key pages; tap-target sizes ≥ 40px.

## NEEDS-DECISION
- (none yet)

## Done
- **a11y: global `:focus-visible` ring** — keyboard users now get a brand-green focus
  outline on every interactive element site-wide (there was none). Mouse clicks
  unaffected (`:focus-visible`). Self-review caught/removed a stray `border-radius`
  that would have squared off focused elements.
- **a11y + cleanup: aria-labels on ±qty buttons + delete dead Partners.tsx** — added
  `aria-label="Decrease quantity"` / `"Increase quantity"` to the icon-only −/+ buttons in
  ForumBoard.tsx and ProxyBuilder.tsx (all other icon controls were already labelled).
  Deleted Partners.tsx (zero imports; replaced by inline trust-line in CinematicHero).
- **perf: `decoding="async"` on all lazy card images** — added `decoding="async"` to all 25 lazy-loaded `<img>` tags across 23 files (SearchBar, MarketplaceClient, WishlistDrawer, MyCollection, MarketplaceOrders, PriceWatch, Riftle, MarketPulse, TodaysTopDeals, ProxyBuilder, HoldingsGrid, games/PackSim, games/shared, games/CardSmash, learn/LegendQuiz, learn/DomainExplorer, + 7 app pages). Images now decode off the main thread, reducing frame jank during scroll.
- **SEO/internal-links: footer site-map grid** — added a `<nav aria-label="Site map">` grid
  in `layout.tsx` footer, driven by the shared `NAV_GROUPS` data. Ensures every feature page
  (Card Database, Arbitrage, Meta Decks, Games, Forum, etc.) is linked from every page even
  when the xl SideNav is absent (mobile, homepage, smaller desktops). 2-col → 3-col → 6-col
  responsive. Visual — verify on Vercel.
- **SEO: JSON-LD BreadcrumbList + ItemList on /guides** — the Guides index page now emits
  two schema.org blocks: a BreadcrumbList (Home → Guides) and an ItemList enumerating every
  guide with its title, URL, and excerpt. Enables rich results for the guides listing in
  Google Search. Build-time safe (reads static ARTICLES array, no DB call).
- **SEO: JSON-LD BreadcrumbList + Blog on /blog** — the Blog index now emits a BreadcrumbList
  (Home → Blog) and a Blog schema with up to 20 BlogPosting entries (headline, url, description,
  datePublished, author). Enables rich results for the blog listing. Payload capped at 20 items
  to stay lean even as market reports accumulate.
- **SEO: JSON-LD ItemList on /games** — the Games hub now emits a BreadcrumbList (Home → Games)
  and an ItemList enumerating all 8 games with their name, URL, and description. Enables rich
  results for the games arcade in Google Search. Build-time safe (reads static GAMES array, no DB call).
