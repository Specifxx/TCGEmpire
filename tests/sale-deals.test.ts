// The Black Friday / Cyber Monday deal list's filters, sort, freshness flag and sparkline (src/lib/sale-deals.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, DEFAULT_FILTERS, isStale, sparkPath, typesOf, type SaleDealRow } from "../src/lib/sale-deals";

const row = (o: Partial<SaleDealRow>): SaleDealRow => ({
  slug: "x", name: "X", productType: "Booster Box", imageUrl: null, preorder: false, priceCents: 10000, storeName: "S",
  buyHref: "#", retailer: "s", ebayHref: "#", checkedAt: new Date().toISOString(), median: null, msrp: null, typical: null, spark: [], ...o,
});

const rows = [
  row({ slug: "a", name: "A", priceCents: 399, productType: "Booster Pack", typical: { pct: 20, cents: 499, lowest: false, sinceDay: "2026-10-24" } }),
  row({ slug: "b", name: "B", priceCents: 35000, productType: "Booster Box Case", typical: { pct: 40, cents: 58000, lowest: true, sinceDay: "2026-10-24" }, median: { pct: 24, cents: 46000 } }),
  row({ slug: "c", name: "C", priceCents: 12000, msrp: { pct: 30, cents: 17000 } }),
  row({ slug: "d", name: "D", priceCents: 6000, preorder: true, typical: { pct: 12, cents: 6800, lowest: false, sinceDay: "2026-10-24" } }),
];

test("the toggle keeps only rows with a discount on that basis, biggest first", () => {
  assert.deepEqual(applyFilters(rows, DEFAULT_FILTERS).map((r) => r.slug), ["b", "a", "d"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, basis: "median" }).map((r) => r.slug), ["b"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, basis: "msrp" }).map((r) => r.slug), ["c"]);
});

test("filters and sort", () => {
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, type: "Booster Pack" }).map((r) => r.slug), ["a"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, band: "u50" }).map((r) => r.slug), ["a"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, stock: "pre" }).map((r) => r.slug), ["d"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, sort: "price" }).map((r) => r.slug), ["a", "d", "b"]);
  assert.deepEqual(typesOf(rows, "typical"), ["Booster Box", "Booster Box Case", "Booster Pack"]);
});

test("freshness flag and sparkline", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  assert.equal(isStale("2026-11-24T01:00:00Z", now), false);
  assert.equal(isStale("2026-11-23T23:00:00Z", now), true);
  assert.equal(sparkPath([null, 100], 72, 22), "");
  assert.match(sparkPath([100, null, 200, 150], 72, 22), /^M0\.0,21\.0 L48\.0,1\.0 L72\.0,11\.0$/);
});
