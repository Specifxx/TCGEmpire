# Pokémon sealed — design, runbook and removal

A self-contained Pokémon TCG section on riftcompare.com (`/pokemon`), built as a
proof of concept to answer one question: **do people use it?** It prices English
Pokémon **sealed** products (booster boxes, Elite Trainer Boxes, bundles,
collections, tins, blisters, packs and decks) in all six markets, with eBay and
TCGplayer as the affiliate priorities.

It is designed to be **switched off in one variable and deleted in one commit**.
Nothing Riftbound depends on it, it never reads or writes a Riftbound database,
and the few Riftbound files that know it exists are pinned by a test.

Decision records: DECISIONS.md, "The Pokémon sealed section (beta)" and "The
Pokémon section as a home for Pokémon sealed", both 2026-10-01.

---

## 1. Going live (owner checklist)

1. **Create the database.** A new Neon project (free tier is plenty). Copy its
   **pooled** connection string.
2. **GitHub → Settings → Secrets → Actions:** add `POKEMON_DATABASE_URL`.
   (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_AFFILIATE_CAMPAIGN` and
   `CRON_SECRET` already exist and are reused.)
3. **Run the import once:** Actions → "Pokemon sealed import" → Run workflow.
   The first run creates the tables (`prisma db push`), loads ~1,000 products
   and their TCGplayer prices in a few seconds (tick "with_ebay" to also spend
   the small eBay slice). After that it runs at 05:17 UTC (no eBay) and 21:47
   UTC (with eBay, after Riftbound's runs; §4).
4. **Vercel → Settings → Environment Variables** (Production, and Preview if
   wanted):
   - `POKEMON_DATABASE_URL` = the same connection string
   - `NEXT_PUBLIC_POKEMON_SECTION` = `1`
5. **Deploy** (the 08:00 UTC daily release, or "Run workflow" on
   production-deploy if it should go out sooner). `NEXT_PUBLIC_*` variables are
   baked in at build time, so the switch only takes effect on a build.

Optional switches:

| Where | Variable | Effect |
|---|---|---|
| GitHub repo **variable** | `POKEMON_CARDMARKET=1` | Adds Cardmarket (EU lowest listing + trend). **Off until the owner confirms Cardmarket is happy with Pokémon data use**: the 2026-09-04 permission in `src/lib/cardmarket.ts` was asked for Riftbound. |
| GitHub repo variable | `POKEMON_EBAY_MAX_CALLS` (default 60) / `POKEMON_EBAY_RESERVE` (default 2500) | The daily eBay slice and the floor it never spends below (see §4). Riftbound comes first; raise the cap only if Riftbound's runs leave room. |
| Vercel | `POKEMON_INDEX_PRODUCTS=1` | Lets the product pages that pass the stage-1 gate be indexed and sitemapped: booster boxes, ETBs, Pokémon Center ETBs and booster bundles with a known pack count (`src/lib/pokemon/index-gate.ts`, ~160 products). Off by default; flip it only after the audit in §6. |
| Vercel **Preview** | `NEXT_PUBLIC_POKEMON_SECTION=1`, `POKEMON_DATABASE_URL`, `POKEMON_INDEX_PRODUCTS=1` | Lets you read the blog drafts and run the audits on a preview deployment. |

### Publish a blog post

Posts live in `src/lib/pokemon/blog/posts/<slug>.ts` and land as
`status: "draft"`: they render in development and on Vercel previews
(`/pokemon/blog/<slug>`, with a DRAFT banner and noindex) and 404 in
production. On Bill's word, one commit per post sets three fields:
`status: "published"`, `reviewed: "<YYYY-MM-DD>"` and `date: "<publishing
day>"` (`tests/pokemon-blog.test.ts` requires `reviewed ≥ date` and no
`[TODO]`). The Blog tab, `/pokemon/blog`, the hub's guides band, the product
pages' guide links and the sitemap entries all appear from the published posts
alone (`getPokemonPosts()`).

### Archive probe (decides history backfill)

Actions → "Pokemon archive probe" → Run workflow (date optional). It downloads
one TCGCSV price archive and logs its layout; no secrets, no database. Paste
the log's verdict line into the session that plans the backfill.

## 2. Turning it off

**Fast (one variable):** set `NEXT_PUBLIC_POKEMON_SECTION` to anything but `1`
(or delete it) in Vercel and redeploy. Every `/pokemon` URL 404s, and the nav
entry, homepage promo, sitemap section and robots.txt line disappear. Removing
`POKEMON_DATABASE_URL` from Vercel does the same on the server side. Removing
the GitHub secret makes the daily import a no-op.

**Pausing data only:** disable the "Pokemon sealed import" workflow in GitHub.
Pages keep serving the last import.

## 3. Removing it completely

Everything lives in:

```
src/app/pokemon/            src/app/api/pokemon/
src/components/pokemon/     src/lib/pokemon/
prisma/pokemon/             scripts/pokemon/
docs/pokemon/               .github/workflows/pokemon-import.yml
tests/pokemon-*.test.ts     .github/workflows/pokemon-archive-probe.yml
tests/fixtures/pokemon-*    tests/helpers/pokemon-copy.ts
```

Delete those, then revert the **host touchpoints** — the complete list, pinned
by `tests/pokemon-isolation.test.ts`:

| File | What to remove |
|---|---|
| `src/components/nav-groups.ts` | the `pokemonSectionOn()` spread in Prices, and its import |
| `src/components/home/HomeSections.tsx` | `<PokemonHomePromo />` and its import |
| `src/lib/sitemap-sections.ts` | `"pokemon"` in `ALL_SECTIONS`, the `SECTIONS` filter, `const pokemon = …`, the two imports |
| `src/components/FooterAds.tsx` | `OFF_TOPIC_ROUTES` (harmless if left) |
| `src/lib/nudge-gate.ts` | `"/pokemon"` in `PREMIUM_SKIP_PATHS` (harmless if left) |
| `src/lib/db-chains.ts` | `POKEMON_VARS` (harmless if left) |
| `scripts/adsense-audit.ts` | the four `pokemon-*` rows at the top of `TEMPLATES` (harmless if left) |
| `scripts/template-seo-check.ts` | the six `pokemon-*` rows at the top of `SPECS` (harmless if left) |

The two scripts are pinned as `SCRIPT_TOUCHPOINTS` in the same test.

Also: the two `generate --schema prisma/pokemon/...` additions in `package.json`
(`build`, `db:generate`, and the three `pokemon:*` scripts) and in
`.github/workflows/ci.yml`; `getPokemonCatalog`/`getPokemonProduct` in
`tests/nested-cache.test.ts`; the Pokémon note in `CLAUDE.md`; the rows in
`docs/seo-keyword-map.md`; the bullet in `docs/CURRENT-STATE.md`. The shared
`SealedFilters`/`SealedSort` keep their new optional props (defaults are the
Riftbound behaviour). Then delete the Neon project.

## 4. Architecture

```
                     ┌───── GitHub Actions, 05:17 UTC (no eBay) + 21:47 UTC ─────┐
TCGCSV (TCGplayer) ─▶│ scripts/pokemon/import.ts → src/lib/pokemon/import.ts    │
Cardmarket files  ─▶│   catalog.ts  kinds.ts  cardmarket-match.ts  ebay-match  │──▶ Neon "Pokémon" project
eBay Browse API   ─▶│   (writes ONLY to POKEMON_DATABASE_URL)                  │      (POKEMON_DATABASE_URL)
                     └──────────────── POST /api/pokemon/revalidate ────────────┘              │
                                                                                               ▼
  /pokemon, the kind hubs, /pokemon/price-per-pack,
  /pokemon/sealed, /pokemon/sets, /pokemon/sets/[set]            ◀── getPokemonCatalog(market)  (unstable_cache, tag "pokemon", 6h)
  /pokemon/sealed/[slug] (ISR 6h, + the US catalogue)             ◀── getPokemonProduct(slug)
  /pokemon/blog/[slug] (ISR 6h)  ·  share cards                  ◀── the same two loaders, nothing else
```

**Pages** (all titles absolute and ≤60 through `src/lib/pokemon/seo.ts`
`pokemonMeta`, which also names the share image explicitly):

| Page | What | Index |
|---|---|---|
| `/pokemon` | The home: stat line, lowest price per pack, coming up, shop by type, newest sets, US listings under TCGplayer's market price, guides, FAQ | yes |
| `/pokemon/booster-boxes`, `/elite-trainer-boxes`, `/booster-bundles` | Every product of the kind: cheapest listing, packs, per pack, reference, eBay search | yes |
| `/pokemon/price-per-pack` | Released products with a listing and a pack count, lowest per pack first; one section per kind | yes |
| `/pokemon/sets/[set]` | The set's products, its per-pack paragraph, neighbouring sets | yes |
| `/pokemon/sealed/[slug]` | Every market's board, pack maths, the same kind across recent sets, FAQ | gate + flag |
| `/pokemon/blog`, `/pokemon/blog/[slug]` | The section's own posts (`src/lib/pokemon/blog/`) | published only |

**Shared figures.** `src/lib/pokemon/value.ts` is the one place for the
per-pack ranking, cheapest-by-kind (a half box never stands for a box),
`RECENT_SETS`, typical pack counts and the "as of" label; a per-pack comparison
picks each kind by price per pack, never by listing price. The pages' sentences
come from pure builders (`home.ts`, `hubs.ts`, `product-facts.ts`,
`set-facts.ts`, the blog's `blocks.ts`) that print a sentence only when its
fact exists.

**Distribution without links** (communities ban promotion): price share
cards (`opengraph-image.tsx` beside the product and set pages; 6h CDN header,
60s after a read error, a brand card instead of a 500); "Copy for Reddit /
Discord" (`CopyPrices`, `src/lib/pokemon/share-text.ts`: a table or bullets,
no link unless asked).

**Failure behaviour.** A read error throws: force-dynamic pages answer 500,
ISR pages keep the last good copy, share cards fall back to the brand card.
Only an unknown product or set is a 404. Every page body checks the switch
itself as well as the layout.

**Data sources**

| Source | What | Markets | Notes |
|---|---|---|---|
| TCGCSV (TCGplayer's own data, category 3) | Catalogue: sets, products, images, release dates, contents; cheapest listing + market price | Listing: US. Market price: reference in all six, converted outside the US (marked ≈) | One JSON per expansion; ~50 groups, ~3 s. |
| eBay Browse API | Cheapest matching fixed-price, new listing, deliverable to the market | US, UK, AU, CA, EU (eBay Spain) | SG gets an eBay **search** only (no EPN program; ebay.com.sg reroutes to ebay.com). |
| Cardmarket public files (game 6) | Lowest listing (any language) + trend | EU (trend also a ≈ reference in the UK) | **Off** until `POKEMON_CARDMARKET=1` (§1). 739 of 1,020 products match today, every match exact or near-exact. |
| eBay search links | A search of the visitor's own eBay for every product | All six | Zero API cost; the main eBay click surface. |

**Scope.** English sealed from Sword & Shield (Feb 2020) to the newest Mega
Evolution set, pre-orders included: 42 sets, ~1,020 products. Out by design:
distributor cases and displays, TCGplayer's "[Set of N]" combinations, code
cards, Japanese/Korean/Chinese products. Widening is a data change in
`src/lib/pokemon/catalog.ts` (`SERIES_PREFIX`, `UNPREFIXED_SETS`, `SCOPE_START`).

**eBay matching** (`src/lib/pokemon/ebay-match.ts`). A listing counts only when
its title names every distinctive word of the product, the right product type
(a half box never stands in for a box, a regular ETB never for a Pokémon Center
one), no *other* set, no lot/empty/accessory/graded/foreign signal, and a price
at or above max(a per-type floor, half the TCGplayer market price). The
cheapest by item + stated postage wins after gross low outliers are pruned. A
miss costs nothing: the page still offers the search.

**eBay quota: Riftbound first.** The Browse API allows 5,000 calls a day for
the whole app, and Riftbound's importers use most of it (4,200 → 2,800
remaining across one refresh run, DECISIONS.md 2026-10-01). Pokémon searches
only in the 21:47 UTC run, after both Riftbound refreshes (07:00 and 19:00
UTC), reads the live remaining count and spends `min(60, remaining − 2500)`:
never more than 60, and never into the 2,500 that covers a full Riftbound run
plus its own reserve, wherever eBay's daily reset falls. An unreadable count
spends nothing; the 05:17 UTC run never searches eBay. Tracked: booster boxes,
ETBs, Pokémon Center ETBs, booster bundles, Ultra- and Super-Premium
Collections from sets released in the last 12 months plus pre-orders (~29
products × 5 markets), searched in rotation, never-checked first, then
stalest. Each pair comes round about every two and a half days; a row older
than 72h shows as "unknown", never in stock (`lib/sealed-offers.ts`).

**Prices on the page** (`src/lib/pokemon/board.ts`), the site's rules applied
unchanged: cheapest first by item price; eBay rows in their price position, in
eBay blue; references (TCGplayer market, Cardmarket trend) below the
comparison, never in it, converted outside their market and marked ≈; open /
sold out / unknown past 72h; only an open row sets the headline.

**Markets.** The site's cookie market, nothing new. Grid pages are per-request
(`getCountry()`, like `/sealed`) over one cached catalogue per market. The
product page is ISR with no cookie read and ships all six boards; the client
picks one (the card-page pattern). The UK "show in EUR" preference is honoured.

**Affiliates.** Every outbound link goes through `lib/affiliate.ts`:
`affiliateUrl(url, "pkmn_<source>", "/pokemon/…")` and
`ebaySearchUrl(market, pokemonEbayQuery(name), "pkmn-<surface>")`. So EPN's
`customid` reads `rc-<market>-pkmn…` and TCGplayer/Impact's `sharedid`
`pkmn_…-pokemon`: Pokémon revenue is separable in both networks' own reports.
`pokemonEbayQuery` puts "Pokemon" in every query exactly once and never uses
`riftboundEbayQuery` (a test forbids it).

**Egress.** Its own Neon project with its own 5 GB/month. The request path reads
two self-cached loaders: the catalogue (~455 KB per market, under the ~1.2 MB
ceiling) and one product (~5 KB). Both are tagged `pokemon`, TTL 6h, purged by
the import, deduped per request, listed in `tests/nested-cache.test.ts`. The
sitemap reads the DB directly (narrow selects) so the catalogue's 6h TTL never
undercuts the sitemap route's 24h (egress rule 5). Estimated steady state: well
under 50 MB/day.

## 5. Measuring the POC

| Signal | Where |
|---|---|
| Visits | GA4 / Vercel: pages under `/pokemon` |
| Homepage reach | `pokemon_promo_click` (`target`: hub, booster-box, etb, sets) |
| Engagement | `pokemon_quickview_open` (`product`, `kind`) |
| Affiliate clicks | `buy_click` with `page_type` `pokemon_*` (`retailer` `pkmn_*` for tracked rows, `pkmn_ebay_search` / `ebay_search` for searches) |
| Revenue | EPN: customid contains `pkmn`. TCGplayer (Impact): sharedid starts `pkmn_` |
| Copy buttons | `pokemon_copy_prices` (`format`, `withLink`, `page`) |
| Pasted links | sessions with `utm_campaign=pkmn-copy` (`utm_source` reddit or discord, `utm_medium=copy`) |
| Search | Search Console clicks on `/pokemon/*`; submit `/sitemaps/pokemon.xml` |

A sensible read after four to six weeks: Pokémon sessions as a share of the
site's, buy-click rate per session against `/sealed`'s, and EPN earnings per
1,000 Pokémon sessions.

## 6. Decisions the owner may want to revisit

- **Product pages are noindex** until `POKEMON_INDEX_PRODUCTS=1`, and then only
  the ~160 that pass the stage-1 gate. Templated product pages are the shape
  AdSense called low-value before. Flip it only when both the local audit and a
  preview run of `scripts/adsense-audit.ts` show no `pokemon-product` cluster
  and a median of at least 150 words (2026-10-01 locally: median 555, masked
  similarity 0.323, no cluster). A cluster flag means no flip; never pad.
  Stage 2 (UPC/SPC, then premium collections with known packs) waits for a
  premium-collections hub so none is an orphan.
- **No MSRP** until a sourced registry exists (one URL and checked date per
  product and market); `tests/pokemon-copy.test.ts` bans the word meanwhile.
- **TCGplayer prices in a downloadable CSV**: not built; pasted tables and bot
  replies show the same figures the pages already do.
- **Cardmarket off** pending the permission question (§1).
- **DexCompare.** `/about` links the owner's separate Pokémon site. Two of the
  owner's sites pricing Pokémon sealed may compete in search; whether to
  cross-link, consolidate or keep both is the owner's call.
- **Stores.** Phase 2: the Shopify/WooCommerce scrapers already cover stores
  that sell Pokémon; a Pokémon store pass would match titles with the same
  `kinds.ts` + `distinctiveTokens` rules and write `source: "store:<key>"` rows.
- **Watches / alerts / Premium**: none. Riftbound's Premium sells nothing here
  (the slide-in is skipped on `/pokemon`).
- **Japanese sealed**: TCGplayer category 85; same pipeline, separate scope.
