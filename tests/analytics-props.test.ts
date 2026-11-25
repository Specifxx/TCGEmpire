import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { forVercel, VERCEL_MAX_PROPS } from "../src/lib/analytics";

// Vercel drops an event with more than 16 properties whole (probe events, 2026-11-20). DECISIONS.md, 2026-11-20.

test("Vercel never gets more than 16 properties, and the buy_click keys the reads group by survive", () => {
  assert.equal(VERCEL_MAX_PROPS, 16);
  // The card-row buy_click as OutboundLink built it on 20 Nov: 21 keys.
  const click: Record<string, string | number | boolean> = {
    dock_arm: "", ad_look: "b", cart_arm: "off", top_arm: "pair", ebay_btn: "b", ebay_pop: "pop", link_type: "product",
    retailer: "ebay_us", country: "US", kind: "single", card_id: "c1", card_name: "Vex", price: 20.99, position_in_list: 2,
    page_type: "card_detail", in_stock: true, variant: "nonfoil", condition: "NM", surface: "modal", entry: "reddit",
    campaign: "x", transport_type: "beacon",
  };
  const out = forVercel(click)!;
  assert.ok(Object.keys(out).length <= 16, `${Object.keys(out).length} keys`);
  for (const k of ["surface", "retailer", "page_type", "ad_look", "cart_arm", "top_arm", "ebay_pop", "entry", "card_name", "country"]) assert.ok(k in out, k);
  const small = { a: 1, b: 2 };
  assert.equal(forVercel(small), small, "a small event passes through untouched");
});

test("trackEvent sends Vercel the trimmed copy; every key in a buy_click call is in the drop list or fits", () => {
  const src = readFileSync("src/lib/analytics.ts", "utf8");
  assert.match(src, /vercelTrack\(name, forVercel\(cleaned\)\)/);
});
