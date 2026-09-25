import { test } from "node:test";
import assert from "node:assert/strict";
import { bestVariantPrice, type ShopifyVariant } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// The store verify pass (price-import.ts verifyCheapestListings) re-reads each
// card's cheapest row from its product.json. Until 2026-09-25 it could rewrite
// a played copy's row to a sold-out NM variant's price and leave "Heavily
// Played" on it, so the row lied on the card page and in any alert. Now the
// price and the condition are written together, a variant that says it is
// unavailable is skipped, and the verify pass only considers variants of the
// row's own condition rank (product.json often reports availability as null).
// ─────────────────────────────────────────────────────────────────────────────

const v = (title: string, price: string, available: boolean | null = true) => ({ title, price, available }) as ShopifyVariant;

test("best condition first, cheapest within it, with its own label", () => {
  assert.deepEqual(bestVariantPrice([v("Lightly Played", "9.00"), v("Near Mint", "12.00"), v("Near Mint", "11.50")]), {
    priceCents: 1150,
    condition: "Near Mint",
  });
  assert.deepEqual(bestVariantPrice([v("Default Title", "4.00")]), { priceCents: 400, condition: null });
});

test("a variant marked unavailable is never the price; unknown availability still counts", () => {
  assert.deepEqual(bestVariantPrice([v("Near Mint", "30.00", false), v("Heavily Played", "12.00")]), { priceCents: 1200, condition: "Heavily Played" });
  assert.deepEqual(bestVariantPrice([v("Near Mint", "30.00", null)]), { priceCents: 3000, condition: "Near Mint" });
  assert.equal(bestVariantPrice([v("Near Mint", "30.00", false)]), null);
  assert.equal(bestVariantPrice([v("Near Mint", "0")]), null);
});

test("the verify pass stays inside the row's own condition", () => {
  // The feed recorded the in-stock Heavily Played copy at A$12; product.json
  // reports availability as null for both. Without the rank filter the row
  // became A$30 — the sold-out NM price.
  const variants = [v("Near Mint", "30.00", null), v("Heavily Played", "12.50", null)];
  assert.deepEqual(bestVariantPrice(variants, { condition: "Heavily Played" }), { priceCents: 1250, condition: "Heavily Played" });
  assert.deepEqual(bestVariantPrice(variants, { condition: "Near Mint" }), { priceCents: 3000, condition: "Near Mint" });
  assert.equal(bestVariantPrice([v("Near Mint", "30.00")], { condition: "Lightly Played" }), null, "no variant of that rank: keep the feed price");
  assert.deepEqual(bestVariantPrice([v("Default Title", "5.00")], { condition: null }), { priceCents: 500, condition: null });
});
