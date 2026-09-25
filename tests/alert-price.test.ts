import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_FRESH_MS,
  ALERT_LOOKBACK_MS,
  ALERT_ROWS_PER_PAIR,
  alertPriceFromRows,
  computeAlertPrices,
  isAlertEligibleRetailer,
  type AlertPriceDb,
} from "../src/lib/alert-price";
import { alertConditionRank, conditionRank } from "../src/lib/condition";
import { ALL_FALLBACK_RETAILERS, EBAY_CA_RETAILER } from "../src/lib/constants";
import { NOW, hoursAgo, listing } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE (2026-09-25): alerts compare the cheapest copy you could
// actually buy — Near Mint or unstated, in stock, seen within 36h, at a real
// store, CardTrader or TCGplayer US's listing row — never eBay, never a
// converted reference row, never a promo row cloned from its base card.
// ─────────────────────────────────────────────────────────────────────────────

test("eBay never sets or names an alert price — every eBay key, ebay_ca included", () => {
  for (const key of ["ebay", "ebay_us", "ebay_uk", "ebay_sg", "ebay_eu", EBAY_CA_RETAILER]) {
    assert.equal(isAlertEligibleRetailer(key), false, key);
    const p = alertPriceFromRows([listing("c", 300, { retailer: key, retailerName: "eBay" }), listing("c", 2500)], NOW);
    assert.equal(p.priceCents, 2500, `${key}: the A$3 eBay listing is ignored, the store's A$25 is the price`);
    assert.deepEqual(p.stores.map((s) => s.retailer), ["shopx"]);
  }
  // With ONLY eBay, the card is sold out as far as alerts are concerned.
  assert.equal(alertPriceFromRows([listing("c", 300, { retailer: "ebay_us" })], NOW).state, "soldout");
});

test("converted reference rows never count; TCGplayer US's listing row and CardTrader do", () => {
  for (const key of ALL_FALLBACK_RETAILERS) {
    assert.equal(isAlertEligibleRetailer(key), false, key);
    assert.equal(alertPriceFromRows([listing("c", 100, { retailer: key })], NOW).state, "soldout", key);
  }
  assert.equal(isAlertEligibleRetailer("tcgplayer"), true);
  assert.equal(isAlertEligibleRetailer("cardtrader"), true);
  assert.equal(alertPriceFromRows([listing("c", 420, { retailer: "tcgplayer", condition: "NM" })], NOW).priceCents, 420);
});

test("a derived (cloned promo) row never triggers or names an alert", () => {
  const p = alertPriceFromRows([listing("promo", 400, { retailer: "tcgplayer", derived: true }), listing("promo", 900)], NOW);
  assert.equal(p.priceCents, 900);
  assert.equal(alertPriceFromRows([listing("promo", 400, { derived: true })], NOW).state, "soldout");
  assert.equal(alertPriceFromRows([listing("promo", 400, { derived: false })], NOW).priceCents, 400);
});

test("only Near Mint or unstated condition: a played copy is not a price drop", () => {
  for (const c of ["Lightly Played", "Slightly Played", "Moderately Played", "Heavily Played", "Damaged", "Played", "Near Mint / Lightly Played"]) {
    const p = alertPriceFromRows([listing("c", 1200, { condition: c }), listing("c", 3000, { retailer: "shopy" })], NOW);
    assert.equal(p.priceCents, 3000, `${c} is ignored`);
  }
  for (const c of [null, "", "Near Mint", "NM", "Mint", "Default", "Foil"]) {
    assert.equal(alertPriceFromRows([listing("c", 1200, { condition: c })], NOW).priceCents, 1200, `${c} counts`);
  }
});

test("alertConditionRank is stricter than the importer's conditionRank, which is unchanged", () => {
  assert.equal(alertConditionRank("Slightly Played"), 1);
  assert.equal(alertConditionRank("Played"), 2);
  assert.equal(conditionRank("Played"), 0, "the importer's ordering is untouched by the move");
  assert.equal(alertConditionRank("Near Mint Foil"), 0);
  assert.equal(alertConditionRank("HP"), 3);
  assert.equal(alertConditionRank("Poor"), 4);
  assert.equal(conditionRank("Heavily Played"), 3);
  assert.equal(conditionRank("Default Title"), 0);
});

test("stale rows never set a price; only-stale is UNKNOWN, never sold out", () => {
  const fresh = listing("c", 1000, { lastSeen: hoursAgo(35) });
  const stale = listing("c", 800, { retailer: "shopy", lastSeen: hoursAgo(37) });
  assert.equal(alertPriceFromRows([fresh, stale], NOW).priceCents, 1000, "the 37h-old cheaper row is ignored");
  // A failing feed: its last rows claim stock, nothing fresh does.
  assert.equal(alertPriceFromRows([stale], NOW).state, "unknown");
  // A stale PLAYED row would not have counted anyway: plainly sold out.
  assert.equal(alertPriceFromRows([{ ...stale, condition: "Lightly Played" }], NOW).state, "soldout");
  assert.equal(alertPriceFromRows([], NOW).state, "soldout");
  assert.equal(ALERT_FRESH_MS, 36 * 3600_000);
  assert.equal(ALERT_LOOKBACK_MS, 72 * 3600_000);
});

test("up to three stores, one per retailer: price, then stated postage, then retailer key", () => {
  const p = alertPriceFromRows(
    [
      listing("c", 1000, { retailer: "zeta", retailerName: "Zeta" }),
      listing("c", 1000, { retailer: "alpha", retailerName: "Alpha" }),
      listing("c", 1000, { retailer: "mid", retailerName: "Mid", shippingCents: 300 }),
      listing("c", 900, { retailer: "alpha", retailerName: "Alpha foil" }), // same store, cheaper row
      listing("c", 2000, { retailer: "late", retailerName: "Late" }),
      listing("c", 500, { retailer: "gone", inStock: false }),
    ],
    NOW,
  );
  assert.equal(p.state, "priced");
  assert.equal(p.priceCents, 900);
  assert.deepEqual(p.stores.map((s) => [s.retailer, s.priceCents]), [["alpha", 900], ["mid", 1000], ["zeta", 1000]]);
  assert.equal(p.condition, "Near Mint");
  assert.deepEqual(p.checkedAt, p.stores[0]!.lastSeen);
});

test("computeAlertPrices: ONE bounded query over the watched pairs, grouped by market", async () => {
  const queries: Record<string, unknown>[] = [];
  const db = {
    retailerPrice: {
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        return [listing("a", 700), listing("b", 900, { country: "UK" })];
      },
    },
  } as unknown as AlertPriceDb;
  const out = await computeAlertPrices(
    db,
    [
      { cardId: "a", market: "US" },
      { cardId: "b", market: "UK" },
      { cardId: "a", market: "US" }, // duplicate pair: one lookup
      { cardId: "c", market: "US" }, // nobody lists it
    ],
    NOW,
  );
  assert.equal(queries.length, 1);
  const q = queries[0] as {
    where: { inStock: boolean; lastSeen: { gte: Date }; retailer: { notIn: string[] }; NOT: unknown; OR: unknown[] };
    select: Record<string, boolean>;
    take: number;
    orderBy: unknown;
  };
  assert.equal(q.where.inStock, true);
  assert.deepEqual(q.where.lastSeen.gte, new Date(NOW.getTime() - ALERT_LOOKBACK_MS));
  assert.deepEqual(q.where.retailer.notIn, [...ALL_FALLBACK_RETAILERS]);
  assert.deepEqual(q.where.NOT, { retailer: { startsWith: "ebay" } });
  assert.deepEqual(q.where.OR, [
    { country: "US", cardId: { in: ["a", "c"] } },
    { country: "UK", cardId: { in: ["b"] } },
  ]);
  assert.deepEqual(Object.keys(q.select).sort(), ["cardId", "condition", "country", "derived", "inStock", "lastSeen", "priceCents", "retailer", "retailerName", "shippingCents", "url"]);
  assert.equal(q.take, 3 * ALERT_ROWS_PER_PAIR);
  assert.deepEqual(q.orderBy, { priceCents: "asc" });
  assert.equal(out.get("US:a")!.priceCents, 700);
  assert.equal(out.get("UK:b")!.priceCents, 900);
  assert.equal(out.get("US:c")!.state, "soldout");
  // No pairs, no query.
  await computeAlertPrices(db, [], NOW);
  assert.equal(queries.length, 1);
});

test("a failed price read throws rather than reading as every card sold out", async () => {
  const db = { retailerPrice: { findMany: async () => { throw new Error("db down"); } } } as unknown as AlertPriceDb;
  await assert.rejects(computeAlertPrices(db, [{ cardId: "a", market: "US" }], NOW), /db down/);
});
