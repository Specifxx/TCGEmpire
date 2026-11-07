import test from "node:test";
import assert from "node:assert/strict";

import { PIN_OUTLINE, pinMarketplaces, rowOutline, tcgplayerLeads } from "../src/lib/market-rows";

const row = (retailer: string, priceCents: number) => ({ retailer, priceCents });

test("eBay always leads, TCGplayer never goes above it (owner, 2026-11-06: eBay on the very top)", () => {
  assert.equal(tcgplayerLeads(row("ebay", 500), row("tcgplayer", 450)), false);
  assert.equal(tcgplayerLeads(row("ebay", 450), row("tcgplayer", 450)), false);
  assert.equal(tcgplayerLeads(null, row("tcgplayer", 450)), false);
  assert.equal(tcgplayerLeads(null, null), false);
});

test("pinMarketplaces keeps the rest in price order, eBay on top", () => {
  const prices = [row("store-a", 300), row("tcgplayer", 350), row("store-b", 360), row("ebay", 420)];
  const pin = pinMarketplaces(prices);
  assert.equal(pin.tcgFirst, false);
  assert.equal(pin.ebay?.retailer, "ebay");
  assert.deepEqual(pin.rest.map((p) => p.retailer), ["store-a", "store-b"]);
});

test("the sealed QuickView pins eBay and TCGplayer the same way, open rows only, eBay's search when there is no eBay row", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/SealedQuickView.tsx", import.meta.url), "utf8");
  assert.match(src, /pinMarketplaces\(listings\.filter\(\(l\) => offerStock\(l\) === "open"\)\)/);
  assert.match(src, /pin\.tcgFirst \? \[pin\.tcgplayer, pin\.ebay\] : \[pin\.ebay, pin\.tcgplayer\]/);
  assert.match(src, /\{!pin\.ebay && \(/);
  assert.doesNotMatch(src, /Shown ?First/, "no wording about the order (owner, 2026-10-30)");
  assert.match(src, /const isBest = l === best;/, "Best price stays on the real cheapest");
});

test("the cheapest row wears its own outline, distinct from eBay's and Amazon's (owner, 2026-11-07)", () => {
  assert.equal(rowOutline({ cheapest: true, ebay: false }), PIN_OUTLINE.cheapest);
  assert.equal(rowOutline({ cheapest: false, ebay: true }), PIN_OUTLINE.ebay);
  assert.equal(rowOutline({ cheapest: true, ebay: true }), PIN_OUTLINE.cheapest);
  assert.equal(rowOutline({ cheapest: false, ebay: false }), "");
  assert.notEqual(PIN_OUTLINE.cheapest, PIN_OUTLINE.ebay);
  assert.notEqual(PIN_OUTLINE.cheapest, PIN_OUTLINE.amazon);
});
