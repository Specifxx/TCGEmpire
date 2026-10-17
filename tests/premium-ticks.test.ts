import { test } from "node:test";
import assert from "node:assert/strict";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { TICK_ROWS, hasTick, type TickTier } from "../src/components/PremiumTicks";

// /premium's ticks table (2026-10-17, DECISIONS.md "/premium, 70% simpler") shows
// only ✓ and ✕, so every mark must be TRUE of the whole row name: a tier with a
// limit ("25 cards", "Top 3") gets a cross on a row named for the full thing.
// The marks are computed from TIER_COMPARISON; this holds them to it.
const TIERS: TickTier[] = ["free", "plus", "premium"];

test("every row names a real TIER_COMPARISON row (or is the free-for-everyone row)", () => {
  assert.equal(TICK_ROWS[0].from, null, "the first row is what everyone gets");
  for (const r of TICK_ROWS.slice(1)) {
    assert.ok(r.from, r.name);
    assert.ok(TIER_COMPARISON.some((t) => t.feature === r.from || t.feature.startsWith(r.from!)), `${r.name}: no row ${r.from}`);
  }
  assert.ok(TICK_ROWS.length <= 12, "cut down: twelve rows at most");
});

test("a tick is the whole thing: never a limit, never Free's taste", () => {
  for (const r of TICK_ROWS.slice(1)) {
    const row = TIER_COMPARISON.find((t) => t.feature === r.from || t.feature.startsWith(r.from!))!;
    for (const tier of TIERS) {
      const v = tier === "free" ? row.account : tier === "plus" ? row.plus : row.premium;
      const tick = hasTick(r.from, tier);
      if (v === false) assert.equal(tick, false, `${r.name}/${tier}`);
      if (tier === "free") assert.equal(tick, v === true, `${r.name}/free: a limited free value is a cross`);
      if (tier !== "free" && typeof v === "string" && v === row.account) assert.equal(tick, false, `${r.name}/${tier}: Free's taste is a cross`);
    }
  }
});

test("the marks the owner sees", () => {
  const marks = Object.fromEntries(TICK_ROWS.map((r) => [r.name, TIERS.map((t) => (hasTick(r.from, t) ? "✓" : "✕")).join("")]));
  assert.deepEqual(marks, {
    "Compare prices across every store": "✓✓✓",
    "No ads": "✕✓✓",
    "Unlimited watchlist & portfolio": "✕✓✓",
    "Target-price alerts": "✕✓✓",
    "Full Deal Finder & Rising Cards": "✕✓✓",
    "Full price history + CSV": "✕✓✓",
    "Graded price tracking": "✕✓✓",
    "Sealed restock & price alerts": "✕✓✓",
    "Store-by-store buying plan": "✕✕✓",
    "Deck price watch": "✕✕✓",
    "eBay auction alerts": "✕✕✓",
    "Full Demand Finder": "✕✕✓",
  });
});
