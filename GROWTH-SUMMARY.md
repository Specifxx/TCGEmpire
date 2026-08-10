# Growth improvements — summary

**Branch:** `growth-improvements` (5 commits, off `main` at `5a3c460`)
**Status:** left on the branch for review. Nothing merged, nothing deployed.

Every commit ran `npm test`, `npm run lint` and `npm run build` before landing.
Final: **455 tests pass** (up from 441 — 24 added), lint clean, build clean.

---

## What changed, and why

### Commit 1 — `docs(growth)`: the audit and the two instruments that produced it

`GROWTH-AUDIT.md`, plus:

- **`scripts/content-quality.ts`** → `content-quality-report.csv`. Crawls the
  sitemap and asks the one question the two existing crawlers don't: are the
  ~1,700 generated pages substantively different *from each other*? Flags
  duplicate and near-duplicate descriptions, missing/short meta, empty sections,
  thin editorial and broken internal links.
- **`scripts/template-seo-check.ts`**. Samples URLs per template and asserts
  canonical, OpenGraph and the structured data appropriate to that page type.
  Exits non-zero, so it can gate a deploy.

**The instruments needed three correction passes before their output was
trustworthy**, and that is worth knowing when reading the numbers:

| First run said | Actually |
|---|---|
| every template ≥ 700 words | the header/footer nav lists are `<li>` elements, adding a constant ~250 words to every page. Now measures `<main>` only. |
| 1,388 empty sections | card grids ("More Jinx cards") are `<a>` tiles with no prose. A section is empty only with neither prose *nor* linked content. |
| the whole card template broken | `sr-only` headings label the component that follows; the price table is server-rendered and fine. |

Report went from 1,691 rows of mostly noise to 396 real ones against production.

### Commit 2 — `feat(growth)`: internal linking → **Finding 1**

- **`/learn` was an orphan.** 359 lines of interactive new-player content at
  sitemap priority 0.8, with **zero** inbound links from any of 1,698 pages —
  the only reference was `nav-groups.ts`, i.e. the client-rendered mega-menu,
  which the crawler never sees. The homepage linked to no educational content at
  all. Added "New to Riftbound? Learn how to play →" to the hero, on its own line
  below the CTA row and at lower visual weight: that row was deliberately cut
  from four competing CTAs to two, and a test now pins it at two.
- **No card page linked to the Vendetta mechanic guides.** Measured with
  `guidesForCard()`: a plain Vendetta rare returned three *buying* articles and
  none of Empower/Flow/Burn, which are Vendetta-specific and the site's
  best-performing editorial. Signature/alt-art printings already reached the
  variant glossary correctly — that half of the brief's example was already
  working and is untouched.

  The new rule matches **the bracket marker printed on the card**, read from
  `KEYWORDS` in `lib/keywords.ts` rather than a second hand-written map. So a
  card links to the Empower guide exactly when `[Empower]` is on it, and an
  Origins card whose text contains the word does *not* match, because `KEYWORDS`
  scopes each keyword to its introducing set. **No rules claims were added** —
  the DATA-ACCURACY RULE in `lib/keywords.ts` is untouched.

### Commit 3 — `feat(growth)`: set & domain prose → **Finding 2**

`/domains/[slug]` carried ~80 words of real editorial while receiving 233 inbound
links — the best-linked thin page on the site. `/sets/[set]` the same with 347.

**Nothing new was written.** `src/lib/content/collection-narrative.ts` already
generated 150+ words from a collection's own data, its `CollectionKind` union
already included `"domain"` and `"set"`, and it already had buyer advice written
for both — it had simply never been called from either template. It is the same
generator the champion hubs and facets use, so the tone matches by construction.

Query cost, per the egress rules in `lib/db.ts`:
- `/domains/[slug]` adds **zero** queries — it reads rows the page already has,
  so prose and grid cannot disagree.
- `/sets/[set]` needs one (the grid is 60 of ~1,800 cards and cannot describe a
  distribution): four scalar fields per row, cached per set+market under
  `CONTENT_TAG`, **default view only**, and it fails open — a failure drops the
  intro, never the page.

Measured: set median prose 447 → 562; domain minimum 292 → 445.

One defect found by reading the rendered output: the "cards to know" line named
the same card twice ("Fury Rune … Jhin … Fury Rune") because printings cluster at
the top of a price sort. Deduped by name. This also improves the champion hubs
and facets, which were already live with it.

### Commit 4 — `fix(growth)`: content-quality causes → **Finding 3**

Four template-level causes. **No individual page was hand-edited.**

| Cause | Scale | Fix |
|---|---|---|
| Near-duplicate card descriptions | 234 pages (17%) | Different printings of one card, separated only by digits (collector number, price) — which near-duplicate detection and Google's clustering both discount. The description now names **which printing** in words, via `printingLabel()`, the same helper the page body uses. Base printings get nothing added. **213 → 4.** |
| Facet breadcrumbs pointed at a 404 | all 15 facet pages | No route exists at `/cards/type`, `/cards/rarity`, `/cards/printing` — and it was asserted as a hierarchy level in `BreadcrumbList` JSON-LD. Now plain text in the trail, absent from the markup chain. |
| Cards linking a facet that doesn't exist | `/cards/type/token` (404 on production) | Chips built by lowercasing the card's own value. Both now resolve through the lookup the route uses. |
| 11 dead article links | 9 card slugs + 2 wrong-category | `riftbound-vendetta-overnumbers-explained` linked all nine signed Legend Overnumbers by the **epithet alone** (`/card/rogue-assassin-ven-189`) instead of the full name; two articles linked a guide under `/blog/`. Fixed to the printings the guide is about — the *signed* ones, per its own heading — each verified 200 first. |

**The cause behind the last one matters more than the links.** `routeExists()` in
`tests/content-links.test.ts` treats a `[param]` directory as matching anything,
so `/blog/<anything>` and `/card/<anything>` both "exist" — which is why this is a
repeat of a class the repo already fixed 12 of. Two new validators close it: links
must resolve to an article of *that category*, and a card link whose anchor names
the card must have a slug starting with that champion.

Overall: **332 flagged rows → 98** on the same corpus.

### Commit 5 — `fix(growth)`: OpenGraph → **Finding 4**

Canonicals and structured data were correct on all 14 templates and needed
nothing. OpenGraph was not: **10 templates covering ~1,500 pages** declared an
inline `openGraph` object instead of calling `pageOpenGraph()` — the documented
shallow-merge trap that `lib/seo.ts` was written to prevent. Card pages shipped no
`og:url`; champion, keyword, domain, set, gallery, store and all three facet
templates shipped no `og:type`. All ten now route through the helper. No copy
changed. The check reports clean across every template.

---

## Deliberately not done

**1. `/keywords/*` is genuinely thin (70 prose words) and stays that way.**
A definition plus a card grid, three pages. Fixing it means writing rules content
for keywords, and `lib/keywords.ts` carries an explicit DATA-ACCURACY RULE
forbidding that without verified official source text; `docs/seo-backlog.md` #19
already logs it as blocked. **Needs a human:** supply Riot's Comprehensive Rules
or sign off per keyword.

**2. Hub descriptions are formulaic across ~59 pages.** The largest remaining
`NEAR_DUPLICATE_DESCRIPTION` cluster: champion (19), store (13), domain (7),
gallery (5), keyword (3), set (3), deck-group (9). Each template's description
varies only by a name — e.g. every champion reads "Every Riftbound {name} card
across all sets…". Fixing it well means per-template copy that folds in real
varying data (printing counts, price ranges, set spread), which is five or six
separate judgement calls about tone. I did not want to rush that across six
templates in one pass. **Recommended next, and the highest-value remaining item.**

**3. The header overflows horizontally between ~640px and ~790px.** Pre-existing
and unrelated to this brief (found while measuring an earlier nav change): the
header row needs 738px of content in a 720px box at tablet width.
`scripts/mobile-check.ts` only audits 375px, which is why it has never surfaced.
Fixing it means deciding which of Sealed/Blog/Premium/Discord collapses into the
hamburger on tablets — **a product call, not a drive-by edit.**

**4. No least-trafficked-page-types table.** `Card.viewCount` / `searchCount` and
`DemandSnapshot` are real first-party demand data but cover `/card/*` only;
`ClickEvent` covers affiliate clicks; `gsc-coverage.yml` exists but no-ops until
`GSC_SA_KEY` is set, and no exported Search Console data is committed. A ranked
table cannot be produced from the repo without inventing it, so none is presented.
**One-line unblock: set the `GSC_SA_KEY` repo secret** and the existing daily
workflow starts collecting. No tracking or third-party scripts were added.

**5. Five `BROKEN_INTERNAL_LINK` rows in the final local run are local-only** —
Vendetta cards the live importer holds but the seeded database does not. All five
verified **200 on production**. The committed CSV is the production crawl and does
not contain them.

**6. 19 `EMPTY_SECTION` and 10 `THIN_EDITORIAL` rows remain**, and are mostly
detector limits (container sections whose content sits under a sub-heading) plus
genuinely prose-light tool UIs — `/browse` and `/market` are filter interfaces
with one prose word each, which is correct for what they are.

---

## Verification

The audit's figures come from the **live site** (1,698 URLs). The before/after
deltas come from a local production build against a seeded database (1,222 URLs),
compared like-for-like.

```bash
npx tsx scripts/content-quality.ts   --url https://riftcompare.com   # → content-quality-report.csv
npx tsx scripts/template-seo-check.ts --url https://riftcompare.com  # exits non-zero on failure
npm test && npm run lint && npm run build
```

**Caveat worth knowing before merging:** the local database is seeded from
`prisma/riftbound-cards.json` (950 OGN/OGS/SFD/UNL cards) plus `manual-cards.json`,
and carries **synthetic prices** — the real importer needs live store credentials.
So the *shape* of the set/domain prose is verified, but the specific figures those
pages will render in production are not. Re-run `content-quality.ts` against a
preview deploy before merging to confirm.

---

## Suggested next steps needing human judgment

1. **Differentiate the hub descriptions** (item 2 above) — biggest remaining win,
   ~59 pages, needs per-template copy decisions.
2. **Unblock the keyword pages** — supply verified rules text or sign off; each
   then becomes a same-day addition on the existing template.
3. **Set `GSC_SA_KEY`** so traffic data exists for the next audit.
4. **Decide the tablet nav collapse** (item 3 above).
5. **Consider wiring `template-seo-check.ts` into CI.** It is DB-free only in the
   sense that it needs a *running server*, so it belongs next to the Vercel
   preview rather than in the current DB-free `ci.yml` job.
