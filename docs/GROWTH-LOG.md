# RiftCompare — Daily Growth Log

The daily growth bot (`.github/workflows/auto-improve.yml`) makes ONE verified,
white-hat improvement per day aimed at getting more visitors and converting them, then
opens a review PR (`claude/daily-growth` → `main`). Every run branches fresh off `main`,
so the PR is always exactly "main + today's change".

Verify gate: `tsc --noEmit` clean + `next build` "Compiled successfully" (the CI
`DATABASE_URL` static-gen errors are expected, not failures).

## Backlog (growth ideas — refill by researching a current best practice)

### SEO
- [ ] Audit `<title>` / meta descriptions on high-intent pages (browse, sets, sealed,
      market, card) — make each target a real query a buyer would search.
- [ ] Internal linking: related-cards, "also in this set/domain", market ↔ movers ↔
      guides cross-links so crawl depth + session depth improve.
- [ ] Sitemap completeness + priority/lastmod accuracy; confirm robots/canonicals.
- [ ] JSON-LD coverage: Product/Offer on card pages, ItemList on listings, FAQ where apt.

### Content / landing pages
- [ ] Genuinely useful landing pages for real searches ("cheapest <set> singles",
      buying guides) — real data + copy, never thin/spam.
- [ ] Refresh guides/blog with internal links to tools (arbitrage, value finder, index).

### Shareability
- [ ] Open Graph / Twitter card titles + images that earn clicks; share/copy-link
      buttons on cards, decks, and the RiftCompare Index.

### Performance (ranking signal)
- [ ] LCP/CLS audits on top entry pages; trim client JS; image dimensions + async decode.

### Conversion / retention
- [ ] Above-the-fold value prop + single clear CTA; non-spammy email/wishlist/price-alert
      nudges; returning-visitor hooks (the daily market wrap, Riftle).

## Done
- (the bot appends one line per shipped change here)
