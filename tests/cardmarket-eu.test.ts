import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCsv, buildCardmarketRows, isCardmarketEnabled, EUR_TO_GBP } from "../src/lib/cardmarket";
import { CARDMARKET_EU_RETAILER, CARDMARKET_RETAILER, EU_FALLBACK_RETAILERS, isFallbackRetailer } from "../src/lib/constants";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Cardmarket is the EU market's only realistic reference price — and the one
// source whose figure needs NO conversion, because it quotes in euro and the EU
// market prices in euro. It stays flag-gated off pending a redisplay licence
// (see lib/cardmarket.ts's header); these tests pin the wiring so that when the
// flag flips, the first run is correct rather than exploratory.
// ─────────────────────────────────────────────────────────────────────────────

const CARDS = [
  { id: "card-vi", collectorNumber: "123/298", nameNormalized: "vipiltoverenforcer", name: "Vi, Piltover Enforcer" },
];
const PRODUCTS = parseCsv(
  `idProduct;Name;"Set Name";Number;Rarity\n612345;Vi, Piltover Enforcer;Origins;123/298;Rare\n`,
);

test("it stays OFF until someone resolves the licence", () => {
  assert.equal(isCardmarketEnabled(), false, "CARDMARKET_ENABLED must not default on");
  assert.match(
    read("src/lib/cardmarket.ts"),
    /LEGAL GATE/,
    "the licence gate must stay documented at the top of the module",
  );
});

test("it must never impersonate a browser to get past the block", () => {
  // cardmarket.com returns a hard Cloudflare 403 to automated clients. Sending a
  // fake Chrome User-Agent to defeat that is circumventing an access control the
  // operator deliberately put up, and the module used to carry exactly such a
  // header. The supported route is a human downloading the published files.
  const src = read("src/lib/cardmarket.ts");
  assert.doesNotMatch(src, /User-Agent[^\n]*Chrome/i, "no browser impersonation in the Cardmarket fetch path");
  assert.match(src, /cardmarket\.com\/Data\/Download/, "the supported download route must be documented in-file");
});

test("the EU row is NATIVE euro — no FX between Cardmarket and the shopper", () => {
  const prices = parseCsv(`idProduct;low\n612345;3.15\n`);
  const { rows } = buildCardmarketRows(CARDS, PRODUCTS, prices);
  const eu = rows.find((r) => r.retailer === CARDMARKET_EU_RETAILER)!;
  assert.ok(eu, "an EU row must be written");
  assert.equal(eu.country, "EU");
  assert.equal(eu.currency, "EUR");
  assert.equal(eu.priceCents, 315, "the EU price must be the euro figure verbatim, unconverted");
});

test("the UK row stays a converted reference, and the two never collide", () => {
  const prices = parseCsv(`idProduct;low\n612345;3.15\n`);
  const { rows } = buildCardmarketRows(CARDS, PRODUCTS, prices);
  const uk = rows.find((r) => r.retailer === CARDMARKET_RETAILER)!;
  assert.equal(uk.country, "UK");
  assert.equal(uk.currency, "GBP");
  assert.equal(uk.priceCents, Math.round(3.15 * EUR_TO_GBP * 100));
  // RetailerPrice is uniquely keyed on [cardId, retailer, condition, isFoil] with
  // NO country. One shared retailer key for both markets would collide and keep
  // whichever row was written last — silently dropping a whole market.
  assert.notEqual(CARDMARKET_RETAILER, CARDMARKET_EU_RETAILER);
});

test("both are reference sources, never buyable stores", () => {
  // A marketplace aggregate across many sellers must never undercut a real
  // store's in-stock listing for the headline "from" price.
  assert.ok(isFallbackRetailer(CARDMARKET_RETAILER));
  assert.ok(isFallbackRetailer(CARDMARKET_EU_RETAILER));
  assert.ok(EU_FALLBACK_RETAILERS.includes(CARDMARKET_EU_RETAILER));
});

test("both of Cardmarket's published column vocabularies parse", () => {
  // Cardmarket ships the same data as a CSV with long headers ("Low Price") and
  // a JSON guide with short keys ("low"). The contract cannot be verified from
  // here — the site 403s every automated client — so both are accepted. Reading
  // neither is how a first real run writes zero rows and looks like "no matches".
  for (const header of ["low", "Low Price", "Low"]) {
    const prices = parseCsv(`idProduct;${header}\n612345;3.15\n`);
    const { rows, matched } = buildCardmarketRows(CARDS, PRODUCTS, prices);
    assert.equal(matched, 1, `price column "${header}" must be understood`);
    assert.equal(rows.find((r) => r.country === "EU")!.priceCents, 315);
  }
});

test("LOW wins over the averages — this is a lowest-price site", () => {
  // Trend/Avg are averages over time. Preferring one would quietly turn the
  // comparison into an average-price one while still calling it "from".
  const prices = parseCsv(`idProduct;low;trend;avg\n612345;3.15;9.99;8.88\n`);
  const { rows } = buildCardmarketRows(CARDS, PRODUCTS, prices);
  assert.equal(rows.find((r) => r.country === "EU")!.priceCents, 315);
});

test("a missing price column is REPORTED, not silently skipped", () => {
  // The original code `continue`d before the unmatched counter, so a wrong column
  // name produced "0 matched, 0 unmatched" — indistinguishable from a clean run
  // that found nothing. This is how the first dry-run failed.
  const prices = parseCsv(`idProduct;SomethingElse\n612345;3.15\n`);
  const { matched, unmatchedSamples } = buildCardmarketRows(CARDS, PRODUCTS, prices);
  assert.equal(matched, 0);
  assert.ok(unmatchedSamples.length > 0, "an unreadable price column must surface in the samples");
  assert.match(unmatchedSamples[0], /NO PRICE COLUMN/);
});
