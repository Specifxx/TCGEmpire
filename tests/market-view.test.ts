import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMarket,
  hasAnyMarketPrice,
  stockElsewhere,
  tileStock,
  type MarketRow,
} from "../src/lib/market-rows";
import { COUNTRY_LIST } from "../src/lib/country";
import {
  AU_FALLBACK_RETAILERS,
  SG_FALLBACK_RETAILERS,
  UK_FALLBACK_RETAILERS,
} from "../src/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// The reported bug, in one sentence:
//
//   /card/vi-destructive-ogn-036a-298 showed "CHEAPEST PRICE —" and "IN STOCK AT
//   0 stores" in the header, "exactly one tracked store in the United States has
//   it, at US$91.06" in the About section, and "No price yet" beside "1 store"
//   on /browse — three different answers to "how many stores stock this?".
//
// The three numbers were never wrong; they were three different MARKETS wearing
// the same words. This file pins the shape that makes them agree: every count is
// per-market, and a card stocked only elsewhere says so instead of silently
// reporting a number from a market the visitor isn't in.
// ─────────────────────────────────────────────────────────────────────────────

let n = 0;
function row(over: Partial<MarketRow> = {}): MarketRow {
  n += 1;
  return {
    id: `r${n}`,
    country: "US",
    retailer: `store${n}`,
    retailerName: `Store ${n}`,
    priceCents: 9106,
    ship: null,
    condition: "NM",
    isFoil: false,
    inStock: true,
    lastSeen: "2026-08-01T00:00:00.000Z",
    buyHref: "https://example.test/buy",
    policyUrl: null,
    ...over,
  };
}

// The exact reported situation: one US store, nothing anywhere else.
const US_ONLY: MarketRow[] = [row({ country: "US", retailer: "coolstuff", priceCents: 9106 })];

test("a card stocked only in the US reports 1 store in the US", () => {
  const us = computeMarket(US_ONLY, "US");
  assert.equal(us.storeCount, 1);
  assert.equal(us.lowest, 9106);
  assert.equal(us.currency, "USD");
  assert.equal(us.market, "US");
});

test("the same card reports 0 stores and no price in every other market", () => {
  for (const c of COUNTRY_LIST.filter((c) => c.code !== "US")) {
    const view = computeMarket(US_ONLY, c.code);
    assert.equal(view.storeCount, 0, `${c.code} should have no stores`);
    assert.equal(view.lowest, null, `${c.code} should have no price`);
    assert.equal(view.cheapestStandard, null);
    assert.equal(view.cheapestFoil, null);
    // The market a view was computed for is always carried with it, so no caller
    // can print a US figure under an AUD label (the bug this field exists for).
    assert.equal(view.market, c.code);
    assert.equal(view.currency, c.currency);
  }
});

test("a visitor whose market has no stock is told where it IS stocked", () => {
  const au = computeMarket(US_ONLY, "AU");
  assert.equal(au.storeCount, 0);

  const other = stockElsewhere(US_ONLY, "AU", COUNTRY_LIST);
  assert.ok(other, "an AU visitor must be told about the US listing");
  assert.equal(other.stores, 1);
  assert.equal(other.markets, 1);
  assert.equal(other.first, "the United States");
});

test("stockElsewhere never counts the visitor's own market", () => {
  const other = stockElsewhere(US_ONLY, "US", COUNTRY_LIST);
  assert.equal(other, null, "a US visitor has stock at home — nothing to disclaim");
});

test("stockElsewhere sums distinct stores across several other markets", () => {
  const rows = [
    row({ country: "US", retailer: "coolstuff" }),
    row({ country: "US", retailer: "tcgplayer" }),
    row({ country: "UK", retailer: "magicmadhouse" }),
  ];
  const other = stockElsewhere(rows, "AU", COUNTRY_LIST);
  assert.ok(other);
  assert.equal(other.stores, 3);
  assert.equal(other.markets, 2);
  // With more than one market the caller renders "in other markets", so `first`
  // is only ever read in the single-market case — but it must still be a real
  // place name, never a country code.
  assert.ok(!/^[A-Z]{2}$/.test(other.first));
});

test("stockElsewhere returns null when nothing is stocked anywhere", () => {
  const rows = [row({ country: "US", inStock: false })];
  assert.equal(stockElsewhere(rows, "AU", COUNTRY_LIST), null);
});

test("out-of-stock rows never count as a store", () => {
  const rows = [row({ country: "US", retailer: "coolstuff", inStock: false })];
  const us = computeMarket(rows, "US");
  assert.equal(us.storeCount, 0);
  assert.equal(us.lowest, null);
  assert.equal(us.outOfStock.length, 1);
});

test("one store's multiple listings count as one store", () => {
  const rows = [
    row({ country: "US", retailer: "coolstuff", isFoil: false, priceCents: 9106 }),
    row({ country: "US", retailer: "coolstuff", isFoil: true, priceCents: 15000 }),
    row({ country: "US", retailer: "coolstuff", condition: "LP", priceCents: 8000 }),
  ];
  assert.equal(computeMarket(rows, "US").storeCount, 1);
});

// ── The /browse tile ────────────────────────────────────────────────────────
// The tile's store count is baked SERVER-side for one country while its price is
// localised on the CLIENT to the visitor's. tileStock() is the rule that stops
// those two being printed side by side as though they described one market.

const noPrices = { lowestPriceCents: null };
const usOnlyPrices = { lowestPriceCents: null, lowestPriceCentsUs: 9106 };

test("tile: a price and a count from the same render show the count", () => {
  assert.deepEqual(tileStock(9106, 1, usOnlyPrices), { kind: "stores", count: 1 });
  assert.deepEqual(tileStock(9106, 4, usOnlyPrices), { kind: "stores", count: 4 });
});

test("tile: THE REPORTED BUG — no local price never renders a store count", () => {
  // Server rendered the US default (1 US store baked in); CountryProvider then
  // geo-switched the visitor to AU, where there is no price. The tile used to
  // print "No price yet" and "1 store" at the same time.
  const stock = tileStock(null, 1, usOnlyPrices);
  assert.notEqual(stock.kind, "stores", "a count from another market must not be shown");
  assert.deepEqual(stock, { kind: "elsewhere" });
});

test("tile: a card with no price in any market says nothing at all", () => {
  assert.deepEqual(tileStock(null, 0, noPrices), { kind: "none" });
  assert.deepEqual(tileStock(null, 3, noPrices), { kind: "none" });
});

test("tile: a local price with a zero count says nothing rather than '0 stores'", () => {
  assert.deepEqual(tileStock(9106, 0, usOnlyPrices), { kind: "none" });
});

test("tile: every per-country price column is considered", () => {
  const cols = [
    "lowestPriceCents",
    "lowestPriceCentsUs",
    "lowestPriceCentsUk",
    "lowestPriceCentsSg",
    "lowestPriceCentsCa",
  ] as const;
  // One column per tracked market — a market added to COUNTRY_LIST without a
  // column here would silently report "not stocked anywhere".
  assert.equal(cols.length, COUNTRY_LIST.length);
  for (const col of cols) {
    assert.equal(hasAnyMarketPrice({ lowestPriceCents: null, [col]: 1 }), true, col);
    assert.deepEqual(tileStock(null, 1, { lowestPriceCents: null, [col]: 1 }), { kind: "elsewhere" }, col);
  }
  assert.equal(hasAnyMarketPrice(noPrices), false);
});

// ── Header vs prose: the two must not contradict each other ─────────────────

test("the header metric and the About prose describe the SAME market as each other when both are US", () => {
  // The prose is baked at the US baseline (card/[id]/page.tsx `baseline`) and
  // names its market; the header names the visitor's. When the visitor IS in the
  // baseline market, both must land on the same figure — otherwise the page
  // contradicts itself for the majority of its traffic.
  const view = computeMarket(US_ONLY, "US");
  assert.equal(view.storeCount, 1);
  assert.equal(view.lowest, 9106);
  assert.equal(view.currency, "USD");
});

test("reference-only retailers are excluded from every market's store count", () => {
  // TCGplayer-AU/UK/SG and Cardmarket are converted reference prices, not real
  // local stores. Counting them would make "N stores" unbuyable — and would put
  // a store count next to a price the visitor cannot actually pay.
  const REFERENCE_ONLY = [...AU_FALLBACK_RETAILERS, ...UK_FALLBACK_RETAILERS, ...SG_FALLBACK_RETAILERS];
  assert.ok(REFERENCE_ONLY.length > 0, "the fallback lists must not be empty");

  for (const c of COUNTRY_LIST) {
    const rows = REFERENCE_ONLY.map((retailer) => row({ country: c.code, retailer }));
    const view = computeMarket(rows, c.code);
    assert.equal(view.storeCount, 0, `${c.code}: reference sources are not stores`);
    assert.equal(view.lowest, null, `${c.code}: reference sources set no "from" price`);
    // …and they must not make a card look "stocked elsewhere" either.
    assert.equal(stockElsewhere(rows, c.code === "AU" ? "US" : "AU", COUNTRY_LIST), null);
  }
});
