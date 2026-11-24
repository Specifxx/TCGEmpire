import test from "node:test";
import assert from "node:assert/strict";
import { classifySealed, sealedSetCode } from "../src/lib/sealed-import";
import { SETS } from "../src/lib/constants";
import { autoPreorderState, RELEASES } from "../src/lib/release-calendar";
import { RECKONING_FAQ, RECKONING_LEGENDS_CONFIRMED, RECKONING_LEGENDS_TOTAL } from "../src/lib/sets/reckoning";

// The Reckoning set-up (2026-11-24): real store titles from the 24 Nov export.
test("Reckoning Champion Decks group by champion, never by a shipping note", () => {
  const cases: [string, string][] = [
    ["Riftbound League of Legends The Reckoning Shyvana Champion Deck (Ships April 2027)", "Champion Deck (Shyvana)"],
    ["Riftbound: League of Legends - The Reckoning Champion Deck Shyvana (Pre-Order)", "Champion Deck (Shyvana)"],
    ["Riftbound League of Legends - The Reckoning - Champion Deck - Vayne", "Champion Deck (Vayne)"],
    ["Riftbound League of Legends TCG the Reckoning Champion Deck Shyvana 4CT Display", "Champion Deck (Shyvana) Display"],
    ["Riftbound Origins Champion Deck (Viktor)", "Champion Deck (Viktor)"],
  ];
  for (const [title, type] of cases) {
    assert.equal(classifySealed(title), type, title);
  }
  assert.equal(sealedSetCode("Riftbound Champion Deck - Vayne", classifySealed("Riftbound Champion Deck - Vayne")), "REC");
  // A pre-order note in the bracket names no deck: it is the plain group, never "Champion Deck (Pre Order)".
  assert.equal(classifySealed("Riftbound League Of Legends TCG Legacy Champion Deck (Pre Order)"), "Champion Deck");
});

test("REC is hubReady with Riot's sourced facts, and its auto pre-order page stays a page", () => {
  const rec = SETS.find((s) => s.code === "REC");
  assert.ok(rec?.comingSoon && rec.hubReady && rec.releasedOn === "2027-04-30" && rec.announcedCards === 264);
  assert.equal(rec!.totalCards, undefined, "no printed denominator until a card surfaces");
  const row = RELEASES.find((r) => r.code === "REC");
  assert.equal(row?.preordersHref, undefined, "a preordersHref would 308 /preorders/the-reckoning to itself");
  assert.equal(autoPreorderState("the-reckoning", new Date("2026-11-24T00:00:00Z")).kind, "page");
  assert.equal(RECKONING_LEGENDS_CONFIRMED.length, 5);
  assert.equal(RECKONING_LEGENDS_TOTAL, 9);
  assert.ok(RECKONING_FAQ.every((f) => f.a.length < 260), "FAQ answers stay short");
});
