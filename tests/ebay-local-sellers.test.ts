// eBay rows come from sellers local to the buyer, with postage eBay states (visitor feedback on WargameCompare,
// 2026-10-31: overseas sellers' postage made eBay rows "a lot of wasted clicks").
import { test } from "node:test";
import assert from "node:assert/strict";
import { endUserContext, locationFilters, postageStated, sellerIsLocal } from "../src/lib/ebay";

test("the search asks for delivery to the market and, on single-country sites, local sellers", () => {
  assert.deepEqual(locationFilters("EBAY_AU"), ["deliveryCountry:AU", "itemLocationCountry:AU"]);
  assert.deepEqual(locationFilters("EBAY_GB"), ["deliveryCountry:GB", "itemLocationCountry:GB"]);
  assert.deepEqual(locationFilters("EBAY_ES"), ["deliveryCountry:ES"], "eBay Spain stands for the EU: EU sellers are kept after the search");
  assert.deepEqual(locationFilters("EBAY_SG"), ["deliveryCountry:SG"], "eBay Singapore has almost no local sellers");
  assert.deepEqual(locationFilters("EBAY_US", true), ["deliveryCountry:US"], "a regional printing is sold from its own region");
});

test("a seller elsewhere is dropped; any EU seller serves the EU", () => {
  const at = (country?: string) => ({ itemLocation: country ? { country } : undefined });
  assert.ok(sellerIsLocal(at("AU"), "EBAY_AU"));
  assert.ok(!sellerIsLocal(at("CN"), "EBAY_AU"));
  assert.ok(!sellerIsLocal(at("US"), "EBAY_CA"));
  assert.ok(sellerIsLocal(at("FR"), "EBAY_ES") && !sellerIsLocal(at("GB"), "EBAY_ES"));
  assert.ok(sellerIsLocal(at("CN"), "EBAY_US", true), "a Chinese printing from a seller in China");
  assert.ok(sellerIsLocal(at(), "EBAY_US"), "no location given: the search already asked");
});

test("postage must be stated, and the buyer's location is sent so eBay states it", () => {
  assert.ok(postageStated({ shippingOptions: [{ shippingCost: { value: "0.00" } }] }), "free counts");
  assert.ok(postageStated({ shippingOptions: [{ shippingCost: { value: "4.50" } }] }));
  assert.ok(!postageStated({ shippingOptions: [{ shippingCostType: "CALCULATED" }] }));
  assert.ok(!postageStated({}));
  assert.match(endUserContext("EBAY_AU"), /contextualLocation=country%3DAU%2Czip%3D2000$/);
});
