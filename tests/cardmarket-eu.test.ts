import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCardmarketRows,
  buildCardmarketRankedRows,
  buildCardmarketSealedRows,
  inferExpansionSetCodes,
  isCardmarketEnabled,
  isCardmarketRankingEnabled,
  EUR_TO_GBP,
  type CardmarketProduct,
  type CardmarketPriceEntry,
  type CardmarketRankableCard,
} from "../src/lib/cardmarket";
import { CARDMARKET_EU_RETAILER, CARDMARKET_RETAILER, EU_FALLBACK_RETAILERS, isFallbackRetailer } from "../src/lib/constants";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Cardmarket is the EU market's only realistic reference price for singles, and
// its only sealed source for a continent of eleven tracked stores. Its
// redisplay-licence gate is resolved (2026-09-04 Cardmarket support
// confirmation — see lib/cardmarket.ts's header), and its data contract is no
// longer a documentation guess: the real product-list/price-guide JSON schema
// was fetched live and verified the same day. These tests pin that real shape,
// not an assumed one — the fixtures below use REAL idProduct/name/idExpansion
// values taken verbatim from
// https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json
// (fetched 2026-09-04).
// ─────────────────────────────────────────────────────────────────────────────

test("the redisplay-licence confirmation stays documented, not silently assumed", () => {
  const src = read("src/lib/cardmarket.ts");
  assert.match(src, /2026-09-04/, "the date of the support confirmation must stay in the file");
  assert.match(src, /use it however you see fit/i, "the actual confirmation wording must be quoted, not paraphrased away");
});

test("THE BUG: an empty-string override env var must not defeat the public-URL/rate defaults", () => {
  // Found by actually running this in production (2026-09-04): GitHub Actions
  // sets an env var to "" (not unset) when the ${{ vars.X }} behind it doesn't
  // exist, so every CARDMARKET_*_URL resolved to "", readJson("") tried to
  // open "" as a local file, and Cardmarket wrote zero rows on its first live
  // run. `??` only falls through on null/undefined and does not catch "" — the
  // fix is `||`, which does. Same failure mode hit CARDMARKET_EUR_TO_GBP:
  // Number("") is 0, which would have silently zeroed every UK price once the
  // URL bug was fixed. Pinned at the source level since these are module-load
  // constants derived once from process.env, not something a runtime test can
  // toggle after import.
  const src = read("src/lib/cardmarket.ts");
  assert.doesNotMatch(src, /process\.env\.CARDMARKET_PRODUCTLIST_URL\s*\?\?/, "PRODUCTLIST_SINGLES_URL must use || , not ??");
  assert.doesNotMatch(src, /process\.env\.CARDMARKET_PRODUCTLIST_NONSINGLES_URL\s*\?\?/, "PRODUCTLIST_NONSINGLES_URL must use || , not ??");
  assert.doesNotMatch(src, /process\.env\.CARDMARKET_PRICEGUIDE_URL\s*\?\?/, "PRICEGUIDE_URL must use || , not ??");
  assert.doesNotMatch(src, /process\.env\.CARDMARKET_EUR_TO_GBP\s*\?\?/, "EUR_TO_GBP must use || , not ??");
  assert.match(src, /process\.env\.CARDMARKET_PRODUCTLIST_URL\s*\|\|/, "the working fallback pattern must actually be present");
});

test("it must never impersonate a browser to get past the block", () => {
  // The Cloudflare-guarded www.cardmarket.com is not what this module talks
  // to — see the header — but the discipline still applies: never disguise
  // the client to get past an access control.
  const src = read("src/lib/cardmarket.ts");
  assert.doesNotMatch(src, /User-Agent[^\n]*Chrome/i, "no browser impersonation anywhere in this module");
  assert.match(src, /downloads\.s3\.cardmarket\.com/, "the real, verified CDN host must be documented in-file");
});

test("zero configuration is required — CARDMARKET_DISABLED is an opt-OUT, not an opt-in", () => {
  delete process.env.CARDMARKET_DISABLED;
  assert.equal(isCardmarketEnabled(), true, "with nothing configured, this must default ON");
  process.env.CARDMARKET_DISABLED = "true";
  assert.equal(isCardmarketEnabled(), false, "the explicit kill switch must still work");
  delete process.env.CARDMARKET_DISABLED;
});

// ── Real fixtures ────────────────────────────────────────────────────────────
// idExpansion 6286 is Origins in the live data (353 products, first added
// 2025-08-28 — the earliest bucket, consistent with Origins being the first
// set). "Blazing Scorcher" and "Brazen Buccaneer" are ordinary, single-print
// Origins commons with no alt-art sibling. "Fury Rune" (845886/845887) is a
// REAL two-print collision — Cardmarket's own idMetacard groups them as the
// same card family, exactly the shape that must be skipped, not guessed.
const REAL_SINGLES: CardmarketProduct[] = [
  { idProduct: 845712, name: "Blazing Scorcher", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6286, idMetacard: 453329, dateAdded: "2025-08-28 14:10:58" },
  { idProduct: 845880, name: "Brazen Buccaneer", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6286, idMetacard: 453356, dateAdded: "2025-09-01 13:40:26" },
  { idProduct: 845886, name: "Fury Rune", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6286, idMetacard: 453361, dateAdded: "2025-09-01 14:38:28" },
  { idProduct: 845887, name: "Fury Rune", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6286, idMetacard: 453361, dateAdded: "2025-09-01 14:38:57" },
];

const OUR_CARDS = [
  { id: "ogn-scorcher", setCode: "OGN", name: "Blazing Scorcher" },
  { id: "ogn-buccaneer", setCode: "OGN", name: "Brazen Buccaneer" },
  { id: "ogn-r-fury-base", setCode: "OGN", name: "Fury Rune" },
  { id: "ogn-r-fury-alt", setCode: "OGN", name: "Fury Rune" },
];

test("inferExpansionSetCodes maps a confident bucket and leaves a mixed/low-signal one unmapped", () => {
  const ourNamesBySet = new Map<string, Set<string>>([
    ["OGN", new Set(["blazing scorcher", "brazen buccaneer", "fury rune"])],
    ["VEN", new Set(["some unrelated vendetta card"])],
  ]);
  const mappings = inferExpansionSetCodes(REAL_SINGLES, ourNamesBySet);
  const ogn = mappings.find((m) => m.idExpansion === 6286);
  assert.ok(ogn, "expansion 6286 must map confidently to OGN from real product names");
  assert.equal(ogn!.setCode, "OGN");
  assert.ok(ogn!.confidence >= 0.8);

  // A bucket whose names don't overlap ANY of our sets must stay unmapped
  // rather than being forced onto the closest-sounding one.
  const unknownExpansion: CardmarketProduct[] = [
    { idProduct: 1, name: "Something Nobody Has", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 9999, idMetacard: 1, dateAdded: "2026-01-01" },
  ];
  const noMappings = inferExpansionSetCodes(unknownExpansion, ourNamesBySet);
  assert.equal(noMappings.find((m) => m.idExpansion === 9999), undefined, "an unrecognisable bucket must not be force-mapped");
});

test("an ordinary, single-print card matches and gets both UK (converted) and EU (native) rows", () => {
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 845712, idCategory: 1655, low: 0.05, avg: 0.15, trend: 0.08 },
  ];
  const m = buildCardmarketRows(OUR_CARDS, REAL_SINGLES, prices);
  const eu = m.rows.find((r) => r.retailer === CARDMARKET_EU_RETAILER && r.cardId === "ogn-scorcher");
  const uk = m.rows.find((r) => r.retailer === CARDMARKET_RETAILER && r.cardId === "ogn-scorcher");
  assert.ok(eu, "an EU row must be written for an unambiguous card");
  assert.equal(eu!.country, "EU");
  assert.equal(eu!.currency, "EUR");
  assert.equal(eu!.priceCents, 5, "0.05 EUR must be written verbatim, unconverted, as 5 cents");
  assert.ok(uk, "a UK row must be written too");
  assert.equal(uk!.country, "UK");
  assert.equal(uk!.currency, "GBP");
  assert.equal(uk!.priceCents, Math.round(0.05 * EUR_TO_GBP * 100));
});

test("THE REAL COLLISION: a two-print card family (Fury Rune) is skipped, not guessed", () => {
  // Both idProduct 845886 and 845887 are "Fury Rune" in the same expansion —
  // and we also hold two "Fury Rune" cards in OGN. Neither side can tell which
  // is which, so this must be skipped entirely rather than pricing one
  // arbitrarily (or worse, both) onto a specific print.
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 845886, idCategory: 1655, low: 0.1, avg: null, trend: null },
    { idProduct: 845887, idCategory: 1655, low: 9.5, avg: null, trend: null },
  ];
  const m = buildCardmarketRows(OUR_CARDS, REAL_SINGLES, prices);
  assert.equal(m.rows.some((r) => r.cardId === "ogn-r-fury-base" || r.cardId === "ogn-r-fury-alt"), false, "no rune row may be written");
  assert.ok(m.skippedAmbiguousName >= 2);
});

test("a card with no price entry, or a zero/null LOW, is skipped and counted, not silently dropped", () => {
  const m = buildCardmarketRows(OUR_CARDS, REAL_SINGLES, [
    { idProduct: 845880, idCategory: 1655, low: null, avg: 3, trend: 3 },
  ]);
  assert.equal(m.rows.some((r) => r.cardId === "ogn-buccaneer"), false);
  assert.ok(m.skippedNoPrice >= 1);
});

test("a product in an unmapped expansion is skipped and counted separately from a no-price skip", () => {
  // A name that appears in NONE of our sets, so the expansion has nothing to
  // vote for and must stay unmapped rather than defaulting to a guess.
  const unmapped: CardmarketProduct = { idProduct: 999999, name: "Totally Unrecognised Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 424242, idMetacard: 1, dateAdded: "2026-01-01" };
  const m = buildCardmarketRows(OUR_CARDS, [unmapped], [{ idProduct: 999999, idCategory: 1655, low: 1, avg: 1, trend: 1 }]);
  assert.equal(m.matched, 0);
  assert.ok(m.skippedUnmappedExpansion >= 1);
});

test("LOW wins over avg/trend — this is a lowest-price site", () => {
  const m = buildCardmarketRows(OUR_CARDS, REAL_SINGLES, [
    { idProduct: 845712, idCategory: 1655, low: 0.05, avg: 9.99, trend: 8.88 },
  ]);
  const eu = m.rows.find((r) => r.retailer === CARDMARKET_EU_RETAILER)!;
  assert.equal(eu.priceCents, 5);
});

test("both singles rows are reference sources, never buyable stores", () => {
  assert.ok(isFallbackRetailer(CARDMARKET_RETAILER));
  assert.ok(isFallbackRetailer(CARDMARKET_EU_RETAILER));
  assert.ok(EU_FALLBACK_RETAILERS.includes(CARDMARKET_EU_RETAILER));
  assert.notEqual(CARDMARKET_RETAILER, CARDMARKET_EU_RETAILER, "UK and EU must be separate retailer keys — RetailerPrice has no country in its unique key");
});

// ── Chase prints, recovered by rank ─────────────────────────────────────────
// A real 3-print family pulled live during review: idExpansion 6399, name
// "Aphelios, Exalted", idProducts 866775/866971/867003, priced at
// €0.02 / €37.99 / €380 — the exact evidence cited in lib/cardmarket.ts's
// header for RANK_MIN_STEP. The card DEFINITIONS below (collector numbers,
// which pool each is) are illustrative test fixtures — this file has no live
// DB to confirm Aphelios's actual real-world print lineup against — but the
// idProduct/name/idExpansion/price values are the genuine ones observed.
const REAL_APHELIOS: CardmarketProduct[] = [
  { idProduct: 866775, name: "Aphelios, Exalted", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6399, idMetacard: 458346, dateAdded: "2026-01-19 15:14:30" },
  { idProduct: 866971, name: "Aphelios, Exalted", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6399, idMetacard: 458346, dateAdded: "2026-01-19 16:42:11" },
  { idProduct: 867003, name: "Aphelios, Exalted", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 6399, idMetacard: 458346, dateAdded: "2026-01-19 17:19:17" },
];
const APHELIOS_PRICES: CardmarketPriceEntry[] = [
  { idProduct: 866775, idCategory: 1655, low: 0.02, avg: 0.22, trend: 0.2 },
  { idProduct: 866971, idCategory: 1655, low: 37.99, avg: null, trend: 65 },
  { idProduct: 867003, idCategory: 1655, low: 380, avg: 399.99, trend: 399.99 },
];
const APHELIOS_CARDS: CardmarketRankableCard[] = [
  { id: "sfd-aphelios-base", setCode: "SFD", name: "Aphelios, Exalted", collectorNumber: "045/221", rarity: "Rare", variant: null, isPromo: false, isOvernumbered: false },
  { id: "sfd-aphelios-over", setCode: "SFD", name: "Aphelios, Exalted", collectorNumber: "230/221", rarity: "Rare", variant: null, isPromo: false, isOvernumbered: true },
  { id: "sfd-aphelios-sig", setCode: "SFD", name: "Aphelios, Exalted", collectorNumber: "230*/221", rarity: "Rare", variant: null, isPromo: false, isOvernumbered: false },
];

test("REAL DATA: a genuine 3-print family is ranked, and the priciest slot lands on the rarest pool (Signature)", () => {
  const m = buildCardmarketRankedRows(APHELIOS_CARDS, REAL_APHELIOS, APHELIOS_PRICES);
  assert.equal(m.familiesConsidered, 1);
  assert.equal(m.familiesRanked, 1);

  const sigEu = m.rows.find((r) => r.cardId === "sfd-aphelios-sig" && r.retailer === CARDMARKET_EU_RETAILER);
  assert.ok(sigEu, "the Signature card must get a row");
  assert.equal(sigEu!.priceCents, 38000, "the priciest print (€380) must land on the rarest pool, Signature");
  assert.match(sigEu!.title, /ranked 3\/3 by price/i);
  assert.match(sigEu!.title, /not matched to a specific listing/i, "the estimate provenance must stay in the data, not just a comment");

  const baseEu = m.rows.find((r) => r.cardId === "sfd-aphelios-base" && r.retailer === CARDMARKET_EU_RETAILER);
  assert.equal(baseEu!.priceCents, 2, "the cheapest print (€0.02) must land on the base (least rare) pool");

  const overEu = m.rows.find((r) => r.cardId === "sfd-aphelios-over" && r.retailer === CARDMARKET_EU_RETAILER);
  assert.equal(overEu!.priceCents, 3799, "the middle price must land on the middle pool (Over-numbered)");

  const sigUk = m.rows.find((r) => r.cardId === "sfd-aphelios-sig" && r.retailer === CARDMARKET_RETAILER);
  assert.equal(sigUk!.priceCents, Math.round(380 * EUR_TO_GBP * 100));
});

test("a family whose prices sit too close together is rejected — no confident order to guess", () => {
  const closeProducts: CardmarketProduct[] = [
    { idProduct: 1, name: "Close Call Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7000, idMetacard: 1, dateAdded: "2026-01-01" },
    { idProduct: 2, name: "Close Call Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7000, idMetacard: 1, dateAdded: "2026-01-01" },
  ];
  const closePrices: CardmarketPriceEntry[] = [
    { idProduct: 1, idCategory: 1655, low: 10, avg: null, trend: null },
    { idProduct: 2, idCategory: 1655, low: 15, avg: null, trend: null }, // only 1.5x — below RANK_MIN_STEP
  ];
  const closeCards: CardmarketRankableCard[] = [
    { id: "close-base", setCode: "SFD", name: "Close Call Card", collectorNumber: "050/221", rarity: "Common", variant: null, isPromo: false, isOvernumbered: false },
    { id: "close-alt", setCode: "SFD", name: "Close Call Card", collectorNumber: "050a/221", rarity: "Showcase", variant: "a", isPromo: false, isOvernumbered: false },
  ];
  const m = buildCardmarketRankedRows(closeCards, closeProducts, closePrices);
  assert.equal(m.familiesConsidered, 1, "the sizes matched, so it was a candidate");
  assert.equal(m.familiesRanked, 0, "but the prices were too close to trust an order");
  assert.equal(m.rows.length, 0);
});

test("GATE 1: a family whose group sizes disagree between us and Cardmarket is never ranked", () => {
  // Cardmarket has 2 prints; we only know of 1 card by that name — a real
  // count mismatch, not just noisy pricing. Must abort rather than guess
  // which Cardmarket product is real.
  const products: CardmarketProduct[] = [
    { idProduct: 1, name: "Mismatched Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7001, idMetacard: 1, dateAdded: "2026-01-01" },
    { idProduct: 2, name: "Mismatched Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7001, idMetacard: 1, dateAdded: "2026-01-01" },
  ];
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 1, idCategory: 1655, low: 1, avg: null, trend: null },
    { idProduct: 2, idCategory: 1655, low: 100, avg: null, trend: null },
  ];
  const cards: CardmarketRankableCard[] = [
    { id: "mismatched-only", setCode: "SFD", name: "Mismatched Card", collectorNumber: "060/221", rarity: "Common", variant: null, isPromo: false, isOvernumbered: false },
  ];
  const m = buildCardmarketRankedRows(cards, products, prices);
  assert.equal(m.familiesConsidered, 0, "a size mismatch never even becomes a candidate");
  assert.equal(m.rows.length, 0);
});

test("GATE 2: a promo among the candidates aborts the whole family rather than ranking around it", () => {
  // poolOf() returns null for a promo — a hole in the ranking, not a rankable
  // pool. The whole family must abort, not silently rank the other two.
  const products: CardmarketProduct[] = [
    { idProduct: 1, name: "Promo Mixed Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7002, idMetacard: 1, dateAdded: "2026-01-01" },
    { idProduct: 2, name: "Promo Mixed Card", idCategory: 1655, categoryName: "Riftbound Single", idExpansion: 7002, idMetacard: 1, dateAdded: "2026-01-01" },
  ];
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 1, idCategory: 1655, low: 1, avg: null, trend: null },
    { idProduct: 2, idCategory: 1655, low: 100, avg: null, trend: null },
  ];
  const cards: CardmarketRankableCard[] = [
    { id: "promo-mixed-base", setCode: "SFD", name: "Promo Mixed Card", collectorNumber: "070/221", rarity: "Common", variant: null, isPromo: false, isOvernumbered: false },
    { id: "promo-mixed-promo", setCode: "SFD", name: "Promo Mixed Card", collectorNumber: "070/221", rarity: "Common", variant: null, isPromo: true, isOvernumbered: false },
  ];
  const m = buildCardmarketRankedRows(cards, products, prices);
  assert.equal(m.familiesConsidered, 1, "sizes matched, so it reached the classification gate");
  assert.equal(m.familiesRanked, 0, "but a promo can't be ranked, so the family aborts");
  assert.equal(m.rows.length, 0);
});

test("the ranked pass has its own kill switch, independent of CARDMARKET_DISABLED", () => {
  delete process.env.CARDMARKET_RANKED_DISABLED;
  assert.equal(isCardmarketRankingEnabled(), true, "with nothing configured, this must default ON");
  process.env.CARDMARKET_RANKED_DISABLED = "true";
  assert.equal(isCardmarketRankingEnabled(), false);
  delete process.env.CARDMARKET_DISABLED; // must not be the same flag
  assert.equal(isCardmarketEnabled(), true, "disabling ranking must not disable Cardmarket itself");
  delete process.env.CARDMARKET_RANKED_DISABLED;
});

// ── Sealed ───────────────────────────────────────────────────────────────────
// Real fixtures from products_nonsingles_22.json (fetched 2026-09-04).
const REAL_NONSINGLES: CardmarketProduct[] = [
  { idProduct: 845721, name: "Origins Booster Box", idCategory: 1657, categoryName: "Riftbound Display", idExpansion: 6286, idMetacard: 0, dateAdded: "2025-08-28 14:25:13" },
  { idProduct: 845733, name: "Jinx Champion Deck", idCategory: 1659, categoryName: "Riftbound Champion Decks", idExpansion: 6286, idMetacard: 0, dateAdded: "2025-09-08" },
  { idProduct: 848215, name: "Origins: Common Set", idCategory: 1658, categoryName: "RB Set", idExpansion: 6286, idMetacard: 0, dateAdded: "2025-09-10" },
];

test("sealed: a real Booster Box and Champion Deck match, priced natively in EUR", () => {
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 845721, idCategory: 1657, low: 89.99, avg: 95, trend: 92 },
    { idProduct: 845733, idCategory: 1659, low: 12.5, avg: 13, trend: 13 },
  ];
  const m = buildCardmarketSealedRows(OUR_CARDS, REAL_SINGLES, REAL_NONSINGLES, prices);
  const box = m.rows.find((r) => r.title === "Origins Booster Box");
  assert.ok(box);
  assert.equal(box!.country, "EU");
  assert.equal(box!.priceCents, 8999);
  assert.equal(box!.setCode, "OGN");
  assert.equal(box!.retailer, CARDMARKET_RETAILER);
  const deck = m.rows.find((r) => r.title === "Jinx Champion Deck");
  assert.ok(deck);
  assert.match(deck!.productType, /Champion Deck/);
});

test("sealed: Cardmarket's 'RB Set' (bulk singles bundles) is never tracked as a sealed product", () => {
  const m = buildCardmarketSealedRows(OUR_CARDS, REAL_SINGLES, REAL_NONSINGLES, [
    { idProduct: 848215, idCategory: 1658, low: 5, avg: 5, trend: 5 },
  ]);
  assert.equal(m.rows.some((r) => r.title === "Origins: Common Set"), false, "an RB Set bundle is not a Riot-manufactured product");
});

// ── Regression: the real DB column shape, not a fixture that happens to agree ──
// This is the exact bug class that shipped to production 2026-09-06: every real
// import path (import-cards.ts, sync-cards.ts, etc.) writes Card.nameNormalized
// via normalizeSearch() — compact, no separators ("blazingscorcher") — a
// DIFFERENT shape from this file's own normName() ("blazing scorcher"). Every
// fixture above only ever carried the normName() shape (or, after the fix, no
// nameNormalized field at all), so a regression that started reading
// `c.nameNormalized` again would pass every test above while failing in
// production exactly as it did before. These fixtures carry the real, compact
// shape on a field the builders must NEVER read, to prove that.
const REAL_SHAPE_CARDS = [
  { id: "ogn-scorcher", setCode: "OGN", name: "Blazing Scorcher", nameNormalized: "blazingscorcher" },
  { id: "ogn-buccaneer", setCode: "OGN", name: "Brazen Buccaneer", nameNormalized: "brazenbuccaneer" },
  { id: "ogn-r-fury-base", setCode: "OGN", name: "Fury Rune", nameNormalized: "furyrune" },
  { id: "ogn-r-fury-alt", setCode: "OGN", name: "Fury Rune", nameNormalized: "furyrune" },
];

test("REGRESSION: matching works even when nameNormalized is in the real compact (normalizeSearch) shape", () => {
  const prices: CardmarketPriceEntry[] = [
    { idProduct: 845712, idCategory: 1655, low: 0.05, avg: 0.15, trend: 0.08 },
  ];
  const m = buildCardmarketRows(REAL_SHAPE_CARDS, REAL_SINGLES, prices);
  const eu = m.rows.find((r) => r.retailer === CARDMARKET_EU_RETAILER && r.cardId === "ogn-scorcher");
  assert.ok(eu, "must match by computing normName(name) fresh, never by reading a differently-shaped stored column");
  assert.equal(m.expansionsMapped, 1, "the expansion must map even though the stray nameNormalized field is in the wrong shape");
});
