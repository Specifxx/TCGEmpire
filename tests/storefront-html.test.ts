import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pageCurrency, parseBigCommercePage, parseMoney, parseShopwarePage } from "../src/lib/storefront-html";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "storefront-html", name), "utf8");

test("money: a Stencil price with or without a currency code, never another currency", () => {
  assert.equal(parseMoney("699.95$ AUD", "AUD"), "699.95");
  assert.equal(parseMoney("3,096.00$ AUD", "AUD"), "3096.00");
  assert.equal(parseMoney("$24.99", "USD"), "24.99");
  assert.equal(parseMoney("£5.49", "GBP"), "5.49");
  assert.equal(parseMoney("699.95$ AUD", "USD"), null);
  assert.equal(parseMoney("", "USD"), null);
  assert.equal(parseMoney("$0.00", "USD"), null);
});

test("BigCommerce (Grand J Games, AU): title, AUD price, Add to Cart vs Out of stock, Shopify shape", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-grandj.html"), "AUD");
  assert.equal(got.length, 3);
  assert.equal(got[0].title, "Magic The Gathering - Reality Fracture Collector Booster Box");
  assert.deepEqual(got[0].variants, [{ title: "", price: "699.95", available: true }]);
  assert.equal(got[0].currency, "AUD");
  assert.equal(got[0].url, "https://grandjgames.com/195166337104/");
  assert.equal(got[0].handle, "/195166337104/");
  assert.equal(got[1].variants[0].available, false, "button--outstock");
  assert.equal(parseBigCommercePage(fixture("bigcommerce-grandj.html"), "USD").length, 0, "another market's currency is refused, never converted");
});

test("BigCommerce (Game Goblins, US): attributes before class, $ prices with no code", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-gamegoblins.html"), "USD");
  assert.equal(got.length, 2);
  assert.equal(got[0].title, "MtG: Assassin's Creed: Starter Kit");
  assert.equal(got[0].variants[0].price, "24.99");
  assert.equal(got[0].currency, null);
});

test("Shopware (Miniature Market, US): product boxes, buy button vs stock notify", () => {
  const got = parseShopwarePage(fixture("shopware-miniaturemarket.html"), "USD");
  assert.equal(got.length, 3);
  assert.equal(got[0].title, "MTG: The Hobbit - Sleeved Play Booster Pack");
  assert.equal(got[0].url, "https://www.miniaturemarket.com/MTG-The-Hobbit-Sleeved-Play-Booster-Pack/WOCD5659-PACK");
  assert.deepEqual(got[0].variants, [{ title: "", price: "4.99", available: true }]);
  assert.equal(got[2].variants[0].available, false, "stock-notify form, no buy button");
});

test("a grid drawn in the browser yields nothing, so the read fails instead of emptying the store", () => {
  assert.equal(parseBigCommercePage("<html><body><div class='productsGrid'></div></body></html>", "USD").length, 0);
  assert.equal(parseShopwarePage("<html><body></body></html>", "USD").length, 0);
  assert.equal(pageCurrency('<script type="application/ld+json">{"offers":{"priceCurrency":"GBP"}}</script>'), "GBP");
});
