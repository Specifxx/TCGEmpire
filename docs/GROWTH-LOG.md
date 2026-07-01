# RiftCompare — Daily Growth Log

The daily growth bot (`.github/workflows/auto-improve.yml`) makes ONE verified,
white-hat improvement per day aimed at getting more visitors and converting them, then
opens a review PR (`claude/daily-growth` → `main`). Every run branches fresh off `main`,
so the PR is always exactly "main + today's change".

Verify gate: `tsc --noEmit` clean + `next build` "Compiled successfully" (the CI
`DATABASE_URL` static-gen errors are expected, not failures).

## Backlog (growth ideas — refill by researching a current best practice)

### SEO  ·  PRIORITY (agentic playbook — work these first, one per run)
- [ ] **CTR title/meta sweep (highest ROI).** Each run pick ONE page-type and rewrite its
      `<title>` + meta description to be more click-worthy for its real buyer query — lead
      with intent + a concrete hook (price / "cheapest" / set / "compare"). A good rewrite
      lifts CTR on pages that already rank. Titles ≤ ~60 chars, desc ≤ ~155, human, no
      stuffing. Rotate: browse, sets, sealed, movers, market, card, tools.
- [ ] **Embeddable Index badge (backlink engine).** Add an "Embed this" section on the
      RiftCompare Index with a copy-paste HTML/iframe snippet others can drop on their site
      (links back) — the best scalable off-page lever. Make it genuinely nice.
- [ ] **Programmatic "cheapest {set}" / "{set} card list & prices" pages** — real data +
      copy, hub-and-spoke internal links to the cards. Never thin/spam.
- [ ] Audit `<title>` / meta descriptions on high-intent pages (browse, sets, sealed,
      market, card) — make each target a real query a buyer would search.
- [ ] Internal linking: related-cards, "also in this set/domain", market ↔ movers ↔
      guides cross-links so crawl depth + session depth improve.
- [ ] Sitemap completeness + priority/lastmod accuracy; confirm robots/canonicals.
- [ ] JSON-LD coverage: Product/Offer on card pages, ItemList on listings, FAQ where apt.
- [ ] When a GSC feed is available, prioritise pages with high impressions + low CTR for
      the title/meta rewrites above — convert existing impressions into clicks fastest.

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
