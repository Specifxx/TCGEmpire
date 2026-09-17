import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { priceStateFrom, MIN_HISTORY_DAYS } from "../src/lib/card-price-state";
import { computeMarket, type MarketRow } from "../src/lib/market-rows";

// A CARD PAGE IS ALWAYS INDEXABLE.
//
// The rule this replaces — noindex any card with no live listing and no price
// history — gated the robots tag and the sitemap on ~1,400 pages and had NO TEST
// OF ANY KIND. That is most of why it went unexamined for so long: it was
// correct when written (Phase 7a, against card pages that really were shells)
// and quietly stopped being correct when Phase 7b took the median card page to
// ~1,021 unique editorial words, and nothing was watching.
//
// What made it urgent rather than merely stale: indexability was a function of
// TODAY'S STOCK. A page that had earned its place in Google's index left it the
// day its last listing sold out, taking its accumulated Search Console history
// with it. The history half of the OR was supposed to catch that, and the
// history database is currently unconfigured with zero rows in PriceHistory, so
// 1,411 of 1,431 pages were resting on live stock alone.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Comments out, code in — line comments FIRST (see tests/card-type-seo.test.ts
// for the 58KB-swallowing reason), and the `[^:]` guard keeps "https://" intact.
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const STATE = "src/lib/card-price-state.ts";
const CARD_PAGE = "src/app/card/[id]/page.tsx";
const SITEMAP = "src/lib/sitemap-sections.ts";

// ── 1. There is no indexability decision left to make ──────────────────────

test("the price state carries no indexability verdict at all", () => {
  // Not "indexable is always true" — the field is GONE. A boolean that is always
  // true is an invitation to make it conditional again; an absent one is a
  // compile error at every call site.
  const empty = priceStateFrom(false, 0);
  const priced = priceStateFrom(true, 0);
  assert.ok(!("indexable" in empty), "no indexable field may survive");
  assert.ok(!("indexable" in priced));
  // isEmpty survives, because the page still has to SAY there is no price.
  assert.equal(empty.isEmpty, true);
  assert.equal(priced.isEmpty, false);
  assert.equal(priceStateFrom(false, MIN_HISTORY_DAYS).isEmpty, false);
});

test("a duplicate row is the only thing that can noindex a card page", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /const noindex = twin != null;/);
  // The old expression, in any form, must not come back.
  assert.doesNotMatch(code, /priceState\.indexable/);
  assert.doesNotMatch(code, /!\s*\w+\.indexable/);
});

test("generateMetadata no longer pays for a price lookup it cannot use", () => {
  // Two round-trips per metadata render on the site's highest-volume template,
  // one of them against the separate history project.
  const all = codeOnly(read(CARD_PAGE));
  const meta = all.slice(all.indexOf("export async function generateMetadata"), all.indexOf("export default"));
  assert.doesNotMatch(meta, /getCardPriceState/, "metadata must not query price state");
  // The BODY still uses it — that is presentation, and it must not be lost.
  assert.match(codeOnly(read(CARD_PAGE)), /const priceState = await getCardPriceState\(card\)/);
});

test("the sitemap submits every card, and the withholding helper is deleted", () => {
  const state = codeOnly(read(STATE));
  assert.doesNotMatch(state, /export async function getEmptyCardIds/, "deleted, not emptied");
  const sitemap = codeOnly(read(SITEMAP));
  assert.doesNotMatch(sitemap, /getEmptyCardIds/);
  assert.doesNotMatch(sitemap, /empty\.has\(/);
  // Duplicates are still withheld: that is "two URLs, one card", not a judgement
  // about whether a card deserves an index slot.
  assert.match(sitemap, /!dupes\.has\(c\.id\)/);
});

// ── 2. The AdSense budget that enforced the old rule ───────────────────────

test("the price budget is demoted to an observation, and the real ones are untouched", () => {
  const guard = read("scripts/adsense-guard.ts");
  const from = guard.indexOf("const budgets:");
  const budgets = guard.slice(from, guard.indexOf("\n  ];", from));
  // Leaving it would have failed the build on the very state this change creates.
  assert.doesNotMatch(budgets, /indexable card pages with no price data/);
  // Still counted and still printed — a sharp rise says something real.
  assert.match(guard, /indexable card pages with no price data.*reported, not a budget/s);
  // What actually enforces "low-value content" stays zero-tolerance.
  assert.match(budgets, /indexable pages under 150 unique editorial words/);
  assert.match(budgets, /near-duplicate clusters above 90% similarity/);
  assert.match(budgets, /pages whose server HTML contains no content at all/);
  assert.match(guard, /if \(value > 0\) fail\(/, "the surviving budgets still fail the build");
});

// ── 3. A sold-out card keeps a price on the page ──────────────────────────

const row = (over: Partial<MarketRow> = {}): MarketRow => ({
  id: Math.random().toString(36).slice(2),
  country: "US",
  retailer: "tcgplayer",
  retailerName: "TCGplayer",
  priceCents: 1200,
  ship: null,
  condition: "NM",
  isFoil: false,
  inStock: true,
  lastSeen: "2026-09-10T00:00:00.000Z",
  url: "https://example.test",
  buyHref: "https://example.test",
  policyUrl: null,
  ...(over as object),
}) as MarketRow;

test("a card with nothing in stock still reports the last price we saw", () => {
  // The listing is still there and still priced. Filtering out-of-stock rows out
  // of the summary and rendering an em dash threw away the only figure the page
  // had — and with the page now always indexable, that blank is what a crawler
  // arrives to.
  const m = computeMarket(
    [
      row({ inStock: false, priceCents: 1800, lastSeen: "2026-09-01T00:00:00.000Z" }),
      row({ inStock: false, priceCents: 950, retailer: "cardmarket-us", lastSeen: "2026-09-05T00:00:00.000Z" }),
    ],
    "US"
  );
  assert.equal(m.lowest, null, "nothing is buyable, so there is no live price");
  assert.equal(m.lastSeen?.priceCents, 950, "the CHEAPEST out-of-stock listing");
  assert.equal(m.lastSeen?.at, "2026-09-05T00:00:00.000Z");
});

test("a live price always wins — last-seen is a fallback, never a rival figure", () => {
  const m = computeMarket([row({ priceCents: 1500 }), row({ inStock: false, priceCents: 300 })], "US");
  assert.equal(m.lowest, 1500);
  assert.equal(m.lastSeen, null, "never show both; the cheaper out-of-stock row must not surface");
});

test("a card with no listings at all has neither figure", () => {
  const m = computeMarket([], "US");
  assert.equal(m.lowest, null);
  assert.equal(m.lastSeen, null);
});

test("the hero tile relabels itself rather than passing a stale price off as live", () => {
  const code = codeOnly(read("src/components/CardMarketSection.tsx"));
  assert.match(code, /Last seen · \$\{place\}/);
  assert.match(code, /m\.lastSeen \? fmt\(m\.lastSeen\.priceCents\)/);
  assert.match(code, /"out of stock"/);
  // A relative time here would be a hydration mismatch: no `mounted` guard in
  // this component and the page is ISR with revalidate=86400.
  const tile = code.slice(code.indexOf("Cheapest price · ${place}") - 400, code.indexOf("In stock at · ${place}"));
  assert.doesNotMatch(tile, /timeAgo/);
});

// ── 4. The page stopped quoting a threshold that had been wrong for months ──

test("the no-listings copy no longer cites a history threshold", () => {
  const page = codeOnly(read(CARD_PAGE));
  // It said "fewer than seven days" while MIN_HISTORY_DAYS has been 2 since
  // snapshots went weekly — an internal number, stated to the reader, and wrong.
  assert.doesNotMatch(page, /fewer than seven days/);
  assert.match(page, /no recorded price history for it yet/);
});
