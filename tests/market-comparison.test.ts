import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareMarkets,
  marketPriceListSentence,
  marketSpreadSentence,
} from "../src/lib/market-comparison";
import type { MarketRow } from "../src/lib/market-rows";
import { USD_TO } from "../src/lib/fx";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// THE CROSS-CURRENCY COMPARISON.
//
// Six markets, each priced natively by stores that really bill in that currency,
// is the site's one genuinely differentiated asset — and until this module it was
// rendered as a flat list (A$14.00, £6.50, US$8.20, S$12.90) that nobody can rank
// by eye. Putting them on one scale is the feature.
//
// It is also the easiest thing on the site to make dishonest, in three specific
// ways, and each has a test below:
//   • ranking a REAL local price against a CONVERTED reference one and calling
//     the difference a market spread;
//   • presenting an indicative conversion as a price someone will be charged;
//   • presenting "cheaper in another market" as advice to buy there, when every
//     tracked store ships domestically and nothing models postage or duty.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
function row(over: Partial<MarketRow> & Pick<MarketRow, "country" | "retailer" | "priceCents">): MarketRow {
  return {
    id: `row-${seq++}`,
    retailerName: over.retailer,
    ship: null,
    condition: "NM",
    isFoil: false,
    inStock: true,
    lastSeen: new Date().toISOString(),
    buyHref: "https://example.test/buy",
    policyUrl: null,
    ...over,
  };
}

/**
 * A card stocked in three markets, with figures chosen so the NATIVE order and
 * the CONVERTED order disagree completely:
 *
 *   native ascending   £9.00  <  US$10.00  <  A$12.00     (UK, US, AU)
 *   in USD ascending   A$12.00 → ~US$8.00  <  US$10.00  <  £9.00 → ~US$11.39
 *                                                          (AU, US, UK)
 *
 * That disagreement is the entire feature — six raw currency figures cannot be
 * ranked by eye, and a comparison that sorted on the raw cents would look
 * plausible while being wrong. Any fixture where both orders agree would pass
 * the ranking test without testing anything.
 */
function threeMarkets(): MarketRow[] {
  return [
    row({ country: "US", retailer: "ebay_us", priceCents: 1000, ship: 400 }),
    row({ country: "AU", retailer: "ebay_au", priceCents: 1200 }),
    row({ country: "UK", retailer: "ebay_uk", priceCents: 900, ship: 0 }),
  ];
}

test("markets are ranked against each other in one currency, not left in six", () => {
  const cmp = compareMarkets(threeMarkets(), "USD");
  assert.deepEqual(
    cmp.quotes.map((q) => q.country),
    ["AU", "US", "UK"],
    "cheapest-first by CONVERTED value — sorting the raw cents would give UK, US, AU, the exact opposite",
  );
  assert.equal(cmp.cheapest?.country, "AU");
  assert.equal(cmp.dearest?.country, "UK");

  // Native figures are untouched: they are what a visitor actually pays.
  const uk = cmp.quotes.find((q) => q.country === "UK")!;
  assert.equal(uk.nativeCents, 900);
  assert.equal(uk.currency, "GBP");
  // …and the comparable figure is a conversion of it, at the shared rate table.
  assert.equal(uk.comparableCents, Math.round(900 / USD_TO.GBP));
});

test("the spread is stated relative to the cheapest market", () => {
  const cmp = compareMarkets(threeMarkets(), "USD");
  const lo = cmp.cheapest!.comparableCents;
  const hi = cmp.dearest!.comparableCents;
  assert.equal(cmp.spreadPct, Math.round(((hi - lo) / lo) * 100));
  assert.ok(cmp.spreadPct! > 0, "a real spread across these three markets");
});

test("a converted reference price is never ranked as a market's real price", () => {
  // THE honesty rule. tcgplayer_au is a US price converted for display, not an
  // Australian store — market-rows.ts refuses to count it as one, and if it
  // leaked in here the site would report a "market spread" that is really just
  // its own conversion of a price it already lists under the US.
  const rows: MarketRow[] = [
    row({ country: "US", retailer: "ebay_us", priceCents: 1000 }),
    row({ country: "AU", retailer: "tcgplayer_au", priceCents: 1500 }),
  ];
  const cmp = compareMarkets(rows, "USD");
  assert.deepEqual(cmp.quotes.map((q) => q.country), ["US"], "AU has no real local listing, so it is not a market here");
  assert.equal(cmp.spreadPct, null, "one market is not a spread");
  assert.equal(marketSpreadSentence(cmp, "Test Card"), null, "and there is no sentence to write about it");
});

test("out-of-stock listings do not price a market", () => {
  const rows: MarketRow[] = [
    row({ country: "US", retailer: "ebay_us", priceCents: 1000 }),
    row({ country: "UK", retailer: "ebay_uk", priceCents: 100, inStock: false }),
  ];
  const cmp = compareMarkets(rows, "USD");
  assert.deepEqual(cmp.quotes.map((q) => q.country), ["US"], "a sold-out £1.00 must not make the UK the cheapest market");
});

test("a single market produces no comparison at all", () => {
  const cmp = compareMarkets([row({ country: "US", retailer: "ebay_us", priceCents: 1000 })], "USD");
  assert.equal(cmp.quotes.length, 1);
  assert.equal(cmp.dearest, null);
  assert.equal(cmp.spreadPct, null);
  assert.equal(marketSpreadSentence(cmp, "Test Card"), null);
  // The prose list still works for one market — it makes no comparative claim.
  assert.match(marketPriceListSentence(cmp)!, /in the United States$/);
});

test("no rows at all is empty, not a crash or a zero-price market", () => {
  const cmp = compareMarkets([], "USD");
  assert.deepEqual(cmp.quotes, []);
  assert.equal(cmp.cheapest, null);
  assert.equal(cmp.spreadPct, null);
  assert.equal(marketPriceListSentence(cmp), null);
  assert.equal(marketSpreadSentence(cmp, "Test Card"), null);
});

test("the prose names every market's REAL currency, with no converted figures in it", () => {
  // This sentence is what an AI answer engine quotes for "how much is <card> in
  // GBP". Every number in it must be a real local listing, so that it needs no
  // disclaimer to be true.
  const sentence = marketPriceListSentence(compareMarkets(threeMarkets(), "USD"))!;
  assert.match(sentence, /£9\.00 in the United Kingdom/);
  assert.match(sentence, /US\$10\.00 in the United States/);
  assert.match(sentence, /A\$12\.00 in Australia/);
  assert.ok(!sentence.includes("≈"), "the price list must contain no converted figures");
});

test("the spread sentence labels its converted figures and skips redundant ones", () => {
  const cmp = compareMarkets(threeMarkets(), "USD");
  const sentence = marketSpreadSentence(cmp, "Test Card")!;
  assert.match(sentence, /cheapest in Australia at A\$12\.00 \(≈ US\$8\.00\)/);
  assert.match(sentence, /dearest in the United Kingdom at £9\.00 \(≈ US\$11\.39\)/);
  assert.match(sentence, /indicative only/, "a converted figure must never be presented unqualified");

  // When a market's own currency IS the comparison currency, "(≈ US$10.00)"
  // after "US$10.00" is noise — and worse, it reads as two different numbers.
  const audCompare = marketSpreadSentence(compareMarkets(threeMarkets(), "AUD"), "Test Card")!;
  assert.match(audCompare, /cheapest in Australia at A\$12\.00 and dearest/, "no redundant conversion of AUD into AUD");
  assert.ok(!/A\$12\.00 \(≈ A\$12\.00\)/.test(audCompare), "must not restate a figure in its own currency");
});

test("the visible block never sells a conversion as a price, or a gap as advice", () => {
  // The component is where this could go wrong for a real visitor, so the
  // disclaimer is asserted as a contract rather than left to survive a redesign.
  const src = read("src/components/CardMarketsTable.tsx");
  assert.match(src, /indicative conversion for comparison only/, "the converted column must be labelled");
  assert.match(src, /not a quote/, "and explicitly not presented as one");
  assert.match(src, /ship within their own market/, "domestic-only shipping must be stated");
  assert.match(src, /duty and\s+GST\/VAT aren&apos;t included/, "duty/VAT exclusion must be stated");
  // Two markets minimum, or the "Cheapest" chip is decorating an uncontested row.
  assert.match(src, /cmp\.quotes\.length < 2/, "a single-market card must render no comparison");
});

test("the card page's multi-currency FAQ is omitted rather than faked", () => {
  // Published as FAQPage JSON-LD. A card in one market cannot answer "what does
  // it cost in other currencies?" without inventing one from the hand-set rate
  // table, so the question is dropped instead.
  const page = read("src/app/card/[id]/page.tsx");
  assert.match(page, /currencyAnswer:\s*\n?\s*marketCmp\.quotes\.length > 1/, "the answer must be gated on a real comparison");
  assert.match(page, /\.filter\(\(f\) => f\.a\.length > 0\)/, "an unanswerable question must not reach the schema");
});
