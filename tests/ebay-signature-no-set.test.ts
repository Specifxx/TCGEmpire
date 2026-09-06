import test from "node:test";
import assert from "node:assert/strict";
import { listingMatchesCard, type EbayCardIdentity } from "../src/lib/ebay";

// ─────────────────────────────────────────────────────────────────────────────
// Signature listings that never mention the set — a second, distinct bug from
// the letter-prefix one in ebay-prefixed-numbers.test.ts. Same symptom, but the
// number in these cards is a plain digit string; nothing about it is prefixed.
// ─────────────────────────────────────────────────────────────────────────────
// Reported live: Soraka, Wanderer (SFD 239*/221), Sett, The Boss (OGN 310*/298),
// Master Yi, Wuju Master (UNL 231*/219) and Ivern, Green Father (UNL 233*/219)
// all showed "No price yet" in AU/NZ/UK/SG despite real eBay AU listings for
// every one of them — confirmed by searching eBay directly. So did Akali, Rogue
// Assassin, the exact card a code comment already cited as a fixed precedent.
//
// Root cause: the signature-only identity fallback required THREE things —
// titleIsSignature, setMentioned(title, setCode) AND nameMatches — and
// setMentioned demanded the listing literally contain the set code ("SFD") or
// its full name ("Spiritforged"). Real chase-card listings very often don't:
// sellers title a $500+ signature just "Riftbound Soraka, Wanderer Signature".
// That satisfies titleIsSignature and nameMatches easily, and was rejected by
// setMentioned alone — the exact listings this fallback exists to catch.
//
// Safe to drop: verified against the live catalogue that no two signature
// prints share a name (36 signature cards, zero collisions) — it's a
// one-per-champion treatment, not a per-set one, so name + "signature" alone is
// already an unambiguous identity without also requiring the set.

const item = (title: string, priceCents = "50000") => ({ title, price: { value: priceCents, currency: "AUD" } });

const SORAKA: EbayCardIdentity = { name: "Soraka, Wanderer", setCode: "SFD", number: "239", total: "221", isSignature: true };
const SETT_BOSS: EbayCardIdentity = { name: "Sett, The Boss", setCode: "OGN", number: "310", total: "298", isSignature: true };
const SETT_BRAWLER: EbayCardIdentity = { name: "Sett, Brawler", setCode: "SFD", number: "232", total: "221", isSignature: true };
const MASTER_YI: EbayCardIdentity = { name: "Master Yi, Wuju Master", setCode: "UNL", number: "231", total: "219", isSignature: true };
const IVERN: EbayCardIdentity = { name: "Ivern, Green Father", setCode: "UNL", number: "233", total: "219", isSignature: true };
const AKALI: EbayCardIdentity = { name: "Akali, Rogue Assassin", setCode: "VEN", number: "189", total: "166", isSignature: true };

test("a signature listing with no set code, no number now matches", () => {
  // The exact seller-title shape that was silently rejected — name + "Signature",
  // nothing else identifying.
  for (const [card, title] of [
    [SORAKA, "Riftbound Soraka, Wanderer Signature"],
    [SETT_BOSS, "Riftbound Sett, The Boss Signature"],
    [MASTER_YI, "Riftbound Master Yi, Wuju Master Signature"],
    [IVERN, "Riftbound Ivern, Green Father Signature"],
    [AKALI, "Riftbound Akali Rogue Assassin Signature"],
  ] as const) {
    assert.ok(listingMatchesCard(item(title), card), `should match: ${title}`);
  }
});

test("still matches when the set IS mentioned (unchanged, stronger case)", () => {
  assert.ok(listingMatchesCard(item("Riftbound Soraka, Wanderer Signature SFD Foil"), SORAKA));
  assert.ok(listingMatchesCard(item("Riftbound: SFD Soraka, Wanderer Signature NM"), SORAKA));
});

test("still matches on the full number when a seller does include it", () => {
  assert.ok(listingMatchesCard(item("Soraka, Wanderer SFD 239*/221 Signature Foil"), SORAKA));
});

test("a different champion's signature never matches", () => {
  assert.ok(!listingMatchesCard(item("Riftbound Ivern, Green Father Signature"), SORAKA));
  assert.ok(!listingMatchesCard(item("Riftbound Akali Rogue Assassin Signature"), MASTER_YI));
});

test("the SAME champion's differently-titled signature print never cross-matches", () => {
  // Sett has two distinct Signature cards across two sets — "The Boss" (OGN) and
  // "Brawler" (SFD). Losing the set-code requirement must not blur them together;
  // nameMatches' title-token check ("boss" vs "brawler") is what keeps them apart.
  assert.ok(!listingMatchesCard(item("Riftbound Sett, Brawler Signature SFD"), SETT_BOSS));
  assert.ok(!listingMatchesCard(item("Riftbound Sett, The Boss Signature OGN"), SETT_BRAWLER));
});

test("a non-signature listing of the same card still never matches a signature request", () => {
  // Guards that dropping setMentioned didn't also loosen the independent
  // signature-flag stage that runs right after this one. Title deliberately
  // contains no form of the word "signature" — that word alone is enough to
  // satisfy titleIsSignature(), so a title merely NOTING the absence would
  // accidentally trigger the very flag this test means to keep unset.
  assert.ok(!listingMatchesCard(item("Riftbound Sett, The Boss OGN 310/298 NM overnumbered"), SETT_BOSS));
});

test("base (non-signature) cards still require the real collector number — untouched", () => {
  const base: EbayCardIdentity = { name: "Jinx, Loose Cannon", setCode: "VEN", number: "042", total: "166", isSignature: false };
  assert.ok(!listingMatchesCard(item("Riftbound Jinx, Loose Cannon"), base), "a base card must still need its number, no free pass");
  assert.ok(listingMatchesCard(item("Riftbound Jinx, Loose Cannon VEN 042/166"), base));
});
