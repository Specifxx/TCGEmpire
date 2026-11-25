import test from "node:test";
import assert from "node:assert/strict";
import { isInStoreOnlyTitle } from "../src/lib/sealed-import";

// US sweep 2026-11-25: Sparks Trading Cards lists "Riftbound: Radiance - Booster Box (In-Store Only)".
test("in-store-only sealed titles are recognised", () => {
  assert.equal(isInStoreOnlyTitle("Riftbound: Radiance - Booster Box (In-Store Only)"), true);
  assert.equal(isInStoreOnlyTitle("Riftbound: Origins - Booster Box (In-Store Only)"), true);
  assert.equal(isInStoreOnlyTitle("Riftbound Vendetta Booster Box - In Store Pickup Only"), true);
  assert.equal(isInStoreOnlyTitle("Riftbound Unleashed Booster Display - Local Pickup Only"), true);
});

test("ordinary sealed titles are not", () => {
  assert.equal(isInStoreOnlyTitle("RIFTBOUND RADIANCE BOOSTER BOX *LIMIT 6 PER CUSTOMER*"), false);
  assert.equal(isInStoreOnlyTitle("Riftbound: Vendetta - Showdown Decks: Zed vs Shen"), false);
  assert.equal(isInStoreOnlyTitle("Riftbound Radiance Booster Display - Store Exclusive Promo"), false);
});
