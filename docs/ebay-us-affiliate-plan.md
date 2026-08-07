# eBay US affiliate plan

**Goal:** raise eBay Partner Network click volume and conversion in the US market.
**Date:** 2026-08-05 · **Scope:** homepage, guides, card price tables, sealed, measurement.

Every claim below was checked against the code. File:line references are to the tree at
the time of writing.

---

## 0. Read this first — the brief's premises don't survive contact with the code

Three of the five stated premises are wrong, and one is exactly inverted. Building to the
brief as written would spend effort adding things that already exist while leaving the
actual revenue leak untouched.

| # | Stated premise | Verdict | Evidence |
|---|---|---|---|
| 1 | "Homepage has zero visible eBay links" | **Refuted** | Five distinct affiliate-tagged eBay paths render on `/` today (§1) |
| 2 | "Vendetta section only promotes TCGplayer booster boxes" | **Refuted** | The "Shop Vendetta" button is an internal `<Link href="/sets/vendetta">`. It is not affiliate-tagged, and TCGplayer is not mentioned in the block. `VendettaBlock.tsx:44-46` |
| 3 | "30+ guide pages contain zero affiliate links" | **Partly true** | There are 29 guides, not 30+. 10 already carry `shop` strips. All 76 articles carry a site-wide eBay footer banner. But **19 of 29 guides have no contextual eBay link** — that part is real (§2) |
| 4 | "Sealed shows only eBay, should show cheapest retailer" | **Inverted** | `/sealed` already ranks cheapest-across-retailers with a "Best price" badge. The real defect is the opposite: **US sealed has zero eBay rows** — eBay sealed is hardcoded AU-only (§4) |
| 5 | "eBay ranks 16th on average in the US" | **Confirmed** | Structural: ~36 competing US sources vs ~21 in AU, strict item-price sort (§3) |
| 6 | "11 US vs 209 AU buy_clicks" | **Confirmed, but the metric is dead** | The click beacon was switched off 2026-07-23 (§5) |

### The single most important finding

`/api/click/route.ts` is a **no-op stub**. It returns `204` and writes nothing:

```ts
// Click beacon — DISABLED. … that write was contributing to the
// history database's Neon network-transfer usage, so it's been switched off.
export async function POST() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
```

`/admin/clicks` reads `dbHistory.clickEvent`, which has received no rows since
**2026-07-23**. Its "eBay clicks by market · 30d" panel — the panel the 11-vs-209 figure
comes from — uses `createdAt: { gte: d30 }`. As of 2026-08-05 that window contains roughly
17 days of real data and shrinks daily; it reads **zero** from 2026-08-22 onward.

The live signal is Vercel Analytics `track("buy_click", { retailer, country, kind })`
(`OutboundLink.tsx:37`), which `/admin/clicks` cannot read.

**Do not tune placements against 11-vs-209.** Restore measurement first (§5), then measure
for two weeks, then build. Everything else in this document is ordered on that assumption.

---

## 1. Homepage

### What is already there

| Path | Component | Retailer key | Position |
|---|---|---|---|
| A | `PartnersStrip` "Approved partners" wordmark | `ebay_search` | `page.tsx:375` — very bottom |
| B | `EbayPicks` → `EbayPicksLive` chase-card tiles | `ebay_picks` | `page.tsx:235` — mid-page |
| C | `EbayBuyCta` (fallback when B has no cached listings) | `ebay` | same slot as B |
| D | `FooterAds` → `EbayAd` leaderboard | `ebay_banner` | `layout.tsx:242` — every route |
| E | `TodaysTopDeals` cheapest-sealed row, when the winner is an eBay listing | `ebay` | `page.tsx:228` |

So the homepage is not missing an eBay link. What it's missing is a **high-intent,
above-the-fold** one — paths A and D are chrome, and B sits four sections down.

### Recommendation: one US-gated CTA at `page.tsx:236`

Insert directly after `<EbayPicks />`, inside the existing commercial run. `page.tsx:232-234`
already documents the ordering rule this respects: *"Sits after Top Deals so the commercial
run reads own-inventory first, affiliate second."*

Do **not** put it above `TodaysTopDeals` (`page.tsx:224`) — that inverts the documented rule
and demotes the page's strongest differentiator.

Because `page.tsx` is ISR-cached (`revalidate = 3600`) and must stay cookie-free, the gate
has to be client-side:

```tsx
// src/components/home/EbayUsHeroCta.tsx
"use client";
import { useCountry } from "@/components/CountryProvider";
import { EbayBuyCta } from "@/components/EbayBuyCta";

export function EbayUsHeroCta() {
  const { country } = useCountry();
  if (country !== "US") return null;
  return (
    <EbayBuyCta
      heading="Every Riftbound single, one search"
      query="Riftbound"
      className="mt-0"
    />
  );
}
```

`EbayBuyCta` is the right vehicle: it already carries the eBay wordmark, the `#0064d2`
brand treatment, `ebayAffiliateUrl` tagging, and a mandatory `AffiliateDisclosure`.

**Copy.** Match the "real numbers, not hype" register the Vendetta block established:

- Heading: **"Every Riftbound single, one search"**
- Sub: **"New, sealed and graded listings on eBay — the widest Riftbound selection anywhere, shipped from US sellers."**
- Button: **"Shop on eBay →"** (already the component default)

Avoid `#e5484d` — `VendettaBlock.tsx:14-15` reserves it for Vendetta.

**Caveats worth knowing before you ship this.** The ISR HTML is rendered with
`initial = DEFAULT_COUNTRY = "US"` (`layout.tsx:220`, `country.ts:33`), so the CTA is in the
cached HTML and in Googlebot's view, then removed client-side for non-US visitors. There is
a brief pre-hydration frame where AU/UK visitors see it. That is the same trade every other
localised unit on the page makes.

### Also fix while you're here

`PartnersStrip` receives `country={country}` where `country = DEFAULT_COUNTRY` (`page.tsx:105,375`).
It is a **server** component, so every visitor — AU, UK, SG — gets a `ebay.com` link tagged
`country="US"`. Both the destination and the analytics dimension are wrong for non-US
visitors. Make it a client component reading `useCountry()`, as `FooterAds` already does.

`TodaysTopDeals` renders affiliate links with **no `AffiliateDisclosure`** anywhere in the
file. That is a live EPN compliance gap, independent of this project.

---

## 2. Guides

### Reality

29 guides, 47 blog posts. 25 articles carry `shop` strips; **51 carry none**. Every article
does carry the site-wide eBay footer banner via `FooterAds`, so "zero affiliate links" is
false — but a footer banner converts at roughly 0.05–0.15%, versus 1–3% for a contextual
in-content strip. Treat the footer banner as not existing for planning purposes.

### The structural problem: the strip is buried

`ArticleView.tsx` renders in this order:

```
hero → AnswerBox → ToC → AdSlot → body+embeds → tail embeds
  → ArticleMarketData (418) → ArticleTopValue (422) → ArticleFaq (440)
  → ArticleShopStrip (442) → EbayPicks (447) → "Ready to buy?" (464) → related
```

On a 1,200-word guide with a FAQ, the shop strip is below three full-width blocks. Most
readers never reach it. **Fixing placement is worth more than adding strips**, and it is a
two-line change.

#### Fix 2a — support a `[[shop]]` marker (highest leverage, ~10 lines)

`ArticleView.tsx:236` already splits the body on positioned markers:

```ts
const bodyParts = article.body.split(/^\[\[(embed|closeup):(\d+)\]\]$/m);
```

Extend the alternation to `(embed|closeup|shop)` and render `ArticleShopStrip` when the
marker kind is `shop`, tracking placement so the tail copy is skipped. That lets any guide
drop `[[shop:0]]` immediately after the section where buying intent peaks — typically right
after the first price table or the "which should I buy" heading — instead of at the bottom.

#### Fix 2b — move the unpositioned strip above the FAQ

Swap lines 440 and 442 so an unmarked `ArticleShopStrip` renders before `ArticleFaq`. The
FAQ is a long accordion; nothing commercial should sit under it.

### Which guides to add strips to, in priority order

Priority is traffic potential × buying intent. Traffic signal is the curated
`FEATURED_GUIDES` list in `guides/page.tsx`, whose comment records real 30-day Top Pages
data: *"Empower Explained alone outdrew every other guide combined; deck-archetype content
is the clear #2."*

#### Tier 1 — top-traffic or top-intent, currently unmonetised

| Slug | Words | Why | Anchor text | Placement |
|---|---|---|---|---|
| `budget-riftbound-decks` | 290 | **In `FEATURED_GUIDES`** (top-3 traffic) and has zero monetisation. The single biggest miss. | "Budget staples on eBay", "Cheap Riftbound singles" | `[[shop:0]]` after the first decklist |
| `where-to-buy-riftbound-cards` | 1174 | Pure transactional intent; the query *is* "where to buy" | "Riftbound singles on eBay", "Riftbound sealed on eBay" | After the store-comparison section, before the FAQ |
| `cheapest-riftbound-booster-boxes` | 371 | `marketData: "US"` already — a US page with no eBay path | "Riftbound booster boxes on eBay" | Directly under the price block |
| `most-valuable-riftbound-cards` | 580 | Chase-card intent; highest AOV per click | "Chase cards on eBay", plus `ebayPicks: true` | `[[shop:0]]` after the top-10 |
| `riftbound-singles-vs-sealed` | 246 | Decision page — reader picks a purchase type and needs somewhere to go | "Riftbound singles on eBay", "Riftbound booster boxes on eBay" | End of the comparison table |
| `riftbound-booster-box-ev-worth-ripping-or-buying-singles` | 929 | EV maths ends in a buy decision | "Booster boxes on eBay", "Singles on eBay" | After the EV verdict |

#### Tier 2 — strong intent, moderate traffic

`riftbound-set-checklist-how-to-complete-a-set` (958w) · `why-riftbound-card-prices-change`
(1621w — longest unmonetised guide) · `how-to-find-riftbound-arbitrage-opportunities` (855w)
· `understanding-riftbound-card-rarity` · `how-to-store-and-protect-riftbound-cards`
(sleeves/toploaders are a genuine eBay category) · `riftbound-for-beginners` ·
`how-a-riftbound-deck-is-built`.

#### Tier 3 — blog posts with buying intent, all unmonetised

`ebay-bidding-strategies` (1062w — **an eBay strategy guide with no eBay link**) ·
`riftbound-card-values` (1446w) · `most-expensive-riftbound-cards` (809w) ·
`riftbound-card-price-comparison` · `best-riftbound-marketplaces` · `tcgplayer-fees` ·
`currency-conversion-fees` · `beginner-mistakes-buying-riftbound-cards` ·
`buying-singles-vs-opening-packs` · `should-you-buy-riftbound-origins-before-vendetta`.

#### Anchor-text rules

`ArticleShopStrip` localises the eBay domain per market, so anchors must not name a country.
Write the product, not the action: **"Vendetta booster boxes on eBay"** beats **"Click here
to buy"**. Keep each strip to 2–4 links — `best-riftbound-vendetta-decks` uses 4 and that is
the practical ceiling before it reads as a link farm.

#### Deliberately skip

`how-to-buy-on-riftcompare-marketplace`, `riftcompare-marketplace-buyer-protection-explained`,
`riftcompare-marketplace-fee-cut-2-percent`, `marketplace-vs-stores-where-to-buy-riftbound`.
These sell the first-party marketplace. Putting eBay links on them cannibalises a
higher-margin channel.

---

## 3. Card price tables

### Why eBay ranks ~16th in the US

Not a data problem, and not a deliberate demotion. US eBay is refreshed **every** import run
(`price-import.ts:317-321`, `EBAY_ALWAYS_MARKETS`) and a test pins it
(`tests/affiliate-priority.test.ts:364`).

It is arithmetic:

| Market | Stores in registry | Buyable marketplace rows | Max table rows |
|---|---|---|---|
| **US** | 34 | `tcgplayer` (USD, native) + `ebay_us` | **~36** |
| AU | 20 | `ebay` | ~21 |
| SG | 22 | `ebay_sg` | ~23 |
| UK | 14 | `ebay_uk` | ~15 |

eBay contributes **exactly one row per card per market** — `searchEbayLowest()` returns a
single result, and `@@unique([cardId, retailer, condition, isFoil])` enforces it. That single
row is sorted purely on item price (`market-rows.ts:70`):

```ts
.sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);
```

Against 35 US competitors, a mid-priced eBay listing lands mid-table. Against 20 AU
competitors, the same listing lands top-5. Nothing is broken.

### Recommendation: featured module, not weighted ranking

Of the three options in the brief:

- **Weighted ranking for affiliate retailers — reject.** It breaks the "cheapest first"
  promise, and the page makes that promise in schema.org `Product`/`Offer` markup, not just
  prose. Silently reordering a comparison table for commission is the kind of thing that
  costs a comparison site its credibility, and `EbayBuyCta.tsx:16-19` already commits in
  writing to the opposite: *"it never replaces or outranks a genuinely-cheaper local
  listing."*
- **Sticky CTA button — reject for now.** Card pages already carry an `AdSlot`, a
  `TcgplayerAd` rect, an `EbayAd` leaderboard and a footer pair. A sticky bar on top of that
  reads as an ad wall and risks the AdSense policy work tracked in
  `docs/adsense-remediation.md`.
- **Featured eBay section — adopt.** A separate panel is honest (it is visibly not a table
  row), it is already the site's established pattern, and it does not touch the comparator.

#### Implementation

Render a compact eBay module **directly beneath the price-comparison panel**, in
`CardMarketSection.tsx` between the table's closing `</div>` (line 305) and `TcgMarketPrice`
(line 309) — above the existing `TcgplayerAd`. Show it only when eBay is present but buried:

```tsx
// inside CardPriceComparison, after `m` is computed
const ebayRow = m.prices.find((p) => p.retailer.startsWith("ebay"));
const ebayRank = ebayRow ? m.prices.indexOf(ebayRow) + 1 : null;
// Only worth a panel when the row exists but is far enough down to be unseen.
const showFeatured = ebayRank != null && ebayRank > 5;
```

The panel should state the real position rather than hide it — *"eBay's cheapest listing for
this card is #{ebayRank} of {m.prices.length} at {fmt(ebayRow.priceCents)}"* — with a
`Buy on eBay →` button in `#0064d2`. That is additive and truthful: it surfaces a fact the
reader would otherwise have to scroll 16 rows to find, and it leaves the ranking untouched.

Pass a placement sub-id so EPN can attribute it: `ebayAffiliateUrl(url, "card-featured")`.

#### Three defects to fix in the same pass

1. **Untracked CTAs.** `CardMarketSection.tsx:325-327` and `QuickView.tsx:342-353` are plain
   `<a>` elements, not `OutboundLink`. They are affiliate-tagged but fire **no** `buy_click`.
   Every click through them is invisible to both the DB and Vercel Analytics. Wrap both.
2. **The FAQ makes a claim the table doesn't implement.** `card/[id]/page.tsx:1121` says
   users can *"buy from whichever retailer offers the lowest total price including postage"*,
   but the sort is item-price. Store rows have `ship: null` ("postage at checkout") while
   eBay rows carry a real figure, so eBay is the row honestly displaying a higher landed
   cost while stores show a bare item price. Either fix the copy or rank on `delivered`
   where both figures are known — the copy fix is safer.
3. **`EbayAd`'s domain map lacks SG and CA** (`EbayAd.tsx:26-31`), so those markets get an
   `ebay.com.au` banner. `affiliate.ts:43-44` already has the rotations.

---

## 4. Sealed

### The premise is inverted, and the real bug is worth more than the proposed fix

`/sealed` already does what the brief asks for. `SealedTile` shows `g.lowestPriceCents`
(cheapest across all retailers) and `g.storeCount`; `SealedQuickView` renders a full
cheapest-first board with a gold **"Best price"** badge on row 0 and a per-retailer buy link.
The eBay/Amazon strip at `sealed/page.tsx:280-316` is a clearly-labelled *additional*
marketplace search, not the primary price.

The actual defect — `sealed-import.ts:262`:

```ts
country: "AU", // eBay is AU-only
```

and `ebay.ts:590`, where `searchEbaySealed` hardcodes the marketplace:

```ts
"X-EBAY-C-MARKETPLACE-ID": DEFAULT_MARKETPLACE,   // = "EBAY_AU"
```

**US visitors see zero eBay sealed listings.** The US sealed comparison is TCGplayer (locked
to `country: "US"` at `sealed-import.ts:322`) plus US Shopify stores. Sealed is the
highest-AOV category on the site — booster boxes are the biggest baskets — and on the
default market the eBay line simply does not exist.

### Recommendation

Give `searchEbaySealed` a marketplace parameter and loop it over the same market configs
singles already use, mirroring `refreshEbayMarkets`:

```ts
export async function searchEbaySealed(
  name: string, productType: string, setCode: string | null,
  referenceCents?: number | null,
  marketplace: string = DEFAULT_MARKETPLACE,   // NEW
): Promise<EbayResult | null> { … }
```

Then in `sealed-import.ts`, write one row per market with the same retailer keys singles use
(`ebay`, `ebay_us`, `ebay_uk`, `ebay_sg`), and change the delete guard from
`deleteMany({ where: { retailer: "ebay" } })` to a per-market delete so a truncated run
can't wipe another market's rows.

**Budget note:** this is real eBay Browse quota. Sealed groups are few (tens, not the ~1,400
cards singles cover), so adding US is cheap — but add it to `EBAY_ALWAYS_MARKETS`-style
handling rather than the per-day rotation, since sealed prices move fast at launch.

### Then surface the winner on the tile

`SealedTile` shows `from $X · N stores` but names no retailer and carries no buy link — a
user must open the quick-view to learn who is cheapest. `top-deals.ts:88-110` already
computes retailer name + affiliate URL for the identical data shape. Add the retailer name
to the tile and an outbound button when the cheapest listing is affiliate-earning:

> **from $164.95** · at **eBay** · 7 stores  → `[Buy on eBay →]`

This is the honest version of "promote eBay when it's competitive": eBay is named only when
it genuinely wins the cheapest slot, and TCGplayer or a Shopify store is named when it does.

Also note `SealedListing` has **no `shippingCents` column**, so no delivered-price ranking is
possible for sealed the way `computeMarket` does it for singles. Worth adding before making
any landed-cost claim on `/sealed`.

---

## 5. Measurement — do this first

The 11-vs-209 number cannot be reproduced going forward, and three separate defects distort
it.

| Defect | Effect | Fix |
|---|---|---|
| `/api/click` is a no-op stub; `ClickEvent` unwritten since 2026-07-23 | `/admin/clicks` decays to zero on 2026-08-22 | Point the admin page at the Vercel Analytics API, or re-enable a sampled beacon |
| `PartnersStrip` hardcodes `country={DEFAULT_COUNTRY}` | Every partner-strip click reports `country="US"` regardless of visitor — the US figure is inflated by AU/UK clicks, and the AU figure understated | Make it a client component using `useCountry()` |
| Two eBay CTAs are plain `<a>` | `CardMarketSection.tsx:325`, `QuickView.tsx:342` fire no `buy_click` at all | Wrap in `OutboundLink` |
| `track()` is consent-gated with a 2.5s grace | Clicks in the first ~2.5s of a page load are dropped; ad-blockers block `/_vercel/insights` | Accept, but note the floor when reading absolutes |

Ten distinct eBay retailer keys reach the tracker: `ebay`, `ebay_us`, `ebay_uk`, `ebay_sg`,
`ebay_ca`, `ebay_picks`, `ebay_banner`, `ebay_search`, `ebay_sealed_search`, `ebay_deal`.
`/admin/clicks` groups on `startsWith("ebay")` so its totals are correct, but **retailer and
country are separate `groupBy`s** — you cannot currently answer "which US placement earned?"
from the dashboard.

`affiliate.ts` already solves this on the EPN side: `ebayAffiliateUrl(url, source)` writes
`customid=rc-<market>-<source>`. Most call sites omit `source`, so every click reports a bare
`rc-us`. **Pass a placement string at every eBay call site** — `card-featured`, `card-row`,
`guide-strip`, `home-cta`, `sealed-tile`. That makes the EPN dashboard authoritative for
placement attribution without any of our own infrastructure.

---

## 6. Estimated lift

**These are estimates built on stated assumptions, not forecasts.** The baseline is
unreliable (§5), so treat the ratios as sizing, not targets.

### Baseline

11 US eBay clicks in the `/admin/clicks` 30-day window, of which only ~17 days carry live
data — roughly **0.65 clicks/day**. AU over the same window: 209, ~12.3/day.

### What parity would look like

US is 37% of traffic. If AU converted at the same clicks-per-session rate:

| If AU is _n_% of traffic | AU clicks per traffic-point | US at parity | Gap vs 11 |
|---|---|---|---|
| 25% | 8.4 | ~310 | 28× |
| 35% | 6.0 | ~221 | 20× |
| 45% | 4.6 | ~172 | 16× |

Parity is **not** an achievable target — the US table has 34 competing stores, so eBay
legitimately loses the cheapest slot far more often than in AU. But a 16–28× gap is far too
large to be explained by competition alone, which is what makes the measurement defects the
most likely single contributor.

### Bottom-up, by intervention

| # | Intervention | Mechanism | Estimated effect on measured US clicks/30d |
|---|---|---|---|
| 1 | Fix measurement (§5) | Recovers clicks that already happen but aren't counted | **+20–50%** of true volume, no behaviour change |
| 2 | US eBay sealed (§4) | Converts an impossible surface into a possible one — currently structurally zero | **+8–20**, highest AOV per click |
| 3 | Card-page featured module (§3) | Position effect: rank ~16 of 36 → a named panel below the table | **3–6×** on card-page eBay clicks |
| 4 | Guides: reposition + Tier 1 strips (§2) | Contextual strip ~1–3% CTR vs footer banner ~0.1% | **+15–40** |
| 5 | Homepage US CTA (§1) | One above-the-commercial-run placement | **+3–8** |

### Consolidated

**11 → 60–150 measured US eBay buy_clicks per 30 days within 60–90 days of shipping all
five — roughly a 5–14× increase.**

The range is wide on purpose. The low end assumes the 11 was close to true and the US market
genuinely converts worse. The high end assumes measurement was hiding most of the volume,
which the two untracked CTAs and the dead beacon make plausible.

**Revenue, not clicks, is the number that matters.** EPN pays on transaction, not click. US
Riftbound sealed AOV is meaningfully higher than AU singles AOV, so intervention 2 may
outperform its click count. Track EPN earnings by `customid` once placement sub-ids are
live (§5), not `buy_click` volume.

### Suggested order

1. **Week 1 — measurement.** §5 in full. Wrap the two untracked CTAs, fix `PartnersStrip`,
   add placement sub-ids. Then wait two weeks and read Vercel Analytics + EPN by `customid`.
2. **Week 1 — guides.** §2's `[[shop]]` marker and the 440/442 swap are ~10 lines and carry
   no ranking or compliance risk. Tier 1 strips alongside.
3. **Week 3 — sealed.** §4's marketplace parameter. Structurally zero → non-zero on the
   highest-AOV category.
4. **Week 4 — card featured module.** §3, once there is a trustworthy baseline to measure it
   against.
5. **Week 4 — homepage CTA.** §1, smallest expected effect, do it last.

---

## Appendix — full guide monetisation audit

Generated by loading `getArticles()` and inspecting `shop` / `ebayPicks`.

**Guides: 29 total, 10 monetised, 19 not.**

Monetised: `cheapest-way-to-start-riftbound` (2) · `riftbound-vendetta-crystal-rose-cards` (1)
· `jayce-mel-riftbound-empower-explained` (2) · `riftbound-banlist-explained` (1) ·
`riftbound-vendetta-overnumbers-explained` (3) · `riftbound-burn-explained` (2) ·
`riftbound-flow-explained` (2) · `riftbound-empower-explained` (3 + picks) ·
`best-riftbound-vendetta-decks` (4) · `building-for-riftbound-vendetta` (3).

Unmonetised: `riftbound-variant-glossary` · `riftbound-rules-explained` ·
`why-riftbound-card-prices-change` · `riftbound-pre-rift-rules-explained` ·
`how-to-buy-on-riftcompare-marketplace`\* · `riftbound-vendetta-card-list` ·
`riftbound-set-checklist-how-to-complete-a-set` ·
`understanding-the-riftcompare-index-methodology` ·
`how-to-find-riftbound-arbitrage-opportunities` ·
`riftbound-booster-box-ev-worth-ripping-or-buying-singles` ·
`how-to-store-and-protect-riftbound-cards` · `understanding-riftbound-card-rarity` ·
`budget-riftbound-decks` · `riftbound-singles-vs-sealed` · `riftbound-for-beginners` ·
`most-valuable-riftbound-cards` · `cheapest-riftbound-booster-boxes` ·
`where-to-buy-riftbound-cards` · `how-a-riftbound-deck-is-built`.

\* deliberately excluded — first-party marketplace content.

**Blog: 47 total, 15 monetised, 32 not.**
