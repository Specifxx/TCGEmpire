import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tcgQuote, TCG_US, TCG_US_MARKET, TCG_UK } from "../src/lib/tcgplayer";

// ─────────────────────────────────────────────────────────────────────────────
// S2 (alerts audit, 2026-09-25). The US "tcgplayer" row is the one TCGplayer
// row treated as buyable. With no English Near-Mint listing in stock it fell
// back to TCGplayer's MARKET aggregate and was still written inStock: true,
// condition NM — so a freshly revealed card's presale market figure set
// lowestPriceCentsUs and emailed US watchers "now in stock" at a price nobody
// could check out at. It is now written inStock: false (the card page keeps a
// figure; the market price lives in tcgplayer_market anyway).
// ─────────────────────────────────────────────────────────────────────────────

const listing = { price: 3.2, shippingPrice: 1.49 };

test("the buyable row quotes the listing, in stock, with its own postage", () => {
  assert.deepEqual(tcgQuote(TCG_US, 5, listing), { price: 3.2, shippingCents: 149, inStock: true });
});

test("no English NM listing: the row quotes the last-sold market price, IN stock", () => {
  // Owner, 2026-10-02: "if we can't get the lowest English card from TCGplayer
  // … use the last sold TCGplayer price". Until then this row was written out
  // of stock and disappeared from the comparison.
  assert.deepEqual(tcgQuote(TCG_US, 4.2, null), { price: 4.2, shippingCents: null, inStock: true });
  assert.deepEqual(tcgQuote(TCG_UK, 4.2, null), { price: 4.2, shippingCents: null, inStock: true });
  assert.deepEqual(tcgQuote(TCG_US, null, null), { price: null, shippingCents: null, inStock: false });
});

test("reference rows quote market price, falling back to the listing, and buyable rows quote the listing", () => {
  assert.deepEqual(tcgQuote(TCG_US_MARKET, 5, listing), { price: 5, shippingCents: null, inStock: true });
  assert.deepEqual(tcgQuote(TCG_US_MARKET, null, listing), { price: 3.2, shippingCents: 149, inStock: true });
  // UK is a buyable row since 2026-10-02: it quotes the cheapest English NM listing.
  const uk = tcgQuote(TCG_UK, 5, listing);
  assert.equal(uk.price, 3.2);
  assert.equal(uk.inStock, true);
});

test("the importer writes the quote's stock flag, and flags cloned promo rows as derived", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/tcgplayer.ts"), "utf8");
  assert.match(src, /const \{ price, shippingCents, inStock \} = tcgQuote\(mkt, market, cheapestEnglishNm\(p\)\);/);
  assert.match(src, /inStock: b\.inStock,/);
  assert.doesNotMatch(src, /inStock: true,\n\s*\}\);/, "no hardcoded in-stock row write");
  assert.match(src, /if \(baseBest\) best\.set\(promoSlot, \{ \.\.\.baseBest, derived: true \}\);/);
  assert.match(src, /\.\.\.\(b\.derived \? \{ derived: true \} : \{\}\),/);
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const model = schema.slice(schema.indexOf("model RetailerPrice {"), schema.indexOf("model RetailerPrice {") + 3000);
  assert.match(model, /\n\s*derived\s+Boolean\?\n/, "additive and nullable");
});
