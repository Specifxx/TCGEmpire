import test from "node:test";
import assert from "node:assert/strict";

import { bigCommerceInStock, parseProductPage } from "../src/lib/sealed-stores";

// ─────────────────────────────────────────────────────────────────────────────
// Owner report, 2026-10-15: "Game Nerdz is already sold out — they have a set
// restock notification — but it says checked two hours ago." Both halves were
// real. The "checked" time was honest: the importer DID read the page. What it
// read was the wrong field. A BigCommerce pre-order product states
// `offers.availability: https://schema.org/PreOrder` in its JSON-LD for as long
// as it is configured as a pre-order — the purchase MODE — while the stock lives
// in `var BCData = {"product_attributes":{"instock":false,...}}`, the object the
// storefront's own JS uses to disable the button. So every read re-confirmed
// "Pre-order open" for a box nobody could buy.
//
// The fixture below is the live page's shape, trimmed: the JSON-LD as served,
// BCData as served (instock:false, available_to_sell:0 — and purchasable:true,
// which is the product-level setting and must NOT be read as stock), and an
// HTML-escaped related-product blob of the kind the page also carries, which
// must not be mistaken for this product's data.
// ─────────────────────────────────────────────────────────────────────────────

const JSONLD_PREORDER = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Riftbound: League of Legends TCG: Radiance - Booster Box (PREORDER)","offers":{"@type":"Offer","price":"129.97","priceCurrency":"USD","availability" : "https://schema.org/PreOrder"}}</script>`;
const bcdata = (instock: boolean) =>
  `<script type="text/javascript">
var BCData = {"product_attributes":{"sku":"UVSRB05BD01","price":{"without_tax":{"formatted":"$129.97","value":129.97,"currency":"USD"}},"out_of_stock_behavior":"hide_option","out_of_stock_message":"Out of stock","instock":${instock},"available_to_sell":${instock ? 12 : 0},"purchasable":true,"purchasing_message":"The selected product combination is currently unavailable.","stock":null}};
</script>`;
// A related product's attributes, HTML-escaped inside a data attribute — with
// instock TRUE, to prove the reader never wanders into it.
const RELATED = `<div data-product='{&quot;id&quot;:332154,&quot;instock&quot;:true,&quot;out_of_stock_message&quot;:&quot;Out of stock&quot;}'></div>`;

test("BigCommerce: live inventory (BCData.instock) overrides a schema.org PreOrder", () => {
  const soldOut = JSONLD_PREORDER + bcdata(false) + RELATED;
  assert.equal(bigCommerceInStock(soldOut), false);
  const parsed = parseProductPage(soldOut);
  assert.equal(parsed?.available, false, "Game Nerdz's sold-out box must read as sold out");
  assert.equal(parsed?.priceCents, 12997, "price still comes from the page");
});

test("BigCommerce: an open pre-order still reads as open", () => {
  const open = JSONLD_PREORDER + bcdata(true) + RELATED;
  assert.equal(bigCommerceInStock(open), true);
  assert.equal(parseProductPage(open)?.available, true);
});

test("BigCommerce: purchasable:true is a product setting, never treated as stock", () => {
  // The sold-out page carried purchasable:true. Reading it would reintroduce the bug.
  assert.equal(bigCommerceInStock(bcdata(false)), false);
});

test("no BCData → schema.org still decides (Magento, other platforms, older pages)", () => {
  assert.equal(bigCommerceInStock(JSONLD_PREORDER), null);
  assert.equal(parseProductPage(JSONLD_PREORDER)?.available, true);
});

test("an unreadable BCData is NOT rescued by the JSON-LD PreOrder this fix proved is not stock", () => {
  // Review finding (2026-10-15): falling back to schema.org here would re-open
  // exactly the bug being fixed, on a page that is known to be BigCommerce.
  // null is "not evidence of stock", which the importer stores as not in stock.
  const broken = JSONLD_PREORDER + `<script>var BCData = {"product_attributes":{"instock":false,</script>`;
  assert.equal(bigCommerceInStock(broken), null);
  assert.equal(parseProductPage(broken)?.available, null);
  const noInstock = JSONLD_PREORDER + `<script>var BCData = {"product_attributes":{"sku":"X"}};</script>`;
  assert.equal(parseProductPage(noInstock)?.available, null, "BCData without an instock flag is unreadable too");
});

test("BigCommerce: purchasable:false vetoes, whatever the counts say", () => {
  const off = `<script>var BCData = {"product_attributes":{"instock":true,"available_to_sell":40,"purchasable":false}};</script>`;
  assert.equal(bigCommerceInStock(off), false);
});

test("BigCommerce: an UNLIMITED backorder allowance keeps the product open", () => {
  const unlimited = `<script>var BCData = {"product_attributes":{"instock":false,"available_to_sell":0,"available_for_backorder":0,"unlimited_backorder":true}};</script>`;
  assert.equal(bigCommerceInStock(unlimited), true);
});

test("the live Game Nerdz attributes still read as sold out under the full sellability rule", () => {
  // Exactly the six fields the page served on 2026-10-15.
  const live = `<script>var BCData = {"product_attributes":{"instock":false,"purchasable":true,"unlimited_backorder":false,"available_to_sell":0,"available_for_backorder":0,"available_on_hand":0}};</script>`;
  assert.equal(bigCommerceInStock(JSONLD_PREORDER + live), false);
  assert.equal(parseProductPage(JSONLD_PREORDER + live)?.available, false);
});

test("braces and quotes inside BCData strings do not break the read", () => {
  const tricky = `<script>var BCData = {"product_attributes":{"purchasing_message":"Sold {out} \\"now\\"","instock":false}};</script>`;
  assert.equal(bigCommerceInStock(tricky), false);
});

test("BigCommerce: a store still taking BACKORDERS reads as open, even with on-hand stock at 0", () => {
  const backorder = `<script>var BCData = {"product_attributes":{"instock":false,"available_to_sell":0,"available_for_backorder":24,"purchasable":true}};</script>`;
  assert.equal(bigCommerceInStock(backorder), true, "the button stays live while backorder allowance remains");
  const none = `<script>var BCData = {"product_attributes":{"instock":false,"available_for_backorder":0}};</script>`;
  assert.equal(bigCommerceInStock(none), false, "Game Nerdz's case: no backorder allowance → sold out");
});
