import test from "node:test";
import assert from "node:assert/strict";
import { listingMatchesCard, queryNumberToken, type EbayCardIdentity } from "../src/lib/ebay";

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

// ─────────────────────────────────────────────────────────────────────────────
// The SEARCH, not the filter — the second half of the same bug.
// ─────────────────────────────────────────────────────────────────────────────
// Fixing the identity filter above was necessary and NOT sufficient: eBay's
// Browse API ANDs every keyword in `q`, and the query was built by stripping the
// collector number to its digits. For "SP3" that asked eBay for the token "3",
// which no listing titled "… Crystal Rose SP3/006 …" contains — so the search
// returned zero items and the filter never saw a candidate to accept. The cards
// stayed unpriced after the filter fix shipped, which is how this was found.

test("a prefixed collector number keeps its prefix in the eBay query", () => {
  // "SP3", not "3" — the token a seller actually types.
  assert.equal(queryNumberToken("SP3"), "SP3");
  assert.equal(queryNumberToken("R01A"), "R01A", "the rune cycle had the same bug, asking for '01'");
  assert.equal(queryNumberToken("NN1"), "NN1");
  assert.equal(queryNumberToken("WB25"), "WB25");
});

test("an unprefixed collector number keeps its existing digits-only query", () => {
  // Unchanged behaviour, pinned: "042/166" tokenises to "042", so digits already
  // find these and widening them would only add noise.
  assert.equal(queryNumberToken("042"), "042");
  assert.equal(queryNumberToken("069B"), "069", "trailing-letter variants stay permissive; the filter disambiguates");
  assert.equal(queryNumberToken("310"), "310");
});

test("the query token is case-normalised but never empty for a real number", () => {
  assert.equal(queryNumberToken("sp3"), "SP3");
  assert.equal(queryNumberToken(" SP3 "), "SP3", "whitespace from a split() must not leak into the query");
});

// ─────────────────────────────────────────────────────────────────────────────
// The THIRD bug on the same cards: sellers who name the treatment, not the number.
// ─────────────────────────────────────────────────────────────────────────────
// Even with the number parsed and the query fixed, a listing titled
// "Ahri, Inquisitive - Crystal Rose - Riftbound Vendetta" matched nothing: it
// carries no SP number, and only SIGNATURE prints had a name-based fallback.
// Crystal Rose is the same shape of exception — six cards, one per name.
//
// The safety argument had to be checked rather than assumed, because EVERY one of
// the six names is REUSED across printings. Verified against the live catalogue:
//   Ahri, Inquisitive → OGN 119, OGN 119a, SFD 227, SFD 227*, VEN SP3
//   Kai'Sa, Survivor  → OGN 039, OGN 039a, VEN SP1
//   Sona, Harmonious  → OGN 073, VEN SP2
//   Sett, Brawler     → OGN 164, OGN 164a, SFD 232, SFD 232*, VEN SP4
//   Ezreal, Prodigy   → SFD 149, SFD 149a, VEN SP5
//   Lux, Crownguard   → OGS 014, VEN SP6
// Only ONE printing per name is Crystal Rose, and the "crystal rose" marker is
// what separates them — which is exactly what these tests pin.

/** Every real printing of the six Crystal Rose names, for collision testing. */
const UNIVERSE: Record<string, EbayCardIdentity> = {
  ahriBase: { name: "Ahri, Inquisitive", setCode: "OGN", number: "119", total: "298", isSignature: false },
  ahriAlt: { name: "Ahri, Inquisitive", setCode: "OGN", number: "119a", total: "298", isSignature: false },
  ahriOver: { name: "Ahri, Inquisitive", setCode: "SFD", number: "227", total: "221", isSignature: false },
  ahriSig: { name: "Ahri, Inquisitive", setCode: "SFD", number: "227", total: "221", isSignature: true },
  ahriCR: { name: "Ahri, Inquisitive", setCode: "VEN", number: "SP3", total: "006", isSignature: false },
  kaisaBase: { name: "Kai'Sa, Survivor", setCode: "OGN", number: "039", total: "298", isSignature: false },
  kaisaCR: { name: "Kai'Sa, Survivor", setCode: "VEN", number: "SP1", total: "006", isSignature: false },
  sonaBase: { name: "Sona, Harmonious", setCode: "OGN", number: "073", total: "298", isSignature: false },
  sonaCR: { name: "Sona, Harmonious", setCode: "VEN", number: "SP2", total: "006", isSignature: false },
  settBase: { name: "Sett, Brawler", setCode: "OGN", number: "164", total: "298", isSignature: false },
  settSig: { name: "Sett, Brawler", setCode: "SFD", number: "232", total: "221", isSignature: true },
  settCR: { name: "Sett, Brawler", setCode: "VEN", number: "SP4", total: "006", isSignature: false },
  ezrealBase: { name: "Ezreal, Prodigy", setCode: "SFD", number: "149", total: "221", isSignature: false },
  ezrealCR: { name: "Ezreal, Prodigy", setCode: "VEN", number: "SP5", total: "006", isSignature: false },
  luxBase: { name: "Lux, Crownguard", setCode: "OGS", number: "014", total: "024", isSignature: false },
  luxCR: { name: "Lux, Crownguard", setCode: "VEN", number: "SP6", total: "006", isSignature: false },
};

/** Which printings in UNIVERSE a listing matches. Exactly one is the goal. */
const resolve = (title: string): string[] =>
  Object.entries(UNIVERSE)
    .filter(([, c]) => listingMatchesCard(item(title), c))
    .map(([k]) => k);

test("every Crystal Rose card resolves from a numberless, treatment-named listing", () => {
  // The shape that matched nothing before this fix — checked for ALL SIX, not
  // just the one that was reported, and against the full competing-printing set.
  const cases: [string, string][] = [
    ["ahriCR", "Ahri, Inquisitive - Crystal Rose - Riftbound Vendetta NM"],
    ["kaisaCR", "Riftbound League of Legends Kai'Sa, Survivor Crystal Rose Alt Art"],
    ["sonaCR", "RIFTBOUND VENDETTA SONA, HARMONIOUS CRYSTAL ROSE"],
    ["settCR", "Riftbound Vendetta Crystal Rose Sett, Brawler"],
    ["ezrealCR", "Ezreal, Prodigy Crystal Rose Riftbound Vendetta"],
    ["luxCR", "Riftbound Lux, Crownguard crystal-rose VEN"],
  ];
  for (const [expected, title] of cases) {
    assert.deepEqual(resolve(title), [expected], `"${title}" must resolve to exactly ${expected}`);
  }
});

test("a numbered Crystal Rose listing still resolves, including separator variants", () => {
  for (const title of [
    "Riftbound Sona, Harmonious SP2/006 Crystal Rose Foil NM",
    "Riftbound Vendetta Crystal Rose Sona, Harmonious SP-2/006",
    "Riftbound Vendetta Crystal Rose Sona, Harmonious SP 2",
  ]) {
    assert.deepEqual(resolve(title), ["sonaCR"], `"${title}" must resolve to exactly sonaCR`);
  }
});

test("a non-Crystal-Rose listing never reaches the Crystal Rose printing", () => {
  // The collision that makes this fix dangerous if done carelessly: these names
  // each have several other printings, and a listing for one of them must keep
  // going to that one.
  const cases: [string, string][] = [
    ["ahriBase", "Riftbound Ahri, Inquisitive OGN 119/298 NM"],
    ["ahriAlt", "Riftbound Ahri, Inquisitive OGN 119a/298 Alt Art"],
    ["ahriOver", "Riftbound Ahri, Inquisitive SFD 227/221 Overnumbered"],
    ["ahriSig", "Riftbound Ahri, Inquisitive Signature"],
    ["sonaBase", "Riftbound Sona, Harmonious OGN 073/298"],
    ["settSig", "Riftbound Sett, Brawler Signature"],
    ["luxBase", "Riftbound Lux, Crownguard OGS 014/024"],
  ];
  for (const [expected, title] of cases) {
    assert.deepEqual(resolve(title), [expected], `"${title}" must resolve to exactly ${expected}`);
  }
});

test("the Crystal Rose marker cannot pull in merchandise, sets, bundles or foreign printings", () => {
  // A real Crystal Rose Sona PLAYMAT exists (it was an event promo), which is why
  // this is a live hazard and not a hypothetical one.
  for (const title of [
    "Riftbound Crystal Rose Sona, Harmonious PLAYMAT",
    "Riftbound Vendetta Crystal Rose complete set of 6 SP1-SP6",
    "Riftbound Crystal Rose Ahri Inquisitive 中文",
    "Riftbound Crystal Rose bundle 3 cards Ahri Sona Lux",
  ]) {
    assert.deepEqual(resolve(title), [], `"${title}" must match nothing`);
  }
});

test("a Crystal Rose listing never cross-matches a DIFFERENT Crystal Rose card", () => {
  // Six cards share the treatment; only the name separates them.
  assert.deepEqual(resolve("Riftbound Vendetta Crystal Rose Sona, Harmonious"), ["sonaCR"]);
  assert.deepEqual(resolve("Riftbound Vendetta Crystal Rose Lux, Crownguard"), ["luxCR"]);
});
