import { test } from "node:test";
import assert from "node:assert/strict";
import { bestVariantPrice, verifyOutcome, type ShopifyVariant } from "../src/lib/price-import";

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

// 2026-11-25, a Premium member's Best Basket: Level Up Games MD's Sprite Fountain
// (TCGplayer market US$5.86) sat "in stock" at US$0.99 "Near Mint Foil" for two
// weeks and the store's checkout said sold out. The feed had recorded an
// in-stock copy; this pass re-picked the cheapest same-rank variant from
// product.json, which has no availability at all, and landed on a sold-out one.
const iv = (id: number, title: string, price: string, available?: boolean) => ({ id, title, price, ...(available === undefined ? {} : { available }) }) as ShopifyVariant;
const ROW = { url: "https://levelupgamesmd.com/products/sprite-fountain-078-219-rftb3?variant=111111", priceCents: 650, condition: "Near Mint" };

test("verify reads ONLY the row's own variant: a cheaper sold-out sibling never replaces it", () => {
  const variants = [iv(111111, "Near Mint", "6.50"), iv(222222, "Near Mint Foil", "0.99")];
  assert.deepEqual(verifyOutcome(ROW, variants), { kind: "keep" });
});

test("verify corrects the own variant's price, keeping its condition", () => {
  assert.deepEqual(verifyOutcome(ROW, [iv(111111, "Near Mint", "5.75"), iv(222222, "Near Mint Foil", "0.99")]), {
    kind: "price",
    priceCents: 575,
    condition: "Near Mint",
  });
});

test("verify takes the row out of stock when its variant is gone or says sold out", () => {
  assert.deepEqual(verifyOutcome(ROW, [iv(222222, "Near Mint Foil", "0.99")]), { kind: "gone" });
  assert.deepEqual(verifyOutcome(ROW, [iv(111111, "Near Mint", "6.50", false)]), { kind: "gone" });
});

test("verify never writes a price the too-cheap guard refuses, on either path", () => {
  const guard = (cents: number) => cents < 150;
  assert.deepEqual(verifyOutcome(ROW, [iv(111111, "Near Mint", "0.99")], guard), { kind: "keep" });
  const noVariant = { ...ROW, url: "https://x.example/products/sprite" };
  assert.deepEqual(verifyOutcome(noVariant, [iv(1, "Near Mint", "0.99")], guard), { kind: "keep" });
  assert.deepEqual(verifyOutcome(noVariant, [iv(1, "Near Mint", "6.00")], guard), { kind: "price", priceCents: 600, condition: "Near Mint", variantId: 1 });
});
