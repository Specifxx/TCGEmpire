import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cheapestEnglishNm, TCG_US, TCG_US_MARKET, TCG_UK, TCG_SG, TCG_AU, TCG_CA, type TcgProduct, type TcgListing } from "../src/lib/tcgplayer";
import { isFallbackRetailer, TCGPLAYER_MARKET_RETAILER, ALL_FALLBACK_RETAILERS } from "../src/lib/constants";
import { preferMarketRows, TCG_US_MARKET_READ_KEYS } from "../src/lib/tcg-market-rows";
import { tcgReferenceRows } from "../src/lib/tcg-reference";
import { chainLinkSeries, METHODOLOGY_BREAKS } from "../src/lib/market-index";

// ─────────────────────────────────────────────────────────────────────────────
// Owner, 2026-09-23: "TCGPlayer prices are displayed as the market price for
// each card listing, but for the card listing itself it should be the cheapest
// available price in the English version on TCGPlayer."
//
// Sampled live the day this landed: across 200 English singles the cheapest
// in-stock English NM listing was BELOW market price for 188, median 25% below.
// The US comparison row now quotes that listing; market price moved to its own
// reference row for the four consumers that want an aggregate.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const L = (over: Partial<TcgListing>): TcgListing => ({
  price: 1, languageId: 1, quantity: 1, condition: "Near Mint", printing: "Normal", shippingPrice: 1.49, ...over,
});
const P = (listings: TcgListing[], over: Partial<TcgProduct> = {}): TcgProduct => ({
  productId: 1, productName: "X", productUrlName: "x", setUrlName: "s", productLineUrlName: "r", setName: "Origins",
  marketPrice: 5, lowestPrice: null, foilOnly: false, sealed: false, listings, ...over,
});

test("the buyable row takes the cheapest English Near-Mint listing", () => {
  const pick = cheapestEnglishNm(P([L({ price: 4.1 }), L({ price: 3.2 }), L({ price: 3.9 })]));
  assert.equal(pick?.price, 3.2);
});

test("a listing of the OTHER printing is never quoted — the live Scuttle Crab case", () => {
  // 2026-09-23: Scuttle Crab's non-foil product returned three listings, all
  // Foil. An unfiltered minimum would have priced the regular card as a foil.
  assert.equal(cheapestEnglishNm(P([L({ price: 3.99, printing: "Foil" }), L({ price: 4.12, printing: "Foil" })])), null);
  // …and the reverse for a foil-only product.
  const foil = cheapestEnglishNm(P([L({ price: 0.5, printing: "Normal" }), L({ price: 2.5, printing: "Foil" })], { foilOnly: true }));
  assert.equal(foil?.price, 2.5);
});

test("non-English, played and out-of-stock listings never count", () => {
  const p = P([
    L({ price: 0.5, languageId: 7 }),
    L({ price: 0.6, condition: "Lightly Played" }),
    L({ price: 0.7, quantity: 0 }),
    L({ price: 2 }),
  ]);
  assert.equal(cheapestEnglishNm(p)?.price, 2);
});

test("a listing without a printing field is accepted, so an API change degrades rather than blanks", () => {
  assert.equal(cheapestEnglishNm(P([L({ price: 1.5, printing: undefined })]))?.price, 1.5);
});

test("each market row declares which number it quotes", () => {
  assert.equal(TCG_US.basis, "listing", "the US row is the buyable one");
  for (const m of [TCG_US_MARKET, TCG_UK, TCG_SG, TCG_AU, TCG_CA]) {
    assert.equal(m.basis, "market", `${m.retailer} is a reference row and must stay on market price`);
  }
  assert.equal(TCG_US_MARKET.retailer, TCGPLAYER_MARKET_RETAILER);
  assert.equal(TCG_US_MARKET.country, "US");
});

test("the market reference row can never become a store row", () => {
  assert.ok(isFallbackRetailer(TCGPLAYER_MARKET_RETAILER));
  assert.ok(ALL_FALLBACK_RETAILERS.includes(TCGPLAYER_MARKET_RETAILER));
  assert.ok(!isFallbackRetailer(TCG_US.retailer), "the US listing row IS a store");
});

test("the importer writes both US rows, and the market row cannot overwrite the US coverage count", () => {
  const src = read("src/lib/tcgplayer.ts");
  assert.match(src, /for \(const mkt of \[TCG_US, TCG_US_MARKET, TCG_UK, TCG_SG, TCG_AU, TCG_CA\]\)/);
  assert.match(src, /if \(mkt !== TCG_US_MARKET\) byCountry\[mkt\.country\] = rows\.length;/);
  // The quoted listing's real shipping travels with it; the aggregate has none.
  assert.match(src, /shippingCents: b\.shippingCents,/);
  // The English-vs-Chinese product tie-break stays on market price.
  assert.match(src, /const marketForCompare = market \?\? price;/);
});

test("market-price readers prefer the market row and fall back per card", () => {
  const rows = [
    { cardId: "a", retailer: "tcgplayer", priceCents: 300 },
    { cardId: "a", retailer: TCGPLAYER_MARKET_RETAILER, priceCents: 400 },
    { cardId: "b", retailer: "tcgplayer", priceCents: 90 }, // no market row yet — first run after deploy
  ];
  assert.deepEqual(
    preferMarketRows(rows).map((r) => `${r.cardId}:${r.priceCents}`),
    ["a:400", "b:90"],
  );
  assert.deepEqual([...TCG_US_MARKET_READ_KEYS], [TCGPLAYER_MARKET_RETAILER, "tcgplayer"]);
});

test("every market-price consumer reads through the shared helper", () => {
  // The value floor runs BEFORE the TCGplayer step in the same import, so on the
  // first run after this shipped there were no market rows — a reader that only
  // queried the new key would have made every card look unpriced and kept every
  // one for an eBay call. All four go through preferMarketRows.
  for (const f of ["src/lib/price-import.ts", "src/lib/arbitrage.ts", "src/app/tools/box-ev/page.tsx"]) {
    const src = read(f);
    assert.match(src, /preferMarketRows\(/, `${f} must read market price through preferMarketRows`);
    assert.match(src, /TCG_US_MARKET_READ_KEYS/, `${f} must query both keys`);
  }
});

test("the overseas reference block quotes the market row, not the listing", () => {
  const rows = [
    { retailer: "tcgplayer", country: "US", priceCents: 300, isFoil: false },
    { retailer: TCGPLAYER_MARKET_RETAILER, country: "US", priceCents: 400, isFoil: false },
  ];
  const ref = tcgReferenceRows(rows, "AU");
  assert.equal(ref?.std?.priceCents, 400, 'the block is labelled "TCGplayer market price"');
  // No market row yet → the legacy row, rather than no block at all.
  assert.equal(tcgReferenceRows([rows[0]], "AU")?.std?.priceCents, 300);
  // In the US the listing row is shown natively, so no reference block.
  assert.equal(tcgReferenceRows(rows, "US"), null);
});

test("the card page's store count excludes reference rows", () => {
  const src = read("src/app/card/[id]/page.tsx");
  assert.match(src, /const stores = new Set\(card\.retailerPrices\.filter\(\(r\) => !isFallbackRetailer\(r\.retailer\)\)/);
});

test("the Index chains across the basis change instead of reporting it as a fall", () => {
  const day = (m: number, d: number) => Date.UTC(2026, m - 1, d);
  const days = [day(9, 9), day(9, 16), day(9, 23), day(9, 30), day(10, 7)];
  // One card: flat, then a 25% drop exactly at the switch, then +10% of real movement.
  const byCard = new Map([["a", new Map([[days[0], 100], [days[1], 100], [days[2], 75], [days[3], 75], [days[4], 82.5]])]]);
  const plain = chainLinkSeries(days, byCard, ["a"], [1]);
  assert.equal(plain[plain.length - 1].v, 82.5, "without the break the basis step stays in the level forever");
  const broken = chainLinkSeries(days, byCard, ["a"], [1], METHODOLOGY_BREAKS);
  assert.equal(broken[2].v, 100, "the step ending on the switch day is charted flat");
  assert.equal(broken[broken.length - 1].v, 110, "movement after the window is measured on the new basis");
  // The default leaves every existing caller's arithmetic untouched.
  assert.deepEqual(chainLinkSeries(days, byCard, ["a"], [1], []), plain);
});

test("the published methodology discloses the break", () => {
  const src = read("src/lib/articles.ts");
  const i = src.indexOf('slug: "understanding-the-riftcompare-index-methodology"');
  const block = src.slice(i, src.indexOf("\n  },\n", i));
  assert.match(block, /When the way a price is sourced changes/);
  assert.match(block, /23 September 2026/);
});
