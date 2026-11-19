import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_PAGE_STORES, SEALED_ONLY_SHOPIFY, productPageReplaceScope } from "../src/lib/sealed-stores";
import { RETAILER_LIST } from "../src/lib/retailers";
import { titleGroupKey } from "../src/lib/sealed-import";

// 2026-11-19: the product-page pass deleted every row of its store, so Miniature
// Market's category read (~24 products, shopware) was wiped by its one product
// page every run. A store read both ways now only replaces the groups its pages read.

const categoryKeys = new Set<string>([...RETAILER_LIST, ...SEALED_ONLY_SHOPIFY].map((s) => s.key));

test("a store also read by category keeps its other rows", () => {
  assert.ok(categoryKeys.has("miniaturemarket"), "Miniature Market's category is read (shopware)");
  assert.deepEqual(productPageReplaceScope("miniaturemarket", ["RAD|Booster Box", "LGC|Booster Box"], categoryKeys), {
    retailer: "miniaturemarket",
    groupKey: { in: ["RAD|Booster Box", "LGC|Booster Box"] },
  });
});

test("a pages-only store still replaces all its rows", () => {
  assert.ok(!categoryKeys.has("gamenerdz"));
  assert.deepEqual(productPageReplaceScope("gamenerdz", ["RAD|Booster Box"], categoryKeys), { retailer: "gamenerdz" });
});

test("every product-page store that is also a category store is scoped", () => {
  for (const s of PRODUCT_PAGE_STORES) {
    const scope = productPageReplaceScope(s.key, ["X|Y"], categoryKeys);
    assert.equal(!!scope.groupKey, categoryKeys.has(s.key), s.key);
    for (const u of s.productUrls) assert.ok(u.startsWith(s.base + "/"), `${s.key}: ${u} is on its own host`);
  }
});

test("Game Nerdz's Gift of the Rift pre-order page lands on the bundle's one page", () => {
  const gn = PRODUCT_PAGE_STORES.find((s) => s.key === "gamenerdz");
  assert.ok(gn?.productUrls.some((u) => /gift-of-the-rift-bundle/.test(u)), "the bundle's page is read (releases 4 Dec)");
  // Its page title on 19 Nov 2026.
  assert.equal(titleGroupKey("Riftbound: League of Legends TCG: Gift of the Rift Bundle (Preorder)"), "giftoftheriftbundle");
});
