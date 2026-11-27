import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSquarespaceConsent, parseSquarespacePage } from "../src/lib/squarespace";
import { SEALED_ONLY_SHOPIFY } from "../src/lib/sealed-stores";
import { RETAILERS } from "../src/lib/retailers";

const BASE = "https://shop.example";

// The newer variant shape: priceMoney / salePriceMoney and stock { quantity, unlimited }.
const MODERN = {
  websiteSettings: { storeSettings: { selectedCurrency: "GBP" } },
  items: [
    {
      title: "Riftbound: Spiritforged Booster Display",
      fullUrl: "/shop/p/riftbound-spiritforged-booster-display",
      assetUrl: "https://images.squarespace-cdn.com/box.png",
      structuredContent: {
        variants: [{ priceMoney: { currency: "GBP", value: "104.99" }, onSale: false, stock: { quantity: 3, unlimited: false } }],
      },
    },
    {
      title: "Riftbound Origins Booster Pack &amp; Promo",
      fullUrl: "/shop/p/origins-pack",
      structuredContent: {
        variants: [
          { priceMoney: { currency: "GBP", value: "5.50" }, salePriceMoney: { currency: "GBP", value: "4.99" }, onSale: true, stock: { quantity: 0, unlimited: false }, attributes: { Qty: "1" } },
        ],
      },
    },
    { title: "Gift card", fullUrl: "/shop/p/gift", structuredContent: { variants: [] } },
  ],
  pagination: { nextPage: true, nextPageOffset: 1700000000000, nextPageUrl: "/shop/other-tcgs/riftbound?offset=1700000000000" },
};

// The older shape: minor units, qtyInStock / unlimited, currency only in the site settings.
const LEGACY = {
  website: { baseCurrency: "GBP" },
  items: [
    { title: "Riftbound Champion Deck", fullUrl: "/shop/p/deck", structuredContent: { variants: [{ price: 1999, qtyInStock: 0, unlimited: true }] } },
  ],
  pagination: { nextPage: false },
};

test("Squarespace (newer shape): title, sale price, stock, absolute URL, next page", () => {
  const got = parseSquarespacePage(MODERN, BASE);
  assert.equal(got.storeCurrency, "GBP");
  assert.equal(got.products.length, 2, "a product with no priced variant is dropped");
  assert.deepEqual(got.products[0].variants, [{ title: "", price: "104.99", available: true }]);
  assert.equal(got.products[0].url, `${BASE}/shop/p/riftbound-spiritforged-booster-display`);
  assert.equal(got.products[0].currency, "GBP");
  assert.equal(got.products[1].title, "Riftbound Origins Booster Pack & Promo");
  assert.deepEqual(got.products[1].variants, [{ title: "1", price: "4.99", available: false }], "the sale price, sold out");
  assert.equal(got.next, "/shop/other-tcgs/riftbound?offset=1700000000000");
});

test("Squarespace (older shape): minor units, unlimited stock, last page", () => {
  const got = parseSquarespacePage(LEGACY, BASE);
  assert.equal(got.storeCurrency, "GBP");
  assert.deepEqual(got.products[0].variants, [{ title: "", price: "19.99", available: true }]);
  assert.equal(got.products[0].currency, null);
  assert.equal(got.next, null);
});

test("Squarespace: a page that is not a shop JSON yields nothing", () => {
  assert.deepEqual(parseSquarespacePage({}, BASE), { products: [], next: null, storeCurrency: null });
  assert.deepEqual(parseSquarespacePage(null, BASE).products, []);
});

test("Squarespace stores are read only with the owner's recorded written consent", () => {
  assert.equal(hasSquarespaceConsent({}), false);
  assert.equal(hasSquarespaceConsent({ squarespaceConsent: "yes" }), false, "a placeholder is not a record");
  const stores = [...Object.values(RETAILERS), ...SEALED_ONLY_SHOPIFY].filter((s) => s.platform === "squarespace");
  assert.ok(stores.length >= 1);
  for (const s of stores) {
    assert.ok(hasSquarespaceConsent(s), `${s.key}: squarespace store without squarespaceConsent`);
    assert.ok((s.sealedCollections ?? []).length > 0, `${s.key}: no shop paths`);
  }
});
