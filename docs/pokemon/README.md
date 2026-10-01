# Pokémon sealed — design, runbook and removal

A self-contained Pokémon TCG section on riftcompare.com (`/pokemon`), built as a
proof of concept to answer one question: **do people use it?** It prices English
Pokémon **sealed** products (booster boxes, Elite Trainer Boxes, bundles,
collections, tins, blisters, packs and decks) in all six markets, with eBay and
TCGplayer as the affiliate priorities.

It is designed to be **switched off in one variable and deleted in one commit**.
Nothing Riftbound depends on it, it never reads or writes a Riftbound database,
and the few Riftbound files that know it exists are pinned by a test.

Decision record: DECISIONS.md, "The Pokémon sealed section (beta)", 2026-10-01.

---

## 1. Going live (owner checklist)

1. **Create the database.** A new Neon project (free tier is plenty). Copy its
   **pooled** connection string.
2. **GitHub → Settings → Secrets → Actions:** add `POKEMON_DATABASE_URL`.
   (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_AFFILIATE_CAMPAIGN` and
   `CRON_SECRET` already exist and are reused.)
3. **Run the import once:** Actions → "Pokemon sealed import" → Run workflow.
   The first run creates the tables (`prisma db push`), loads ~1,000 products
   and their TCGplayer prices in a few seconds, then spends a capped slice of
   eBay quota. It runs daily at 05:17 UTC after that.
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
| GitHub repo variable | `POKEMON_EBAY_MAX_CALLS` (default 160) / `POKEMON_EBAY_RESERVE` (default 2000) | The daily eBay slice and the floor it never spends below (see §4). |
| Vercel | `POKEMON_INDEX_PRODUCTS=1` | Lets product pages be indexed and puts them in the sitemap. Off by default (§6). |

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
tests/pokemon-*.test.ts
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

Also: the two `generate --schema prisma/pokemon/...` additions in `package.json`
(`build`, `db:generate`, and the three `pokemon:*` scripts) and in
`.github/workflows/ci.yml`; `getPokemonCatalog`/`getPokemonProduct` in
`tests/nested-cache.test.ts`; the Pokémon note in `CLAUDE.md`; the rows in
`docs/seo-keyword-map.md`; the bullet in `docs/CURRENT-STATE.md`. The shared
`SealedFilters`/`SealedSort` keep their new optional props (defaults are the
Riftbound behaviour). Then delete the Neon project.

## 4. Architecture

```
                     ┌──────────── GitHub Actions, daily 05:17 UTC ────────────┐
TCGCSV (TCGplayer) ─▶│ scripts/pokemon/import.ts → src/lib/pokemon/import.ts    │
Cardmarket files  ─▶│   catalog.ts  kinds.ts  cardmarket-match.ts  ebay-match  │──▶ Neon "Pokémon" project
eBay Browse API   ─▶│   (writes ONLY to POKEMON_DATABASE_URL)                  │      (POKEMON_DATABASE_URL)
                     └──────────────── POST /api/pokemon/revalidate ────────────┘              │
                                                                                               ▼
  /pokemon, /pokemon/sealed, /pokemon/sets, /pokemon/sets/[set]   ◀── getPokemonCatalog(market)  (unstable_cache, tag "pokemon", 6h)
  /pokemon/sealed/[slug] (ISR 6h)  ·  /api/pokemon/product/[slug] ◀── getPokemonProduct(slug)
```

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

**eBay quota.** The Browse API allows 5,000 calls a day for the whole app, and
Riftbound's importers use most of it (4,200 → 2,800 remaining across one
refresh run, DECISIONS.md 2026-10-01). Pokémon reads the live remaining count
and spends `min(160, remaining − 2000)`; an unreadable count spends nothing.
Tracked: booster boxes, ETBs, Pokémon Center ETBs, booster bundles, Ultra- and
Super-Premium Collections from sets released in the last 24 months plus
pre-orders (50 products × 5 markets on 2026-10-01), searched in rotation,
never-checked first, then stalest. Each pair comes round in under two days at
the default 160 calls; a row older
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

A sensible read after four to six weeks: Pokémon sessions as a share of the
site's, buy-click rate per session against `/sealed`'s, and EPN earnings per
1,000 Pokémon sessions.

## 6. Decisions the owner may want to revisit

- **Product pages are noindex** (`POKEMON_INDEX_PRODUCTS`). ~1,000 templated
  pages is the shape AdSense called low-value before; the hub, grid and 42 set
  pages (text written from each set's data) are indexed. Turn it on once the
  section proves itself.
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
