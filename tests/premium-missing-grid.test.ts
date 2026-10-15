import test from "node:test";
import assert from "node:assert/strict";
import { GRID_LABELS, MISSING_ROWS, shortCaption } from "../src/components/PremiumMissingGrid";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";

// /premium's ticks-and-crosses grid (2026-10-15). It presents TIER_COMPARISON;
// these pin that every row a payment changes is in it, with a short name, and
// that every value fits a 64px phone column.

test("every row that differs by tier is in the grid, with a short name", () => {
  const differs = TIER_COMPARISON.filter((r) => !(r.account === true && r.plus === true && r.premium === true));
  assert.deepEqual(MISSING_ROWS.map((r) => r.feature), differs.map((r) => r.feature));
  for (const r of MISSING_ROWS) {
    const named = r.feature.startsWith("Sealed watches") || GRID_LABELS[r.feature];
    assert.ok(named, `"${r.feature}" needs a short name in GRID_LABELS`);
  }
});

test("every caption is short enough for a phone column", () => {
  for (const r of MISSING_ROWS) {
    for (const v of [r.account, r.plus, r.premium]) {
      if (typeof v !== "string") continue;
      const c = shortCaption(v);
      assert.ok(c.length <= 12, `"${v}" → "${c}" is too long for a 64px column`);
    }
  }
  assert.equal(shortCaption("Full list + only my cards"), "Full list");
  assert.equal(shortCaption("Store-by-store plan, up to 200 cards"), "Store plan");
  assert.equal(shortCaption("Up to 50 cards"), "50 cards");
  assert.equal(shortCaption("Up to 25"), "Up to 25");
  assert.equal(shortCaption("Last 30 days"), "30 days");
});
