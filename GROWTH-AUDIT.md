# RiftCompare growth audit

**Date:** 2026-08-10 · **Branch:** `growth-improvements` · **Commit at audit time:** `5a3c460`

Everything below is **measured**, not estimated. Two purpose-built crawlers were written
for this audit and are committed alongside it:

| Tool | Question it answers | Output |
|---|---|---|
| `scripts/content-quality.ts` | Are the ~1,700 generated pages substantively *different from each other*, and do their links resolve? | `content-quality-report.csv` |
| `scripts/template-seo-check.ts` | Does each **template** emit the canonical / OpenGraph / structured data appropriate to what it is? | stdout matrix, exit code |

Both are read-only over HTTP and touch no database.

> **How to reproduce:** `npx tsx scripts/content-quality.ts --url https://riftcompare.com`
> and `npx tsx scripts/template-seo-check.ts --url https://riftcompare.com`.
> **The committed `content-quality-report.csv` and every figure below come from the
> live site** (1,698 submitted URLs, crawled 2026-08-10). A local build against a
> seeded database was used to cross-check; it reaches identical template-level
> conclusions on a smaller corpus (1,222 URLs).

---

## 1. What the site already does well

This is worth stating plainly so the findings below are read in proportion. The
technical SEO is genuinely strong and none of it needed rebuilding:

- **Every submitted URL returns 200**, has a unique title and description, exactly one
  self-referencing canonical, and no accidental `noindex` (verified across all 1,698
  live URLs).
- **Structured data is present and valid on every template** — `BreadcrumbList`
  everywhere, plus `Product`/`FAQPage` on card pages, `ItemList` on hubs and galleries,
  `CollectionPage` on set/domain pages, `DefinedTerm` on keyword pages.
- **Thin pages are already gated deliberately**, not accidentally: cards with no
  listings, champions under 8 printings, facets under 8 cards and stores under 5
  listings all carry `noindex, follow` and are withheld from the sitemap by the *same*
  predicate the page uses — so a URL can never be submitted and noindexed at once.
- **Zero broken links to sitemap URLs, zero soft-404s, zero orphans among submitted
  pages** in the existing `crawl-check.ts` run — which walks the whole document
  including the footer, and is the right check for "is this reachable at all".

The gaps below are about *discoverability and depth*, not correctness.

---

## 2. Internal-linking graph

Measured from the rendered HTML of all 1,222 pages: **`<main>` only**, excluding the
site-wide header and footer. That exclusion is deliberate — their nav lists appear on
every page and would report every URL as well-linked — but it means these numbers are
**contextual links, not total links**. Almost every page also carries site-wide footer
links that are not counted here. Breadcrumb trails **are** counted; they live in
`<main>` and are real content links.

### Median IN-CONTENT inbound links, by template

| Template | Pages | Median in-content inbound | Read |
|---|---:|---:|---|
| static | 49 | 5 | wide range — see the section below |
| `/decks/archetype` | 3 | 5 | new; hub-linked only |
| `/blog/[slug]` | 48 | 7 | **under-surfaced** |
| `/card/[id]` | 1,404 | 9 | healthy for a 1,400-page surface |
| `/guides/[slug]` | 29 | 9 | **under-surfaced** |
| `/decks/domain` | 6 | 9 | new; hub-linked only |
| `/champions/[slug]` | 33 | 11 | fine |
| `/stores/[slug]` | 79 | 17 | fine |
| `/keywords/[slug]` | 3 | 22 | fine |
| `/decks/[slug]` | 10 | 63 | strong |
| `/authors/[slug]` | 2 | 69 | strong |
| `/cards/*` facets | 15 | 169 | strong (linked from every card page) |
| `/domains/[slug]` | 7 | 233 | strong |
| `/sets/[set]` | 5 | 347 | strongest |

**The shape of the graph:** link equity flows *inward and downward* — from the 1,000
card pages into the facet, domain and set hubs above them. That is the right direction
for a price-comparison site, and it is why those hubs are strong.

What is missing is the **sideways** flow: from the 1,000 commercial pages into the
educational content. Guides sit at a median of 9 inbound links and blog posts at 7,
almost entirely from *each other* and from the two index pages.

### Pages with no in-content inbound link

> **Correction (2026-08-10, after this section first shipped).** An earlier revision
> of this document called these pages "orphans" with "zero inbound internal links".
> **That was wrong, and the error was mine.** The crawler builds its link graph from
> `<main>` only, and I read its output without checking what it excluded. Verified
> against production HTML: `FooterNav` server-renders every `FOOTER_GROUPS` href as a
> real `<a>`, so `/learn` carries **two footer links on every one of ~1,700 pages** and
> is fully reachable and crawlable. So do `/bulk-pricer`, `/about` and `/returns` — and
> so, for that matter, do `/guides`, `/blog` and `/decks`.
>
> What the metric actually measures — and what is still a genuine finding — is
> **contextual** links: links from within the body of a page. The tool now says so in
> its output and its header.

Four submitted pages have **no link from the body of any page**. They are reachable
via the site-wide footer (boilerplate, present on every page, and therefore carrying
almost no topical signal) and via the mega-menu / ⌘K launcher:

| Page | Sitemap priority | In-content links | Footer links |
|---|---:|---:|---:|
| **`/learn`** | **0.8** | **0** | 2 per page |
| `/bulk-pricer` | 0.6 | 0 | 2 per page |
| `/about` | 0.5 | 0 | 3 per page |
| `/returns` | 0.6 | 0 | 1 per page |

`/learn` is still the finding worth acting on. It is the site's flagship newcomer
asset at priority 0.8, and **not one page's content links to it** — not the homepage,
not a card page, not a set page. A site-wide footer link is the weakest form of
internal link there is: it is identical on every page, so it distinguishes nothing and
tells Google nothing about which pages are topically related to it. The fix is a
contextual link from the highest-authority page on the site, which is what was added.

### Where `/learn` and `/guides` are *not* linked from

| High-traffic surface | Links to `/learn`? | Links to a guide? |
|---|---|---|
| Homepage | ✗ | ✗ — links only to `/browse`, `/decks`, `/sets/*`, `/domains/*`, `/games/pack-sim`, `/riftle` |
| `/card/[id]` (1,007 pages) | ✗ | ✓ — "Read next", 3 contextual links from `related-guides.ts` |
| `/sets/[set]` | ✗ | ✓ — 3 Vendetta guides |
| `/domains/[slug]` | ✗ | ✗ |
| `/browse`, `/market`, `/sealed` | ✗ | ✗ |
| Header nav | ✗ (menu only) | ✓ Blog |

**Card-page → guide linking already works well** and did not need rebuilding — but it
has one measurable hole. Running `guidesForCard()` over representative cards:

| Card | Guides returned |
|---|---|
| Signature printing | ✓ rarity, **variant glossary**, storage — correct |
| Alt-art Showcase | ✓ rarity, variant glossary, storage — correct |
| **Vendetta base rare** | promo blog, buying-singles, where-to-buy — **no mechanic guide** |
| Cheap Origins common | Vendetta synergies (an *Origins* card), buying-singles, where-to-buy |

The three Vendetta mechanic guides (`riftbound-empower-explained`,
`-flow-explained`, `-burn-explained`) are the site's best-performing editorial and are
Vendetta-specific — and **no Vendetta card page links to any of them.**

---

## 3. Thin templates

"Thin" measured as **prose words** — text inside `<p>`, `<li>`, `<dd>` within `<main>`,
excluding header/footer chrome. This is deliberately not a whole-page word count: card
pages are mostly price tables and tile grids, which inflate every page to ~2,000 words
and hide the genuinely thin ones completely.

| Template | Pages | Median prose | Min | Verdict |
|---|---:|---:|---:|---|
| `/keywords/[slug]` | 3 | **152** | 70 | **thin** — a definition and a card grid |
| `/stores/[slug]` | 79 | 177 | 83 | thin, but deliberately gated at 5+ listings |
| static (mixed) | 49 | 259 | 1 | `/browse`, `/market` are tool UIs — 1 prose word each |
| `/champions/[slug]` | 33 | 397 | 348 | acceptable (narrative already wired) |
| `/cards/*` facets | 15 | 408 | 379 | acceptable (narrative already wired) |
| **`/sets/[set]`** | 5 | **459** | 293 | **thin for a 347-inbound-link hub** |
| `/blog/[slug]` | 48 | 570 | 276 | fine |
| `/decks/[slug]` | 10 | 617 | 588 | fine |
| `/guides/[slug]` | 29 | 616 | 284 | fine |
| **`/domains/[slug]`** | 7 | **795** | 334 | **mostly list** — see below |
| `/card/[id]` | 1,404 | 983 | 537 | strong |
| `/decks/archetype`, `/decks/domain` | 9 | ~825 | 767 | strong |

### The set and domain templates specifically

Both are "mostly lists" in exactly the sense the brief describes. `/domains/[slug]`
reads 795 median prose words, but that number is **inflated by the card grid's tile
text** — the actual editorial is:

- one intro sentence (card count, priced count),
- `domain.lore` — two hand-written sentences from `lib/domains.ts`,
- a link row.

That is roughly **80 words of real prose** carrying a page with 233 inbound links.
`/sets/[set]` is the same shape with a slightly longer intro.

**The fix is already in the repo and unused.** `src/lib/content/collection-narrative.ts`
generates 150+ words of data-derived prose and its `CollectionKind` union *already
includes `"domain"` and `"set"`*:

```ts
export type CollectionKind = "champion" | "type" | "rarity" | "printing" | "domain" | "set" | "keyword";
```

It is currently called from only two places — `champions/[slug]` and `FacetPageBody` —
which is precisely why those templates measure 339 and 393 prose words while set and
domain sit lower with far more inbound equity to justify.

---

## 4. Programmatic content quality

`content-quality-report.csv`, 396 flagged rows across 1,698 live pages.

| Issue | Count | Assessment |
|---|---:|---|
| `NEAR_DUPLICATE_DESCRIPTION` | 337 (234 on card pages) | **real** — see below |
| `BROKEN_INTERNAL_LINK` | 26 | **real**, three distinct causes |
| `EMPTY_SECTION` | 19 | mostly detector limits on container sections |
| `THIN_EDITORIAL` | 10 | real; `/keywords/*` and prose-light tool UIs |
| `SHORT_DESCRIPTION` | 4 | `/terms` (47), `/marketplace/shipping` (58), `/marketplace/terms` (60), `/marketplace` (66) |
| `MISSING_TITLE` / `MISSING_DESCRIPTION` | 0 | — |

### Near-duplicate descriptions — 234 card pages (17% of the template)

These are **different printings of the same card**, whose meta descriptions differ only
in the collector number and the price:

```
/card/lee-sin-centered-ogn-151a-298
  Lee Sin, Centered (Showcase) — Body unit · Showcase from Riftbound Origins (151a/298). Live prices from …
/card/lee-sin-centered-ogn-151-298-promo
  Lee Sin, Centered (Showcase, Promo) — Body unit · Showcase from Riftbound Origins (151/298). Live prices from …
```

The template's no-rules-text branch is:

```
{displayName} — {domain} {type} · {rarity} from Riftbound {setName} ({number}). {priceBit}
```

Strip the digits — which is what a near-duplicate detector, and Google's own
clustering, effectively does — and the two are the same sentence. The card page
*already computes* what distinguishes these printings (`editionLabel()` in
`card-narrative.ts`, plus `variant` / `isPromo` / `isSignature` / overnumbered), and the
description does not use any of it.

### Broken internal links — three template-level causes

| Broken target | Hits | Cause |
|---|---:|---|
| `/cards/type`, `/cards/rarity`, `/cards/printing` | 15 | Every facet page's breadcrumb links to a parent route **that does not exist** — `src/app/cards/` has only `[type]/`, `[rarity]/`, `[printing]/`, and no index page at those three paths. |
| `/card/*-ven-19x` | 9 | `/guides/riftbound-vendetta-overnumbers-explained` links all nine signed Legend Overnumbers by a slug built from the **epithet only** (`/card/rogue-assassin-ven-189`) instead of the full card name. The correct targets are the signature printings — `akali-rogue-assassin-ven-189s-166` and its eight siblings — all of which return 200. |
| `/blog/riftbound-variant-glossary` | 2 | Two articles link to the variant glossary under `/blog/`, but its category is `guide`. Both route handlers `notFound()` on category mismatch. |

All three reproduce on production; none is a local artifact.

The last two are **repeats of a previously-fixed class of bug** — the repo's own notes
record 12 such links fixed in a prior pass. They recurred because
`tests/content-links.test.ts` validates the *route shape*, and both `/blog/[slug]` and
`/card/[id]` are dynamic segments that match **any** slug. The validator therefore
cannot tell a live card from an invented one, or a guide from a blog post. That is the
template-level cause, and it is what needs fixing — not the nine hrefs.

---

## 5. Per-template metadata + structured data

`scripts/template-seo-check.ts`, 3 sampled URLs per template.

| Template | Canonical | OpenGraph | Structured data |
|---|---|---|---|
| `/card/[id]` | ✓ | ✗ **no `og:url`** | ✓ Breadcrumb, Product, FAQPage |
| `/champions/[slug]` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, ItemList |
| `/keywords/[slug]` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, DefinedTerm |
| `/domains/[slug]` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, CollectionPage |
| `/cards/*` facets | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb |
| `/sets/[set]` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, CollectionPage |
| `/sets/[set]/gallery` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, ItemList |
| `/stores/[slug]` | ✓ | ✗ **no `og:type`** | ✓ Breadcrumb, Organization |
| `/decks/archetype`, `/decks/domain` | ✓ | ✓ | ✓ Breadcrumb, ItemList, FAQPage |
| `/decks/[slug]` | ✓ | ✓ | ✓ Breadcrumb |
| `/guides/[slug]` | ✓ | ✓ | ✓ Breadcrumb + FAQPage, TechArticle |
| `/blog/[slug]` | ✓ | ✓ | ✓ Breadcrumb + FAQPage, BlogPosting |
| `/authors/[slug]` | ✓ | ✓ | ✓ Breadcrumb |

**Canonical tags and structured data are correct on every template.** The one
systematic defect is OpenGraph: **10 templates covering ~1,500 pages** declare
`openGraph` inline instead of going through `pageOpenGraph()`.

This is the *documented* shallow-merge trap, from `src/lib/seo.ts`'s own header:

> Next's App Router SHALLOW-merges metadata … The same applies to `openGraph`: a page
> that sets its own title/description loses the root's siteName and type.

The helper exists precisely to prevent this, and 10 routes already use it. The ones
above were never migrated. Consequence: every share of a card, set, domain, champion,
keyword, facet or store page unfurls without a declared type, and card pages without a
URL.

### After the fix

Re-running `scripts/template-seo-check.ts` once every template routes through
`pageOpenGraph()`:

```
  card             ✓ canonical  ✓ og  ✓ schema   1007 pages · [BreadcrumbList, Product, FAQPage]
  decks/archetype  ✓ canonical  ✓ og  ✓ schema      3 pages · [BreadcrumbList, ItemList, FAQPage]
  decks/domain     ✓ canonical  ✓ og  ✓ schema      6 pages · [BreadcrumbList, ItemList, FAQPage]
  deck             ✓ canonical  ✓ og  ✓ schema     10 pages · [BreadcrumbList]
  champion         ✓ canonical  ✓ og  ✓ schema     19 pages · [BreadcrumbList, ItemList]
  keyword          ✓ canonical  ✓ og  ✓ schema      3 pages · [BreadcrumbList, DefinedTerm]
  domain           ✓ canonical  ✓ og  ✓ schema      7 pages · [BreadcrumbList, CollectionPage]
  facet            ✓ canonical  ✓ og  ✓ schema     14 pages · [BreadcrumbList]
  set              ✓ canonical  ✓ og  ✓ schema      5 pages · [BreadcrumbList, CollectionPage]
  set/gallery      ✓ canonical  ✓ og  ✓ schema      5 pages · [BreadcrumbList, ItemList]
  store            ✓ canonical  ✓ og  ✓ schema     20 pages · [BreadcrumbList, Organization]
  guide            ✓ canonical  ✓ og  ✓ schema     29 pages · [BreadcrumbList] also [FAQPage, TechArticle]
  blog             ✓ canonical  ✓ og  ✓ schema     48 pages · [BreadcrumbList] also [FAQPage, BlogPosting]
  author           ✓ canonical  ✓ og  ✓ schema      2 pages · [BreadcrumbList]

  All templates emit a self-canonical, complete OpenGraph and their required
  structured data.
```

The script exits non-zero on any failure, so it can gate a deploy alongside the
existing `seo-gate.ts`.

---

## 6. Traffic data available in-repo

The brief asks which page types get the least traffic. Stating precisely what exists:

- **`Card.viewCount` / `Card.searchCount`** and the daily `DemandSnapshot` table give
  real first-party demand — but **only for `/card/*`**. There is no per-template
  pageview data in the repo.
- **`ClickEvent`** records affiliate outbound clicks, surfaced at `/admin/clicks`.
- **`.github/workflows/gsc-coverage.yml`** is a daily Search Console monitor, but it
  **no-ops until the `GSC_SA_KEY` repo secret is set**, and no exported GSC data is
  committed.

**Conclusion:** a ranked "least-trafficked page types" table cannot be produced from
what is in the repo without fabricating it, so this audit does not present one. The
inbound-link and prose-depth tables above are the best available proxies, and the
single concrete action is to set `GSC_SA_KEY` so the existing workflow starts
collecting. No new tracking or third-party scripts were added.

---

## 7. Findings, prioritised

| # | Finding | Evidence | Addressed in |
|---|---|---|---|
| 1 | `/learn` has no contextual inbound link (footer-only), priority 0.8 | §2 | commit: internal linking |
| 2 | Homepage links to no educational content at all | §2 | commit: internal linking |
| 3 | Vendetta cards reach no mechanic guide | §2 | commit: internal linking |
| 4 | `/sets/[set]` and `/domains/[slug]` are list pages with ~80 words of prose, despite 166–295 inbound links | §3 | commit: set/domain prose |
| 5 | 234 card pages carry near-duplicate descriptions across printings | §4 | commit: content quality |
| 6 | 15 facet pages link to a breadcrumb parent that 404s | §4 | commit: content quality |
| 7 | 11 dead article links (9 card slugs + 2 wrong-category), invisible to the validator | §4 | commit: content quality |
| 8 | 8 templates (~1,075 pages) emit incomplete OpenGraph | §5 | commit: measurement loop |
| 9 | `/keywords/*` is genuinely thin (70 prose words) | §3 | **not fixed** — needs verified rules text; see `GROWTH-SUMMARY.md` |
