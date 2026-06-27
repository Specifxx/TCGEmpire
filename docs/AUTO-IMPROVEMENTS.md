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
      add canonical to real content pages that lack it.
- [ ] JSON-LD coverage check (Org/Breadcrumb/FAQ/Dataset present); add ItemList/Product where useful.
- [ ] Internal-link audit now that the homepage SideNav is hidden + ToolDeck removed
      (ensure feature pages are still well-linked; consider a footer section list).

### Performance
- [ ] Audit unnecessary `"use client"` boundaries; trim homepage/browse client JS.
- [ ] `<img>` hygiene: explicit width/height + `loading`/`decoding` everywhere; verify hero preload.
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
