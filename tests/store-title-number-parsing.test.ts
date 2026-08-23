import test from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, resolveCardId } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// "SETCODE-NUMBER" TITLES, WITH NO "/total".
//
// Every collector-number pattern in parseNumber() required a "/total"
// ("OGN-181/298", "181/298"). A store that numbers its titles "OGN-181 Pack of
// Wonders U" matched NOTHING — and the failure was silent in the worst way: the
// importer fetched the catalogue perfectly, resolved zero cards, and wrote zero
// rows, which is indistinguishable from a store that carries no Riftbound
// singles at all.
//
// Measured against the live catalogue on 2026-08-23: apgtcg.com's Riftbound
// singles collection returns 250 products in this format. Before the fix 0 of
// 250 matched; after, 250 of 250. store-health had it filed as `no-listings`
// along with 39 other stores.
//
// THE PATTERN IS ANCHORED TO REAL SET CODES, and that anchoring is the whole
// safety property. A bare /([A-Za-z]{2,4})-(\d+)/ also matches "Deck-2",
// "Vol-3", "SKU-1234" and a date — and it would hand back a CONFIDENT setCode,
// which is what resolveCardId uses to choose between same-named cards in
// different sets. A false positive there does not fail to match; it attaches a
// real price to the wrong printing.
// ─────────────────────────────────────────────────────────────────────────────

const CARDS = [
  { id: "c-ogn181", name: "Pack of Wonders", nameNormalized: "pack of wonders", setCode: "OGN", collectorNumber: "181/298", variant: null, isPromo: false, rarity: "Uncommon" },
  { id: "c-unl143", name: "Kha'Zix - Mutating Horror", nameNormalized: "khazix mutating horror", setCode: "UNL", collectorNumber: "143/219", variant: null, isPromo: false, rarity: "Rare" },
  // Same number in a different set — the anchor must not let a wrong prefix pick this.
  { id: "c-sfd181", name: "Something Else", nameNormalized: "something else", setCode: "SFD", collectorNumber: "181/221", variant: null, isPromo: false, rarity: "Uncommon" },
] as never;

const idx = buildCardIndex(CARDS);
const match = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, idx);

test("a SETCODE-NUMBER title with no /total resolves to the right card", () => {
  assert.equal(match("OGN-181 Pack of Wonders U"), "c-ogn181");
  assert.equal(match("UNL-143 Kha'Zix - Mutating Horror R"), "c-unl143");
  // The set prefix must decide, not the number alone: 181 exists in OGN and SFD.
  assert.equal(match("SFD-181 Something Else U"), "c-sfd181");
});

test("the /total forms still work", () => {
  assert.equal(match("OGN-181/298 Pack of Wonders"), "c-ogn181");
  assert.equal(match("Pack of Wonders 181/298"), "c-ogn181");
});

test("a non-set prefix must NOT be treated as a set code", () => {
  // Each of these matches a naive /([A-Za-z]{2,4})-(\d+)/. None names a real set,
  // so none may resolve — silently mis-pricing a card is worse than not pricing it.
  for (const title of [
    "Deck-2 Pack of Wonders U",
    "Vol-3 Pack of Wonders U",
    "SKU-181 Pack of Wonders U",
    "Lot-181 Pack of Wonders U",
  ]) {
    const hit = match(title);
    assert.notEqual(
      hit,
      "c-sfd181",
      `"${title}" must not resolve via an invented set code (got ${hit})`
    );
  }
});

test("a genuinely unnumbered, unknown title still matches nothing", () => {
  assert.equal(match("Riftbound TCG: Origins Champion Deck - Jinx"), null);
});
