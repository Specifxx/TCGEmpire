# RiftCompare — Autonomous Improvements Log

Self-driven improvement loop. Branch: `claude/riftcompare-mobile-app-hBUYw`. Every item
is verified (`tsc --noEmit` + `next build` green) before commit; deploy to `main` ~hourly.
Constraint: the app can't be run with live data here, so visual-only tweaks are kept small
and reversible and flagged "visual — verify on Vercel".

## Backlog (prioritized)

### Accessibility
- [x] Global `:focus-visible` keyboard focus ring (none existed) — shipped.
- [ ] `aria-label` audit on icon-only controls (wishlist, user menu, mobile nav, switchers).
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
- [ ] Remove dead `Partners.tsx` (replaced by the hero trust line) — confirm zero imports first.

### Mobile UX / polish
- [ ] 375px mental-model pass on key pages; tap-target sizes ≥ 40px.

## NEEDS-DECISION
- (none yet)

## Done
- **a11y: global `:focus-visible` ring** — keyboard users now get a brand-green focus
  outline on every interactive element site-wide (there was none). Mouse clicks
  unaffected (`:focus-visible`). Self-review caught/removed a stray `border-radius`
  that would have squared off focused elements.
