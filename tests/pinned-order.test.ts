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
