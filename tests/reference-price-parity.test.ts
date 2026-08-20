import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_FALLBACK_RETAILERS, isFallbackRetailer } from "../src/lib/constants";
import { TCG_US, TCG_UK, TCG_SG, TCG_AU, TCG_CA } from "../src/lib/tcgplayer";
import { COUNTRY_LIST } from "../src/lib/country";

const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

const priceImport = read("src/lib/price-import.ts");
const cards = read("src/lib/cards.ts");

// ─────────────────────────────────────────────────────────────────────────────
// The WRITER must ask the same question as the READER.
// ─────────────────────────────────────────────────────────────────────────────
// constants.ts states the rule and lists where it applies — including "the
// lowestPriceCents* columns (price-import.ts)". computeMarket() enforces it on
// the read side with isFallbackRetailer(), which is country-agnostic. The
// importer enforced it by hand-listing AU/SG/UK arrays per market, and that
// asymmetry is what broke: CA was left with no exclusion at all, under a comment
// asserting "CA has no converted-reference source of its own (no tcgplayer_ca)".
// By then refreshTcgplayerPrices() was looping TCG_CA and writing a converted
// tcgplayer_ca row for essentially the whole catalogue.
//
// The visible result was a contradiction between two pages: /browse and the
// "cheapest cards" strip showed "from C$X" for a card whose page then reported no
// Canadian listings at all, because the tile read lowestPriceCentsCa (polluted)
// while the page read computeMarket() (clean). Where a card DID have real CA
// stock, an FX-converted USD figure could undercut every real listing, so the
// price that earned the click was one no store would honour.
//
// constants.ts already warned about exactly this: "Use this union rather than
// hand-listing the per-market arrays. Three call sites did the latter and every
// one of them was missing a market by the time CA was added." price-import.ts was
// one of them. These tests pin the parity rather than the individual market.

const lowestBlock = () => {
  const at = priceImport.indexOf("const [pricedAuReal");
  assert.ok(at >= 0, "the lowest-price groupBy block moved — re-derive this test");
  const end = priceImport.indexOf("]);", at);
  assert.ok(end > at, "could not find the end of the groupBy block");
  return priceImport.slice(at, end);
};

test("every market's lowest-price query excludes converted reference rows", () => {
  const block = lowestBlock();
  const queries = [...block.matchAll(/country:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...queries].sort(),
    ["AU", "CA", "SG", "UK", "US"],
    "expected exactly one lowest-price query per tracked market"
  );
  // Split on the per-market `country:` markers so each query is checked alone —
  // one market keeping the exclusion must not cover for another dropping it.
  const parts = block.split(/(?=prisma\.retailerPrice\.groupBy)/).filter((p) => /country:/.test(p));
  assert.equal(parts.length, 5, "expected five separable groupBy calls");
  for (const part of parts) {
    const country = /country:\s*"(\w+)"/.exec(part)![1];
    assert.match(
      part,
      /retailer:\s*\{\s*notIn:\s*\[\.\.\.ALL_FALLBACK_RETAILERS\]\s*\}/,
      `${country}'s lowest-price query does not exclude reference rows — a converted ` +
        `price will set lowestPriceCents${country} and be advertised as a "from" price ` +
        `the card page then refuses to show as a store`
    );
  }
});

test("the importer uses the shared union, not per-market lists", () => {
  // A hand-listed subset is how CA was missed; naming the union is what makes a
  // newly added market safe by default rather than by remembering.
  for (const name of ["AU_FALLBACK_RETAILERS", "SG_FALLBACK_RETAILERS", "UK_FALLBACK_RETAILERS", "CA_FALLBACK_RETAILERS"]) {
    assert.doesNotMatch(
      lowestBlock(),
      new RegExp(`\\[\\.\\.\\.${name}\\]`),
      `the lowest-price block hand-lists ${name}; use ALL_FALLBACK_RETAILERS`
    );
  }
});

test("the card tile's store count excludes reference rows too", () => {
  const at = cards.indexOf("_count:");
  assert.ok(at >= 0, "cardTileSelect's _count moved — re-derive this test");
  const count = cards.slice(at, at + 400);
  assert.match(
    count,
    /retailer:\s*\{\s*notIn:\s*\[\.\.\.ALL_FALLBACK_RETAILERS\]\s*\}/,
    'the tile promises a number of BUYABLE stores. Counting reference rows made ' +
      'every AU/UK/SG/CA tile claim one store more than the card page could show'
  );
  assert.match(count, /inStock:\s*true/, "out-of-stock rows must still be excluded");
});

// ─────────────────────────────────────────────────────────────────────────────
// The facts the above depends on, asserted so they cannot drift silently.
// ─────────────────────────────────────────────────────────────────────────────

test("tcgplayer_ca is real, produced, and classified as a reference", () => {
  // The stale comment claimed the opposite, and the importer believed it.
  assert.equal(TCG_CA.country, "CA");
  assert.equal(TCG_CA.currency, "CAD");
  assert.ok(isFallbackRetailer(TCG_CA.retailer), `${TCG_CA.retailer} must be a reference, not a store`);
});

test("every non-US TCGplayer market is a reference; the US one is a real store", () => {
  for (const m of [TCG_UK, TCG_SG, TCG_AU, TCG_CA]) {
    assert.ok(isFallbackRetailer(m.retailer), `${m.country}: ${m.retailer} must be excluded from comparisons`);
  }
  assert.ok(
    !isFallbackRetailer(TCG_US.retailer),
    "TCGplayer IS a buyable store in the US — excluding it there would blank the baseline market"
  );
});

test("every tracked market is covered by the union", () => {
  // If a market is added with no reference key registered, the write side above
  // still runs but silently protects nothing for it.
  const covered = new Set(ALL_FALLBACK_RETAILERS.map((r) => r.replace(/^tcgplayer_?/, "").toUpperCase()));
  for (const c of COUNTRY_LIST) {
    if (c.code === "US") continue; // US TCGplayer is a real store, by design
    assert.ok(
      covered.has(c.code) || c.code === "UK",
      `${c.code} has no reference retailer registered in ALL_FALLBACK_RETAILERS`
    );
  }
});
