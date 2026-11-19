// Sealed first (owner, 2026-11-19): "everything goes to sealed products first … we cannot kill the eBay quota."
// The singles passes run before the sealed pass in refresh-prices.yml, so they must leave the sealed pass its calls:
// primeEbayBudget({ hold: SEALED_EBAY_HOLD }) on both singles passes, no hold on the sealed pass, and the reserve
// always kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budgetFromRemaining, SEALED_EBAY_HOLD } from "../src/lib/ebay";

test("budget: live remaining minus reserve and hold, never below zero; the hold also cuts the fallback", () => {
  assert.equal(budgetFromRemaining(5000, 600, 500), 3900);
  assert.equal(budgetFromRemaining(5000, 600, 0), 4400);
  assert.equal(budgetFromRemaining(900, 600, 500), 0, "near the limit singles stop, sealed keeps what is left");
  assert.equal(budgetFromRemaining(null, 600, 500, 2200), 1700);
  assert.ok(SEALED_EBAY_HOLD >= 300, "the hold covers a sealed pass (~30 groups x 6 markets plus seeds)");
});

test("the singles passes hold calls for sealed; the sealed pass spends them", () => {
  const prices = readFileSync("src/lib/price-import.ts", "utf8");
  const primes = prices.match(/await primeEbayBudget\([^)]*\)/g) ?? [];
  assert.ok(primes.length >= 2);
  for (const p of primes) assert.match(p, /hold: SEALED_EBAY_HOLD/, `singles pass primes without the sealed hold: ${p}`);
  const sealed = readFileSync("src/lib/sealed-import.ts", "utf8");
  assert.match(sealed, /await primeEbayBudget\(\);/, "the sealed pass primes with no hold");
  assert.match(sealed, /eBay sealed: spent \$\{ebaySpentThisRun\(\)\} Browse calls/, "the sealed pass logs its spend");
  const wf = readFileSync(".github/workflows/refresh-prices.yml", "utf8");
  assert.ok(wf.indexOf("scripts/import-prices.ts") < wf.indexOf("scripts/import-sealed.ts"), "if the order flips, drop the hold");
});
