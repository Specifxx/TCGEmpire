import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCardIndex, resolveCardId, OTHER_TCG_HANDLE, type CardLite } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// Store title → card resolution, and the rune bug in particular.
// ─────────────────────────────────────────────────────────────────────────────
// Every Riftbound set prints the same six basic runes three times over: a base
// print ("R02"), an alt-art ("R02a") and a second special print ("R02b"). All
// three are called "Calm Rune", and — unlike every other card in the game — their
// collector number carries no "/total".
//
// resolveCardId's number-disambiguation guard only runs when parseNumber() found
// a number, and parseNumber() only understood the "NNN/NNN" shape. So for runes
// it always returned null, the guard was skipped, and name-only matching
// collapsed all three prints onto the base card. In markets where a store's only
// rune listings were the alt-arts, the base rune inherited the alt-art's price
// outright: base runes worth ~10c were showing $15.00 in AU and $13.70 in NZ, in
// the database and therefore in the pack simulator too.
//
// The titles below are REAL, taken verbatim from the Shopify catalogues the
// importer actually reads.

const card = (
  id: string,
  name: string,
  setCode: string,
  collectorNumber: string,
  rarity: string,
  variant: string | null = null,
  isPromo = false
): CardLite => ({ id, name, setCode, collectorNumber, rarity, variant, isPromo });

// A catalogue shaped like the live one: the rune cycle in three sets (so a
// set-less title is genuinely ambiguous), plus ordinary numbered cards.
const CARDS: CardLite[] = [
  card("unl-r02", "Calm Rune", "UNL", "R02", "Common"),
  card("unl-r02a", "Calm Rune", "UNL", "R02a", "Showcase", "a"),
  card("unl-r02b", "Calm Rune", "UNL", "R02b", "Showcase", "b"),
  card("sfd-r02", "Calm Rune", "SFD", "R02", "Common"),
  card("sfd-r02a", "Calm Rune", "SFD", "R02a", "Showcase", "a"),
  card("ven-r02", "Calm Rune", "VEN", "R02", "Common"),
  // Vendetta's "b" runes are held as PROMOS (they came in via manual-cards.json),
  // which is what made them the accidental magnet for every other set's rune.
  card("ven-r02b", "Calm Rune", "VEN", "R02B", "Common", null, true),
  card("ogn-042", "Calm Rune", "OGN", "042/298", "Common"),
  card("ogn-042a", "Calm Rune", "OGN", "042a/298", "Showcase", "a"),
  card("unl-134", "Existential Dread", "UNL", "134/219", "Rare"),
  card("ogn-134", "Ionian Ambush", "OGN", "134/298", "Rare"),
  card("ven-197s", "Kennen, Heart of the Tempest", "VEN", "197*/166", "Epic"),
];

const idx = buildCardIndex(CARDS);
const resolve = (title: string) => resolveCardId({ title, handle: "", variants: [] } as never, idx);

test("a base rune listing resolves to the base rune", () => {
  assert.equal(resolve("Calm Rune (R02) [Unleashed]"), "unl-r02");
  assert.equal(resolve("Calm Rune - Unleashed (R02)"), "unl-r02");
  assert.equal(resolve("[RFB] Calm Rune (Foil) (R02) - Unleashed"), "unl-r02");
  assert.equal(resolve("Riftbound - Vendetta - R02 Calm Rune Common"), "ven-r02");
});

test("an alt-art rune listing no longer prices the base rune", () => {
  // THE REPORTED BUG. Every one of these used to return "unl-r02" — a ~10c card
  // — and hand it a $9-$15 price.
  assert.equal(resolve("Calm Rune (R02a) [UNL - R02a]"), "unl-r02a");
  assert.equal(resolve("Calm Rune (R02a) (R02a) (Unleashed)"), "unl-r02a");
  assert.equal(resolve("Calm Rune (R02b) (R02b) - Unleashed Foil"), "unl-r02b");
  assert.equal(resolve("Calm Rune (R02b) (R02b) [Unleashed]"), "unl-r02b");
  assert.equal(resolve("Calm Rune Alternate Art R02a (Spiritforged)  - Foil"), "sfd-r02a");
});

test("rune numbers are leading-zero and case normalised", () => {
  // The DB holds Vendetta's manual rows as "R02B" and the automated sets' as
  // "R02b"; store titles use either. All three have to be one key.
  assert.equal(resolve("Calm Rune (r02a) (Unleashed)"), "unl-r02a");
  assert.equal(resolve("Calm Rune (R2a) (Unleashed)"), "unl-r02a");
  assert.equal(resolve("Calm Rune (R02A) (Unleashed)"), "unl-r02a");
});

test("a rune listing that names no set stays unmatched", () => {
  // Three sets print an "R02" Calm Rune. Guessing would mis-price two of them.
  assert.equal(resolve("Calm Rune (R02) - Foil"), null);
  assert.equal(resolve("Calm Rune (R02a) (R02a) Foil"), null);
});

test("a promo rune listing never reaches across sets for its number", () => {
  // "Organized Play" routes to the promo pool, where the only R-numbered promos
  // are Vendetta's. Without a set-unique number these must stay unmatched rather
  // than price VEN's promo off an Unleashed or Spiritforged listing.
  assert.equal(resolve("Riftbound - Unleashed - R02b Calm Rune (R02b) Promo"), null);
  assert.equal(resolve("Calm Rune (R02b) Spiritforged - Riftbound Organized Play Promotional Cards Foil"), null);
  assert.equal(resolve("Calm Rune — Nexus Night — R02b"), null);
  // Vendetta's own promo still resolves — the set is named, so it is not a guess.
  assert.equal(resolve("Calm Rune (R02b) Vendetta - Organized Play Promo Foil"), "ven-r02b");
});

test("ordinary numbered cards are unaffected", () => {
  // The regressions worth guarding against are in the shapes that already worked:
  // "/total" identifies the set, leading zeros normalise, "*" stays separate from
  // its plain sibling, and a name shared across sets without a set hint is
  // refused rather than guessed.
  assert.equal(resolve("Calm Rune (042/298) [Origins]"), "ogn-042");
  assert.equal(resolve("Calm Rune (042a/298) [Origins]"), "ogn-042a");
  assert.equal(resolve("Calm Rune [OGN - 42/298]"), "ogn-042");
  assert.equal(resolve("Existential Dread - 134/219"), "unl-134");
  assert.equal(resolve("Ionian Ambush - 134/298"), "ogn-134");
  assert.equal(resolve("Kennen, Heart of the Tempest (197*/166) Signature"), "ven-197s");
  // A store's ordinary Rare print of a card we only hold as a Signature must not
  // borrow that Signature's page — the number disagrees.
  assert.equal(resolve("Kennen, Heart of the Tempest - 155/166"), null);
  // Multi-card listings carry a group price, never a card's.
  assert.equal(resolve("PLAYSET (3) 3x Calm Rune (R02) [Unleashed]"), null);
});

test("a bare 'R' token cannot be read as a rune number on a normal card", () => {
  // The rune pattern is deliberately narrow: an R, one to three digits, one
  // optional letter. Anything looser starts reading store SKUs as collector
  // numbers, and a wrong number makes resolveCardId reject the listing outright.
  assert.equal(resolve("Existential Dread [Unleashed] R"), null);
  assert.equal(resolve("Existential Dread - 134/219 - Rare"), "unl-134");
});

// ─────────────────────────────────────────────────────────────────────────────
// Foreign-language listings.
// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: "the best price often comes back as some chinese listing
// for a completely different product". Riftbound's Chinese release shares our
// cards' collector numbers, and this matcher had NO language check at all —
// unlike TCGplayer and eBay, which each already learned this the hard way (the
// "Dazzling Aurora bug" and a $40 Kai'Sa Survivor AA, respectively — see
// FOREIGN_LANG's own comment in scrape-http.ts). A store stocking the Chinese
// print under the same collection matched it as the English card's own
// listing, so its price — usually a fraction of the real one — could win as
// "cheapest" for a completely different, English-only card.
test("a Chinese-language listing never resolves to the English card it shares a number with", () => {
  assert.equal(resolve("Existential Dread - 134/219 - 简体中文"), null);
  assert.equal(resolve("Ionian Ambush (Simplified Chinese) 134/298"), null);
  assert.equal(resolve("Kennen, Heart of the Tempest CHS 197*/166"), null);
  // CJK characters alone, no English word needed.
  assert.equal(resolve("寂静的哀伤 - 134/219"), null);
});

test("an ordinary English listing is unaffected by the language check", () => {
  // The regression to guard against: a false positive on a legitimately English
  // title. None of these carry a CJK character or a whole-word region/language
  // code, so the check must never fire on them.
  assert.equal(resolve("Existential Dread - 134/219"), "unl-134");
  assert.equal(resolve("Kennen, Heart of the Tempest (197*/166) Signature"), "ven-197s");
});

// ─────────────────────────────────────────────────────────────────────────────
// Reported 2026-09-10 through the portfolio feedback form: "random listings from
// 'Hobby Collectors Australia' are completely throwing off some card prices in
// portfolio (Thousand-Tailed Watcher, Seal of Focus etc)".
//
// Two defects, stacked. Hobby Collectors files every single it sells, across
// every game, in ONE collection — `all-singles-one-piece-pokemon-riftbound`.
// The handle says "riftbound", so discoverRiftboundCollections took it: 676
// Pokémon and One Piece singles, and (verified live) zero Riftbound ones. Its
// actual Riftbound collections hold only sealed product and accessories, and its
// own `riftbound-league-of-legends-singles` handle is empty.
//
// Then resolveCardId turned those foreign singles into Riftbound prices. 461 of
// the 676 titles carry an "NNN/NNN" collector number. parseNumber() read one,
// setFromTotal() declined the foreign denominator, confidentSetCode came back
// null — and `setCode` fell through to its "OGN" default, so the number-only
// path matched on the NUMERATOR ALONE. Live example, confirmed on the card page:
//
//   "Armarouge 015/091 Scarlet and Violet Paldean Fates Reverse Holo"  A$1.00
//     → Captain Farron, Riftbound OGN 015/298
//
// A$1.00 then beat every real listing, so it became the card's headline price,
// its history point, and its value in every portfolio holding it.
//
// The denominator was never a missing signal to default away — it is positive
// evidence. A real Riftbound single always prints its own set's total.
// ─────────────────────────────────────────────────────────────────────────────

test("a foreign game's collector number never resolves to a Riftbound card", () => {
  // The exact live title that mispriced Captain Farron.
  assert.equal(
    resolve("Armarouge 015/091 Scarlet and Violet Paldean Fates Reverse Holo / Holo Rare"),
    null,
  );
  // The same shape across the other games this store shelves together. Each
  // numerator deliberately matches a card in CARDS above, so only the
  // denominator can be doing the rejecting.
  assert.equal(resolve("Charizard ex 134/165 Pokemon 151 Double Rare"), null);
  assert.equal(resolve("Monkey D. Luffy OP01-042 042/121 One Piece Romance Dawn"), null);
  assert.equal(resolve("Some Card 197/200 Another Game"), null);
});

test("an unknown denominator does not block a NAME match", () => {
  // The guard is aimed at the number paths only. A name is independent evidence
  // — no Pokémon card is called "Existential Dread" — so a Riftbound listing
  // whose denominator is mistyped or belongs to a set we have not learned yet
  // still resolves, provided its number agrees with the card we hold.
  assert.equal(resolve("Existential Dread - Unleashed (134/219)"), "unl-134");
  // …and a name whose number DISAGREES stays unmatched, as it already did.
  assert.equal(resolve("Existential Dread - Unleashed (999/219)"), null);
});

test("an explicit Riftbound set signal overrides an unrecognised denominator", () => {
  // A genuine listing that states its set — by code or by name — is trusted even
  // if its "/total" is wrong, so a new set's cards are never silently dropped
  // just because setFromTotal() has not learned the denominator yet.
  assert.equal(resolve("Ionian Ambush OGN - 134/999"), "ogn-134");
  assert.equal(resolve("Ionian Ambush - Origins - 134/999"), "ogn-134");
});

test("every real Riftbound denominator still resolves by number alone", () => {
  // The number-only path is load-bearing for stores whose titles bury the name
  // in punctuation — the guard must not cost it anything.
  assert.equal(resolve("[Foil] 134/298 - Riftbound single"), "ogn-134");
  assert.equal(resolve("134/219"), "unl-134");
});

test("discovery rejects a mixed-game collection handle even when it says riftbound", () => {
  // discoverRiftboundCollections itself is module-private and does live HTTP, so
  // the regex is tested directly and its wiring is pinned by reading the source.
  const src = readFileSync(join(process.cwd(), "src/lib/price-import.ts"), "utf8");
  const re = OTHER_TCG_HANDLE;
  // The handle that actually caused this.
  assert.ok(re.test("all-singles-one-piece-pokemon-riftbound"));
  assert.ok(re.test("riftbound-and-pokemon-singles"));
  // A genuine Riftbound-only handle must sail through.
  for (const h of ["riftbound-singles", "riftbound-single", "riftbound-league-of-legends-singles", "riftbound-origins"]) {
    assert.equal(re.test(h), false, `${h} must still be discovered`);
  }
  // And it must be wired into the discovery filter, not merely declared.
  const discoverAt = src.indexOf("async function discoverRiftboundCollections");
  const fetchAt = src.indexOf("async function fetchCollection");
  assert.ok(discoverAt >= 0 && fetchAt > discoverAt);
  assert.match(
    src.slice(discoverAt, fetchAt),
    /!OTHER_TCG_HANDLE\.test\(h\)/,
    "discoverRiftboundCollections must reject mixed-game handles",
  );
});
