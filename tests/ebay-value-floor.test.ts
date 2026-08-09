import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EBAY_MIN_VALUE_USD_CENTS, eBayWorthSearching, isTwiceDailyPrinting } from "../src/lib/price-import";
import { classifySealed, ebaySealedWorthSearching } from "../src/lib/sealed-import";

// ─────────────────────────────────────────────────────────────────────────────
// Which cards and sealed products are worth an eBay Browse call.
//
// Two filters, both of which trade coverage for quota, and both of which fail
// silently in the same direction: a card that stops being searched does not
// error, it just quietly loses its eBay row and its affiliate link. The tests
// that matter here are the ones pinning down what must NOT be skipped.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const RARE = { rarity: "Rare", collectorNumber: "042/166", variant: null, isPromo: false };
const SIGNATURE = { rarity: "Common", collectorNumber: "189*/166", variant: null, isPromo: false };
const PROMO = { rarity: "Common", collectorNumber: "012/166", variant: null, isPromo: true };

// ── The floor itself ─────────────────────────────────────────────────────────

test("the floor is $20 USD unless the environment overrides it", () => {
  // Not asserted as a literal 2000 — the point is that it is a real dollar
  // figure in USD cents, and that the env override exists so it can be moved
  // without a deploy if quota pressure changes.
  assert.equal(EBAY_MIN_VALUE_USD_CENTS, Number(process.env.EBAY_MIN_VALUE_CENTS ?? 2000));
  assert.ok(Number.isFinite(EBAY_MIN_VALUE_USD_CENTS) && EBAY_MIN_VALUE_USD_CENTS > 0);
});

test("a card below the TCGplayer US floor is not searched, whatever its rarity", () => {
  assert.equal(eBayWorthSearching(RARE, 499), false, "a $4.99 Rare is not worth a call");
  assert.equal(eBayWorthSearching(RARE, EBAY_MIN_VALUE_USD_CENTS - 1), false);
  assert.equal(eBayWorthSearching(SIGNATURE, 150), false, "a $1.50 Signature is still a $1.50 card");
});

test("the floor is inclusive — a card exactly at $20 is searched", () => {
  // A strict `>` would drop cards sitting exactly on a round number, and TCGplayer
  // market prices land on round numbers constantly.
  assert.equal(eBayWorthSearching(RARE, EBAY_MIN_VALUE_USD_CENTS), true);
  assert.equal(eBayWorthSearching(RARE, EBAY_MIN_VALUE_USD_CENTS + 1), true);
});

test("UNKNOWN VALUE IS NOT LOW VALUE — a card with no TCGplayer price is kept", () => {
  // The single most important behaviour in this file. Cards with no TCGplayer
  // row are overwhelmingly the ones that just released: a brand-new set's chase
  // cards have no market price on day one, which is exactly the window in which
  // their eBay price is most wanted. Treating "no price" as "cheap" would blank
  // every launch.
  assert.equal(eBayWorthSearching(RARE, null), true, "null value must be kept");
  assert.equal(eBayWorthSearching(RARE, undefined), true, "missing value must be kept");
  assert.equal(eBayWorthSearching(RARE), true, "omitted value must be kept");
  assert.equal(eBayWorthSearching(SIGNATURE, null), true);
  assert.equal(eBayWorthSearching(PROMO, null), true);
});

test("a zero TCGplayer price is treated as a price, not as missing", () => {
  // 0 is falsy; a `!tcgUsCents` guard would read it as "unknown" and keep the
  // card. A genuinely $0.00 card is the clearest possible skip.
  assert.equal(eBayWorthSearching(RARE, 0), false);
});

test("the floor applies to promos too — being a promo is not being valuable", () => {
  // Promos bypass the RARITY rule (a promo of a Common is a separate limited
  // printing), but the value floor is a different question: a promo genuinely
  // worth $2 is no more worth a Browse call than any other $2 card.
  assert.equal(eBayWorthSearching(PROMO, 200), false, "a $2 promo is still a $2 card");
  assert.equal(eBayWorthSearching(PROMO, 5000), true);
});

test("the rarity rule and the value floor are independent gates", () => {
  const COMMON = { rarity: "Common", collectorNumber: "042/166", variant: null, isPromo: false };
  // Expensive but Common → still skipped on rarity. A base-print Common that
  // somehow prices above $20 is a data error far more often than it is a real
  // card, and the "no eBay for Commons" promise should not hinge on a price.
  assert.equal(eBayWorthSearching(COMMON, 9999), false);
  // Cheap but chase → skipped on value. Neither gate rescues the other.
  assert.equal(eBayWorthSearching(SIGNATURE, 100), false);
});

// ── Wiring: every pass that spends quota must apply the floor ────────────────

test("all three eBay passes filter on the value floor", () => {
  const src = read("src/lib/price-import.ts");
  // The catalogue pass, the twice-daily chase pass and the auction pass each
  // spend Browse calls. A pass that read the value map but forgot to pass it
  // would keep working and quietly spend the quota this change exists to save.
  const calls = src.match(/eBayWorthSearching\(c, tcgValues\.get\(c\.id\)\)/g) ?? [];
  assert.equal(calls.length, 3, "expected the catalogue, chase and auction passes to each apply the floor");
  // Read once per pass, never per card — the map is a whole-table read.
  const reads = src.match(/await tcgplayerUsValues\(\)/g) ?? [];
  assert.equal(reads.length, 3, "tcgplayerUsValues must be read once per pass, not inside a market loop");
});

test("the preview script passes the value explicitly, never as a bare .filter reference", () => {
  // `.filter(eBayWorthSearching)` type-checks and is catastrophically wrong:
  // Array.filter hands the ELEMENT INDEX to the second parameter, so every card
  // at an index below the floor reads as a sub-$20 card and the script prints
  // nothing at all.
  // Comments stripped first: the script names the wrong form in a warning
  // comment on purpose, and that mention must not read as the bug itself.
  const src = read("scripts/preview-ebay-chase.ts").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\.filter\(eBayWorthSearching\)/);
  assert.match(src, /\.filter\(\(c\) => eBayWorthSearching\(c, /);
});

test("cards dropped by the floor still keep a way to reach eBay", () => {
  // The justification for skipping them is that the buy path survives — the
  // surfaces fall back to an affiliate eBay SEARCH link when a card has no eBay
  // row, which is now permanently true for sub-$20 cards as well as Commons.
  const market = read("src/components/CardMarketSection.tsx");
  assert.match(market, /const ebay = m\.hasEbay \? null : ebaySearch\[country\] \?\? null;/);
  assert.match(market, /retailer="ebay_no_listing"/);
});

test("the twice-daily chase set is a subset of what the catalogue rule allows", () => {
  // A printing scheduled for two refreshes a day that the catalogue rule
  // excludes would be searched twice and stored zero times.
  const scheduled = [
    { rarity: "Common", collectorNumber: "189*/166", variant: null, isPromo: false },
    { rarity: "Common", collectorNumber: "196/166", variant: null, isPromo: false },
    { rarity: "Uncommon", collectorNumber: "007/166", variant: null, isPromo: true },
  ];
  for (const c of scheduled) {
    assert.ok(isTwiceDailyPrinting(c), `${c.collectorNumber} should be twice-daily`);
    // Given a value at or above the floor, the catalogue rule must agree.
    assert.ok(
      eBayWorthSearching(c, EBAY_MIN_VALUE_USD_CENTS),
      `${c.collectorNumber} scheduled twice daily but excluded by the catalogue rule`,
    );
  }
});

// ── Sealed ───────────────────────────────────────────────────────────────────

test("single booster packs are the only sealed type dropped from eBay", () => {
  // eBay's single-pack category is resellers breaking boxes, weighed packs and
  // repacks; prices bear no relation to the sealed market being compared. Every
  // other type is a discrete product with a real secondary market.
  //
  // Types come from classifySealed rather than being typed out here, so the
  // exclusion is checked against the strings the importer ACTUALLY produces —
  // a hand-written list would keep passing if a type were ever renamed.
  assert.equal(classifySealed("Riftbound Origins Booster Pack"), "Booster Pack");
  assert.equal(ebaySealedWorthSearching("Booster Pack"), false);

  const keep = [
    "Riftbound Origins Booster Box",
    "Riftbound Origins Booster Display Case",
    "Riftbound Origins Sleeved Booster",
    "Riftbound Champion Deck (Jinx)",
    "Riftbound Proving Grounds",
    "Riftbound Origins Nexus Night Promo Pack",
    "Riftbound Origins Booster Bundle",
    "Riftbound Two-Player Starter Set",
    "Riftbound Collector Tin",
    "Riftbound Pre-Rift Event Kit",
  ];
  for (const title of keep) {
    const type = classifySealed(title);
    assert.notEqual(type, "Booster Pack", `${title} must not classify as a loose pack`);
    assert.equal(ebaySealedWorthSearching(type), true, `${type} must keep its eBay search`);
  }
});

test("Sleeved Booster is deliberately not caught by the booster-pack exclusion", () => {
  // classifySealed gives it its own product type. A substring or /booster/i test
  // would swallow it — and it is a distinct collectable, not a loose pack.
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /EBAY_SEALED_SKIP_TYPES = new Set\(\["Booster Pack"\]\)/);
  assert.doesNotMatch(src, /ebaySealedWorthSearching[\s\S]{0,200}?\.includes\(/);
  assert.equal(ebaySealedWorthSearching("Sleeved Booster"), true);
});

test("the sealed exclusion is applied to the search list, before any call is made", () => {
  const src = read("src/lib/sealed-import.ts");
  // Filtering after the loop would save nothing: the quota is spent by the
  // search, not by the write.
  const listStart = src.indexOf("const searchList = [");
  const loopStart = src.indexOf("for (const g of searchList)");
  assert.ok(listStart > 0 && loopStart > listStart, "could not bound the sealed search list");
  assert.match(
    src.slice(listStart, loopStart),
    /\.filter\(\(g\) => ebaySealedWorthSearching\(g\.productType\)\)/,
    "the exclusion must narrow searchList itself",
  );
});

test("every sealed market still searches every remaining product type", () => {
  // The user-facing half of the request: sealed eBay coverage is all products
  // (minus loose packs) across all four searched marketplaces, not US-only.
  const src = read("src/lib/sealed-import.ts");
  for (const m of ["EBAY_US", "EBAY_AU", "EBAY_GB", "EBAY_SG"]) {
    assert.ok(src.includes(m), `${m} must remain in EBAY_SEALED_MARKETS`);
  }
  assert.match(src, /for \(const mkt of EBAY_SEALED_MARKETS\)/);
});

// ── The Riftbound × T1 2025 Worlds Champion Collection ────────────────────────
// A drawing-only Riot Merch product with no set code and none of the product
// words every other filter keys off. Before it was wired in, the Signature
// Edition matched neither SEALED_TITLE nor RIFTBOUND_HINT (so it was dropped
// entirely) while the Player Bundle fell into the generic "Bundle" bucket — two
// halves of one collection, classified apart, one of them invisible.

test("both halves of the T1 collection classify as their own product types", () => {
  assert.equal(
    classifySealed("Riftbound x T1 2025 Worlds Champion Signature Edition"),
    "T1 Signature Edition",
  );
  assert.equal(
    classifySealed("Riftbound T1 2025 Worlds Champion Player Bundle"),
    "T1 Player Bundle",
  );
  // Riot's own posts shorten it to "T1 Worlds Signature Set" — same product.
  assert.equal(
    classifySealed("Riftbound TCG - T1 Worlds Signature Set (English) SEALED"),
    "T1 Signature Edition",
  );
});

test("the Player Bundle is not swallowed by the generic Bundle rule", () => {
  // It contains the bare word "bundle", so rule order is load-bearing: the T1
  // branches must sit ABOVE `vault bundle|worlds bundle|…|\bbundle\b`.
  const src = read("src/lib/sealed-import.ts");
  const t1 = src.indexOf('return "T1 Player Bundle"');
  const generic = src.indexOf('return "Bundle"');
  assert.ok(t1 > 0 && generic > t1, "the T1 branches must be classified before the generic Bundle rule");
  assert.notEqual(classifySealed("Riftbound Origins Vault Bundle"), "T1 Player Bundle");
  assert.equal(classifySealed("Riftbound Origins Vault Bundle"), "Bundle");
});

test("a Signature SINGLE is never mistaken for the T1 sealed product", () => {
  // "Signature" on its own is a CARD treatment. Anchoring the T1 matcher on
  // "worlds champion" (or a nearby "T1") is what keeps singles out of the sealed
  // table — the exact failure a bare /signature/ test would cause.
  for (const notT1 of [
    "Zed, Master of Shadows Signature 191*/166 Vendetta",
    "Riftbound Vayne Hunter Signature SFD 223*/221 NM",
    // "Signature Edition" with no T1/Worlds anchor is somebody else's product.
    "Riftbound Vendetta Signature Edition Playmat",
  ]) {
    assert.notEqual(classifySealed(notT1), "T1 Signature Edition", notT1);
    assert.notEqual(classifySealed(notT1), "T1 Player Bundle", notT1);
  }
});

test("both T1 types keep an eBay search, a price floor and a published RRP", () => {
  // The whole point of cataloguing a drawing-only product: the ONLY market it
  // will ever have is resale, so if it loses its eBay search it has no prices at
  // all. The floor and RRP are what make "how far over US$360" answerable.
  const ebay = read("src/lib/ebay.ts");
  const msrp = read("src/lib/msrp.ts");
  for (const type of ["T1 Signature Edition", "T1 Player Bundle"]) {
    assert.equal(ebaySealedWorthSearching(type), true, `${type} must keep its eBay search`);
    assert.ok(ebay.includes(`"${type}"`), `${type} needs a SEALED_TYPE_KW + SEALED_MIN_CENTS entry`);
    assert.ok(msrp.includes(`"${type}"`), `${type} needs an MSRP entry`);
  }
});
