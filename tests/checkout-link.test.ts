import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCheckoutLink, isShopify, shopifyCartUrl, withShopifyVariant, withoutShopifyVariant } from "../src/lib/checkout-link";
import { affiliateUrl } from "../src/lib/affiliate";
import { bestVariantPrice } from "../src/lib/price-import";

const PRODUCT = "https://www.cherrycollectables.com.au/products/jinx-rebel";
const ID = 44123456789012;

test("the importer's variant pick is still the product page, and only for a real variant id", () => {
  assert.equal(withShopifyVariant(PRODUCT, ID), `${PRODUCT}?variant=${ID}`);
  assert.equal(withShopifyVariant(PRODUCT, undefined), PRODUCT, "no id (another platform's adapter) → unchanged");
  assert.equal(withShopifyVariant(PRODUCT, 12), PRODUCT, "not a Shopify id");
  assert.equal(withShopifyVariant("https://shop.example/producto/jinx/", ID), "https://shop.example/producto/jinx/", "not a /products/ URL");
  assert.equal(withoutShopifyVariant(`${PRODUCT}?variant=${ID}`), PRODUCT, "the verify pass reads <url>.json without it");
  assert.ok(isShopify({}), "a store without a platform is Shopify");
  assert.ok(!isShopify({ platform: "woocommerce" }));
});

test("a product URL with the variant becomes the store's cart permalink", () => {
  assert.equal(shopifyCartUrl(`${PRODUCT}?variant=${ID}`), `https://www.cherrycollectables.com.au/cart/${ID}:1`);
  // A market subfolder stays, so the checkout is in the market's currency.
  assert.equal(shopifyCartUrl(`https://store.example/en-au/products/x?variant=${ID}`), `https://store.example/en-au/cart/${ID}:1`);
  // Other parameters are kept.
  assert.equal(shopifyCartUrl(`${PRODUCT}?variant=${ID}&utm_source=riftcompare`), `https://www.cherrycollectables.com.au/cart/${ID}:1?utm_source=riftcompare`);
  assert.equal(shopifyCartUrl(PRODUCT), null, "no variant → the product page");
  assert.equal(shopifyCartUrl(`${PRODUCT}?variant=abc`), null);
  assert.equal(shopifyCartUrl(`https://www.tcgplayer.com/product/1?variant=${ID}`), null);
});

test("affiliateUrl: an untracked Shopify store row opens checkout, tagged; the rest keep the product page", () => {
  const out = affiliateUrl(`${PRODUCT}?variant=${ID}`, "cherry", "/card/jinx");
  const u = new URL(out);
  assert.equal(u.pathname, `/cart/${ID}:1`);
  assert.equal(u.searchParams.get("utm_source"), "riftcompare");
  assert.equal(u.searchParams.get("utm_campaign"), "card");
  assert.equal(u.searchParams.get("utm_content"), "checkout");
  assert.ok(isCheckoutLink(out));
  // No variant (sold out, another platform, an old row) → product page as before.
  assert.equal(new URL(affiliateUrl(PRODUCT, "cherry", "/card/jinx")).pathname, "/products/jinx-rebel");
  // Emails and callers that say no keep the product page (with the variant picked).
  for (const out2 of [affiliateUrl(`${PRODUCT}?variant=${ID}`, "cherry", "/email-alert-drop"), affiliateUrl(`${PRODUCT}?variant=${ID}`, "cherry", "/card/x", { checkout: false })]) {
    const v = new URL(out2);
    assert.equal(v.pathname, "/products/jinx-rebel");
    assert.equal(v.searchParams.get("variant"), String(ID));
    assert.ok(!isCheckoutLink(out2));
  }
  // eBay and TCGplayer are never rewritten to a cart.
  assert.ok(!isCheckoutLink(affiliateUrl("https://www.ebay.com/itm/123", "ebay_us", "/card/x")));
  assert.ok(!isCheckoutLink(affiliateUrl("https://www.tcgplayer.com/product/1", "tcgplayer", "/card/x")));
});

test("a store with its own programme (Awin, a partner ref) is returned before the cart rewrite", () => {
  const src = readFileSync(new URL("../src/lib/affiliate.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function affiliateUrl("));
  const direct = body.indexOf("if (direct) return direct;");
  const awin = body.indexOf("if (awin) return awin;");
  const cart = body.indexOf("shopifyCartUrl(plain)");
  assert.ok(direct > 0 && awin > direct && cart > awin, "partner and Awin links must win over checkout: their tracking runs on the store's pages");
  const api = readFileSync(new URL("../src/lib/public-api.ts", import.meta.url), "utf8");
  assert.match(api, /affiliateUrl\(p\.url, p\.retailer, pageUrl, \{ checkout: false \}\)/);
});

test("Amazon keeps its tagged item page", () => {
  assert.ok(!isCheckoutLink(affiliateUrl("https://www.amazon.com/dp/B0ABCDEFGH", "amazon_sealed", "/sealed/x")));
});

test("the verify pass knows which variant it priced", () => {
  const v = bestVariantPrice([
    { id: 1000001, title: "Lightly Played", price: "3.00", available: true },
    { id: 1000002, title: "Near Mint", price: "4.00", available: true },
  ]);
  assert.equal(v?.variantId, 1000002);
  assert.equal(bestVariantPrice([{ title: "Near Mint", price: "4.00", available: true }])?.variantId, undefined);
});

test("clicks are tagged checkout or product, and counted apart", () => {
  const link = readFileSync(new URL("../src/components/OutboundLink.tsx", import.meta.url), "utf8");
  assert.match(link, /link_type: checkout \? "checkout" : "product"/);
  assert.match(link, /&t=checkout/);
  const route = readFileSync(new URL("../src/app/api/click/route.ts", import.meta.url), "utf8");
  assert.match(route, /countClick\("checkout"\)/);
});
