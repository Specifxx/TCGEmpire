import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECK_LINE_CAP, FREE_BULK_LINES, parseDeckList, priceableLines } from "../src/lib/deck";
import { featureForSurface } from "../src/lib/upgrade-intent";
import { LIMIT_SURFACES } from "../src/lib/premium-surface";

// Bulk pricing past a deck is Premium's (2026-10-25, DECISIONS.md "Best Basket
// and bulk pricing lead Premium"). /deck stays a free deck pricer; a longer
// list is priced to FREE_BULK_LINES below Premium.
const read = (p: string) => readFileSync(p, "utf8");

test("a full deck fits the free size, a binder does not", () => {
  assert.ok(FREE_BULK_LINES >= 56, "main deck + runes + battlefields + sideboard, one line per card at worst");
  assert.ok(FREE_BULK_LINES < DECK_LINE_CAP);
});

test("section headers are not counted as lines", () => {
  const lines = priceableLines(parseDeckList("Main Deck:\n3 Jinx, Loose Cannon\nRunes:\n6 Fury Rune", { plainNames: true }));
  assert.equal(lines.length, 2);
});

test("the route caps a list past the free size unless the session is Pro", () => {
  const route = read("src/app/api/deck/price/route.ts");
  assert.match(route, /parsed\.length > FREE_BULK_LINES \? isPremium\(await getCurrentUser\(\), "premium"\) : true/, "a deck never reads the session");
  assert.match(route, /parsed\.slice\(0, FREE_BULK_LINES\)/);
  assert.match(route, /bulkLimit: \{ limit: FREE_BULK_LINES/);
});

test("/deck offers the upgrade where it stopped", () => {
  const ui = read("src/components/DeckBuilder.tsx");
  assert.match(ui, /setBulkLimit\(data\.bulkLimit \?\? null\)/);
  assert.match(ui, /<PremiumButton surface="limit:bulk" \/>/);
  assert.ok((LIMIT_SURFACES as readonly string[]).includes("limit:bulk"));
  assert.equal(featureForSurface("limit:bulk"), "bulk_pricer");
});
