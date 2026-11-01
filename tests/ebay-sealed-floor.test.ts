import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EBAY_MARKETPLACE, EBAY_MARKETPLACE_CURRENCY, SEALED_EXCLUDE_EBAY, sealedExclusionText } from "../src/lib/ebay";

// 2026-11-01, owner on the AU Origins Booster Box: "eBay should have a price row
// here, there are tons of Origins boxes on eBay". No market had an eBay row for
// it: the search read the 50 cheapest results and only then applied the floor,
// and titles that spell out "Trading Card Game" were dropped for saying "Card".

test("a box titled with the game's full name is not a card listing", () => {
  for (const t of [
    "Riftbound League of Legends Trading Card Game Origins Booster Box Sealed",
    "Riftbound Origins Booster Display - League of Legends Card Game - New",
  ]) {
    assert.equal(SEALED_EXCLUDE_EBAY.test(sealedExclusionText(t)), false, t);
  }
});

test("single and code cards are still excluded", () => {
  for (const t of [
    "Riftbound Origins Booster Box Jinx Overnumbered Card 299/298",
    "Riftbound Trading Card Game Origins Booster Box code card",
    "Riftbound Origins Booster Box single card Ahri",
    "Riftbound Origins Booster Box Chinese Trading Card Game",
    "Riftbound Origins Booster Box EMPTY box only",
  ]) {
    assert.equal(SEALED_EXCLUDE_EBAY.test(sealedExclusionText(t)), true, t);
  }
});

test("every sealed marketplace has a currency for the price floor filter", () => {
  for (const mp of Object.values(EBAY_MARKETPLACE)) assert.ok(EBAY_MARKETPLACE_CURRENCY[mp], mp);
});

test("searchEbaySealed asks eBay for listings at or above the floor", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/ebay.ts"), "utf8");
  const start = src.indexOf("export async function searchEbaySealed");
  const fn = src.slice(start, src.indexOf("const best = pruneCheapOutliers(valid)", start));
  assert.match(fn, /`price:\[\$\{\(floor \/ 100\)\.toFixed\(2\)\}\]`, `priceCurrency:\$\{currency\}`/);
  // The floor is computed before the request, and still post-filters the results.
  assert.ok(fn.indexOf("const floor = sealedFloorCents") < fn.indexOf("new URLSearchParams"));
  assert.match(fn, />= floor\)/);
});
