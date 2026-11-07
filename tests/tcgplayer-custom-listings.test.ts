import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cheapestEnglishNm, cheapestEnglishSealed, englishNmLowest, englishAnyLowest, isQuotableListing, type TcgProduct } from "../src/lib/tcgplayer";

// Wrong-price report, 2026-11-07: Last Rites (SFD 150/221) showed TCGplayer at
// S$31.05 in Singapore, US$23. The three cheapest "English Near Mint" listings
// were sellers' CUSTOM photo listings of Chinese copies ("Chinese - Last Rites",
// "CHINESE", "CHINESE Last Rites - Spiritforged (SPF)"); the cheapest standard
// English listing was US$32.80. Live sample that day: 212 of 999 singles quoted
// a Chinese custom listing. Custom listings are never quoted.

const product = (listings: TcgProduct["listings"]): TcgProduct => ({
  productId: 665029,
  productName: "Last Rites",
  productUrlName: "last-rites",
  setUrlName: "spiritforged",
  productLineUrlName: "riftbound",
  setName: "Spiritforged",
  marketPrice: 33.15,
  lowestPrice: 23,
  foilOnly: false,
  sealed: false,
  customAttributes: { number: "150/221", rarityDbName: "Epic" },
  listings,
});

const nm = { languageId: 1, quantity: 2, condition: "Near Mint", printing: "Foil", shippingPrice: 0 };

test("the real report: Chinese custom listings at US$23 are skipped for the US$32.80 standard copy", () => {
  const p = product([
    { ...nm, price: 23, listingType: "custom" },
    { ...nm, price: 23.96, listingType: "custom" },
    { ...nm, price: 32.8, shippingPrice: 0.99, listingType: "standard" },
  ]);
  assert.equal(cheapestEnglishNm(p)?.price, 32.8);
  assert.equal(englishNmLowest(p), 32.8);
  assert.equal(englishAnyLowest(p), 32.8);
  assert.equal(cheapestEnglishSealed(p)?.price, 32.8);
});

test("only custom listings in the preview: no listing to quote (the row falls back to market price)", () => {
  const p = product([{ ...nm, price: 23, listingType: "custom" }]);
  assert.equal(cheapestEnglishNm(p), null);
  assert.equal(englishNmLowest(p), null);
});

test("a listing with no listingType is still quoted (older payloads)", () => {
  assert.equal(isQuotableListing({}), true);
  assert.equal(isQuotableListing({ listingType: "Custom" }), false);
  assert.equal(cheapestEnglishNm(product([{ ...nm, price: 30 }]))?.price, 30);
});

test("the search asks TCGplayer for standard listings only", () => {
  const src = readFileSync(join(__dirname, "..", "src", "lib", "tcgplayer.ts"), "utf8");
  assert.match(src, /language: \["English"\], listingType: "standard"/);
});
