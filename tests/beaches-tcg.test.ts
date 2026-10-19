import test from "node:test";
import assert from "node:assert/strict";
import { classifySealed, collectionKind, isTrackableSealedTitle } from "../src/lib/sealed-import";
import { RETAILERS } from "../src/lib/retailers";
import { SEALED_ONLY_SHOPIFY } from "../src/lib/sealed-stores";
import { offerCurrencyOk } from "../src/lib/offer-currency";

// ─────────────────────────────────────────────────────────────────────────────
// BeachesTCG (beachestcg.com.au, Mona Vale NSW), added sealed only at the
// owner's request, 2026-10-19. DECISIONS.md, "BeachesTCG added, sealed only,
// in Australia". Every title below is the store's own, read from its
// riftbound-tcg collection that day.
// ─────────────────────────────────────────────────────────────────────────────

test("BeachesTCG is a sealed-only AU store, never read by the singles importer", () => {
  const s = SEALED_ONLY_SHOPIFY.find((x) => x.key === "beachestcg");
  assert.ok(s, "registered in lib/sealed-stores.ts");
  assert.equal(s.base, "https://beachestcg.com.au");
  assert.equal(s.country, "AU");
  assert.equal(s.currency, "AUD", "its storefront and /meta.json say AUD");
  assert.deepEqual(s.collections, ["riftbound-tcg"]);
  assert.ok(!RETAILERS.beachestcg, "it has no singles: in RETAILERS it would read as a broken store");
  assert.equal(offerCurrencyOk("beachestcg", "AU"), true);
  assert.equal(offerCurrencyOk("beachestcg", "US"), false);
});

test("of BeachesTCG's collections, only the Riftbound one is read", () => {
  assert.equal(collectionKind("riftbound-tcg"), "riftbound");
  // The rest of its collection sitemap: other games, events, accessories, sales, images.
  for (const h of ["events", "latest-items", "ongoing-sales", "one-piece", "pokemon-tcg", "magic-the-gathering", "more-tcgs", "sleeves", "playmats", "Riftbound_2.jpg"]) {
    assert.equal(collectionKind(h), null, h);
  }
});

test("BeachesTCG's boxes and pack are tracked as the products they are", () => {
  const kept: [string, string][] = [
    ["Riftbound – Booster Display – Unleashed", "Booster Box"],
    ["Riftbound – Booster Display – Spiritforged", "Booster Box"],
    ["Riftbound SpiritForged booster pack", "Booster Pack"],
    ["Riftbound Vendetta booster box pre order", "Booster Box"],
  ];
  for (const [title, type] of kept) {
    assert.ok(isTrackableSealedTitle(title), title);
    assert.equal(classifySealed(title), type, title);
  }
});

test("BeachesTCG's event tickets never become offers", () => {
  for (const t of [
    "VENDETTA Riftbound Pre-Rift 25th July @ 10am", // a seat: names a clock time
    "Riftbound 1v1 Nexus Nights", // a weekly event, not a Nexus Night pack
    "Riftbound Radience pre release", // the store's spelling; no sealed product word
  ]) {
    assert.ok(!isTrackableSealedTitle(t), t);
  }
});
