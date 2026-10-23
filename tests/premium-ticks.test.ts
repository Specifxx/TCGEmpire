import { test } from "node:test";
import assert from "node:assert/strict";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { TICK_ROWS, cellValue, type TickTier } from "../src/components/PremiumTicks";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "../src/lib/free-limits";
import { FREE_SEALED_WATCH_LIMIT, FREE_TARGET_ALERT_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_WATCH_LIMIT_PLUS } from "../src/lib/alert-limits";
import { FREE_HISTORY_DAYS } from "../src/lib/history-access";
import { FREE_PLANS_PER_MONTH } from "../src/lib/basket-meter";

// /premium's comparison (2026-10-22, DECISIONS.md "/premium shows each plan's real
// limits") supersedes the ticks-only table of 2026-10-17: a cell is the
// TIER_COMPARISON row's own value — true a ✓, false an em dash, a string the
// limit itself. Nothing is typed in PremiumTicks; this holds every cell to its
// source, so a limit changed in the constants moves here and in the article at once.
const TIERS: TickTier[] = ["free", "plus", "premium"];
const source = (from: string) => TIER_COMPARISON.find((t) => t.feature === from || t.feature.startsWith(from));

test("every row names a real TIER_COMPARISON row (or is the free-for-everyone row)", () => {
  assert.equal(TICK_ROWS[0].from, null, "the first row is what everyone gets");
  for (const r of TICK_ROWS.slice(1)) {
    assert.ok(r.from, r.name);
    assert.ok(source(r.from!), `${r.name}: no row ${r.from}`);
  }
  assert.equal(new Set(TICK_ROWS.map((r) => r.name)).size, TICK_ROWS.length, "row names are unique");
  assert.ok(TICK_ROWS.length <= 16, "sixteen rows at most");
});

test("a cell is the source row's value, never typed: true/false stay marks, strings stay the limit", () => {
  for (const tier of TIERS) assert.equal(cellValue(null, tier), true, "the free-for-everyone row is a tick everywhere");
  for (const r of TICK_ROWS.slice(1)) {
    const row = source(r.from!)!;
    for (const tier of TIERS) {
      const v = tier === "free" ? row.account : tier === "plus" ? row.plus : row.premium;
      assert.equal(cellValue(r.from, tier), v, `${r.name}/${tier}`);
    }
  }
  // A name that matches nothing is never shown as included.
  assert.equal(cellValue("No such row anywhere", "premium"), false);
});

test("the cells the owner sees", () => {
  const show = (v: boolean | string) => (v === true ? "✓" : v === false ? "—" : v);
  const cells = Object.fromEntries(TICK_ROWS.map((r) => [r.name, TIERS.map((t) => show(cellValue(r.from, t))).join("/")]));
  const plans = `${FREE_PLANS_PER_MONTH} plans a month`;
  const same = `Same ${FREE_PLANS_PER_MONTH} plans`;
  assert.deepEqual(cells, {
    "Compare prices across every store": "✓/✓/✓",
    "No ads": "—/✓/✓",
    Watchlist: `${FREE_WATCHLIST_LIMIT} cards/Unlimited/Unlimited`,
    Portfolio: `${FREE_PORTFOLIO_LIMIT} cards/Unlimited/Unlimited`,
    "Deal Finder & Rising Cards": "Top 3/Full/Full",
    "Price history": `${FREE_HISTORY_DAYS} days/Full + CSV/Full + CSV`,
    "Target-price alerts": `${FREE_TARGET_ALERT_LIMIT} card, daily/${PLUS_TARGET_ALERT_LIMIT} cards/Unlimited`,
    "Sealed watches": `${FREE_SEALED_WATCH_LIMIT} product/${SEALED_WATCH_LIMIT_PLUS} products/Unlimited`,
    "Best Basket & Buy this list plans": `${plans}/${plans}/Unlimited`,
    "Finish this set plans": `${same}/${same}/Unlimited`,
    "Minimum condition": "—/—/✓",
    "Deck price watch": "—/—/✓",
    "Graded price tracking": "—/✓/✓",
    "eBay auction alerts": "—/—/✓",
    "Demand Finder": "Top 10 searched/Top 10 searched/✓",
    "RiftCompare Coins": "—/—/✓",
  });
});
