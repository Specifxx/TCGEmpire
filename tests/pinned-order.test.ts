import test from "node:test";
import assert from "node:assert/strict";

import { pinMarketplaces, tcgplayerLeads } from "../src/lib/market-rows";

const row = (retailer: string, priceCents: number) => ({ retailer, priceCents });

test("the cheaper of the two pinned marketplaces goes on top, TCGplayer on a tie", () => {
  assert.equal(tcgplayerLeads(row("ebay", 500), row("tcgplayer", 450)), true);
  assert.equal(tcgplayerLeads(row("ebay", 450), row("tcgplayer", 450)), true);
  assert.equal(tcgplayerLeads(row("ebay", 400), row("tcgplayer", 450)), false);
});

test("a live TCGplayer row leads eBay's search row; no TCGplayer row never leads", () => {
  assert.equal(tcgplayerLeads(null, row("tcgplayer", 450)), true);
  assert.equal(tcgplayerLeads(row("ebay", 450), null), false);
  assert.equal(tcgplayerLeads(null, null), false);
});

test("pinMarketplaces keeps the rest in price order and reports the lead", () => {
  const prices = [row("store-a", 300), row("tcgplayer", 350), row("store-b", 360), row("ebay", 420)];
  const pin = pinMarketplaces(prices);
  assert.equal(pin.tcgFirst, true);
  assert.deepEqual(pin.rest.map((p) => p.retailer), ["store-a", "store-b"]);
  assert.equal(pinMarketplaces([row("ebay", 300), row("tcgplayer", 350)]).tcgFirst, false);
});

test("the sealed QuickView pins eBay and TCGplayer the same way, open rows only, eBay's search when there is no eBay row", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/SealedQuickView.tsx", import.meta.url), "utf8");
  assert.match(src, /pinMarketplaces\(listings\.filter\(\(l\) => offerStock\(l\) === "open"\)\)/);
  assert.match(src, /pin\.tcgFirst \? \[pin\.tcgplayer, pin\.ebay\] : \[pin\.ebay, pin\.tcgplayer\]/);
  assert.match(src, /\{!pin\.ebay && \(/);
  assert.match(src, /\{pinned && <ShownFirstTag \/>\}/);
  assert.match(src, /const isBest = l === best;/, "Best price stays on the real cheapest");
});
