import test from "node:test";
import assert from "node:assert/strict";
import { listingMatchesCard, type EbayCardIdentity } from "../src/lib/ebay";

// ─────────────────────────────────────────────────────────────────────────────
// Letter-PREFIXED collector numbers — Crystal Rose ("SP1".."SP6"), the rune
// cycle ("R01A".."R06B"), Nexus Night promos ("NN1"), the Panda Teemo promo
// ("WB25") — never matched a real eBay listing, however it was worded.
// ─────────────────────────────────────────────────────────────────────────────
// Reported live: Ahri, Inquisitive (VEN SP3/006) showed "No price yet" in every
// AU/NZ/UK/SG market despite real, plentiful eBay AU listings for it (and the
// other five Crystal Rose cards) — confirmed by searching eBay directly. US and
// CA had a price because those come through TCGplayer / a real local store,
// which match by structured data, not this text search.
//
// Root cause: numberMatches() stripped every letter out of the collector number
// (`number.replace(/[^0-9]/g, "")`) to get its digits, then separately grabbed
// "the first letter anywhere in the number" as if it were a trailing variant
// suffix (`number.match(/[a-z]/i)`). For "SP3" that grabbed the LEADING "S", and
// the match regex required a word boundary directly before the digit
// (`\b0*3`) — which "SP3" can never satisfy, because "P" and "3" are both word
// characters and \b only fires at a word/non-word transition. No listing title,
// however worded, could ever satisfy that regex.

const item = (title: string) => ({ title, price: { value: "45.00", currency: "AUD" } });

const CRYSTAL_ROSE: EbayCardIdentity = {
  name: "Ahri, Inquisitive",
  setCode: "VEN",
  number: "SP3",
  total: "006",
  isSignature: false,
};

test("a real Crystal Rose eBay listing now matches", () => {
  // Titles in the shape sellers actually use.
  for (const title of [
    "Riftbound Ahri Inquisitive SP3/006 Crystal Rose Foil NM",
    "Ahri, Inquisitive - Crystal Rose SP3/006 - Riftbound Vendetta",
    "VEN Ahri Inquisitive SP3/006 Crystal Rose Alt Art",
  ]) {
    assert.ok(listingMatchesCard(item(title), CRYSTAL_ROSE), `should match: ${title}`);
  }
});

test("Crystal Rose still rejects the WRONG card in the series", () => {
  // Sona is SP2, not SP3 — must not cross-match just because both are Crystal Rose.
  assert.ok(
    !listingMatchesCard(item("Riftbound Sona Harmonious SP2/006 Crystal Rose Foil"), CRYSTAL_ROSE),
    "SP2 must not match a card asking for SP3",
  );
});

test("Crystal Rose still rejects an unrelated card that happens to contain '3'", () => {
  // Before the fix, a bare "3" token inside the number could in principle drift
  // onto a base-set card numbered 3 if the regex were loosened carelessly.
  assert.ok(
    !listingMatchesCard(item("Riftbound Origins Defy 003/298 NM"), CRYSTAL_ROSE),
    "an unrelated Origins card numbered 3 must not match a Crystal Rose SP3 request",
  );
});

test("the rune cycle (letter prefix + trailing letter) matches correctly", () => {
  const rune: EbayCardIdentity = { name: "Fury Rune", setCode: "SFD", number: "R01A", total: "", isSignature: false };
  assert.ok(listingMatchesCard(item("Riftbound Spiritforged Fury Rune R01A"), rune));
  // The other half of the same pair (R01B) must not cross-match R01A.
  assert.ok(!listingMatchesCard(item("Riftbound Spiritforged Fury Rune R01B"), rune));
});

test("plain trailing-letter variants (no prefix) are unaffected by the fix", () => {
  // This is the case the function already handled correctly — pinned so the
  // prefix-parsing rewrite provably didn't regress it.
  const overnumbered: EbayCardIdentity = { name: "Mel, Newly Awakened", setCode: "VEN", number: "069B", total: "166", isSignature: false };
  assert.ok(listingMatchesCard(item("Riftbound Mel Newly Awakened 069B/166 Overnumbered"), overnumbered));
  assert.ok(!listingMatchesCard(item("Riftbound Mel Newly Awakened 069/166"), overnumbered), "base 069 must not match the 069B overnumbered ask");
});

test("plain unlettered numbers are unaffected by the fix", () => {
  const base: EbayCardIdentity = { name: "Jinx, Loose Cannon", setCode: "VEN", number: "042", total: "166", isSignature: false };
  assert.ok(listingMatchesCard(item("Riftbound Jinx Loose Cannon VEN 042/166"), base));
  assert.ok(!listingMatchesCard(item("Riftbound Jinx Loose Cannon VEN 099/166"), base));
});
