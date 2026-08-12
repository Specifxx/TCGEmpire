import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifySealed } from "../src/lib/sealed-import";

// ─────────────────────────────────────────────────────────────────────────────
// The /sealed grid showed a picture of two decks on the Vendetta BOOSTER BOX
// tile, and broken images on three others. Both had a single cause each, and
// both are reachable without a database:
//
//   1. classifySealed() ended with a bare `\bdisplay\b` catch-all typed as
//      "Booster Box". "Vendetta - Showdown Decks: Zed vs Shen Display" matched
//      it, so it shared groupKey VEN|Booster Box with the real booster display
//      and won the canonical image (first tcgplayer row per groupKey wins).
//
//   2. tcgImageUrl() builds a CDN URL from a product id whether or not
//      TCGplayer has a photo. The non-null-but-403 URL then beat the on-brand
//      fallback graphic, rendering a broken tile.
//
// Titles below are the REAL productName strings from the TCGplayer catalogue
// (mp-search-api, productLine riftbound-league-of-legends-trading-card-game).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a display of DECKS is not a booster box", () => {
  assert.equal(
    classifySealed("Vendetta - Showdown Decks: Zed vs Shen Display"),
    "Showdown Decks Display",
    "this is what put a deck photo on the Vendetta booster-box tile",
  );
  assert.equal(classifySealed("Vendetta - Showdown Decks: Zed vs Shen"), "Showdown Decks");
});

test("the real booster displays still classify as Booster Box", () => {
  for (const title of [
    "Vendetta - Booster Display",
    "Origins - Booster Display",
    "Unleashed - Booster Display",
    "Spiritforged - Booster Display",
  ]) {
    assert.equal(classifySealed(title), "Booster Box", title);
  }
});

test("Showdown Decks cannot collide with the booster box group again", () => {
  // The bug was a groupKey collision, so assert on the key the importer builds.
  const key = (t: string) => `VEN|${classifySealed(t)}`;
  assert.notEqual(
    key("Vendetta - Showdown Decks: Zed vs Shen Display"),
    key("Vendetta - Booster Display"),
    "distinct products must not share a groupKey",
  );
});

test("every other display-suffixed product keeps its own type", () => {
  assert.equal(classifySealed("Unleashed - Champion Deck (Vex) Display"), "Champion Deck (Vex) Display");
  assert.equal(classifySealed("Origins - Champion Deck (Jinx) Display"), "Champion Deck (Jinx) Display");
  assert.equal(classifySealed("Vendetta - Booster Display Case"), "Booster Case");
});

test("the audited products classify to the types their tiles use", () => {
  assert.equal(classifySealed("Origins - Proving Grounds Box Set Case"), "Proving Grounds Case");
  assert.equal(classifySealed("Unleashed - Nexus Night Promo Pack"), "Nexus Night Pack");
  assert.equal(classifySealed("Riftbound: Bulk Runes Case"), "Bulk Runes Case");
  assert.equal(classifySealed("Riftbound: Bulk Runes"), "Bulk Runes");
});

test("the new types have a type-correct fallback graphic", () => {
  const src = read("src/lib/sealed-import.ts");
  // A type with no entry silently falls through to sealed-generic.png.
  assert.match(src, /"Showdown Decks": "\/sealed\/sealed-deck\.png"/);
  assert.match(src, /"Showdown Decks Display": "\/sealed\/sealed-box\.png"/);
});

test("TCGplayer image URLs are verified before being stored", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /export async function imageExists/, "needs a real existence probe");
  assert.match(src, /method: "HEAD"/, "a HEAD is enough and costs no bandwidth");
  assert.match(src, /startsWith\("image\/"\)/, "a 200 serving XML is still not an image");
  // The fabricated URL must no longer be written straight to the row.
  assert.ok(
    !/imageUrl: tcgImageUrl\(p\.productId\)/.test(src),
    "imageUrl must come from the verified map, not tcgImageUrl() directly",
  );
  assert.match(src, /imageUrl: imageUrls\.get\(p\.productId\) \?\? null/);
});

test("a missing image falls back rather than shipping a broken tile", () => {
  const src = read("src/lib/sealed-import.ts");
  // getSealedGroups only reaches sealedTypeImage() when imageUrl is null, which
  // is exactly what the verification above now produces for image-less products.
  assert.match(src, /g\.imageUrl = sealedTypeImage\(g\.productType\)/);
});
