import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isPurchaseLocked } from "../src/lib/sealed-stores";
import { RETAILERS } from "../src/lib/retailers";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Thistle Tavern: in-store only, shown as open (2026-10-15). A live audit of
// every Radiance pre-order we showed as open found two Thistle Tavern rows
// (Booster Box/Case, Vault) that no online buyer could order: "In-store purchase
// only", no buy button, a disabled variant input. Shopify's products.json said
// available=true and schema.org said InStock, so nothing the importer read could
// see it — the ONLY signal is the theme's own markup on the main product block:
// <product-info id="MainProduct-…" data-instore-only="true" data-purchase-locked="true">.
// The orderable pages on the same store carry data-purchase-locked="false".
// ─────────────────────────────────────────────────────────────────────────────

// The live tag's shape, trimmed: it spans lines in that theme.
const mainTag = (locked: boolean, instore = locked) => `<product-info id="MainProduct-template--30341781586294__main"
  class="section-template--30341781586294__main-padding gradient color-scheme-1"
  data-section="template--30341781586294__main" data-product-id="15806370742646"
  data-instore-only="${instore}" data-purchase-locked="${locked}">`;

test("the in-store-only main block reads as locked", () => {
  assert.equal(isPurchaseLocked(mainTag(true) + `<product-form data-purchase-locked="true">`), true);
});

test("an orderable main block on the same theme does not", () => {
  assert.equal(isPurchaseLocked(mainTag(false) + `<product-form data-purchase-locked="false">`), false);
});

test("either flag alone is enough", () => {
  assert.equal(isPurchaseLocked(mainTag(false, true)), true, "data-instore-only on its own");
  assert.equal(isPurchaseLocked(mainTag(true, false)), true, "data-purchase-locked on its own");
});

test("a locked RELATED/quick-add card never locks the product on the URL", () => {
  const html =
    mainTag(false) +
    `<product-info id="QuickAdd-template--1__related-123" data-purchase-locked="true" data-instore-only="true">`;
  assert.equal(isPurchaseLocked(html), false);
});

test("a page with no such theme is never locked (the check is opt-in and one-way)", () => {
  assert.equal(isPurchaseLocked(`<html><button name="add">Add to cart</button></html>`), false);
  assert.equal(isPurchaseLocked(""), false);
});

test("Thistle Tavern is opted in; the check is wired one-way into the sealed import", () => {
  assert.equal(RETAILERS.thistletavern.purchaseLockPages, true);
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /if \(scraped && store\.purchaseLockPages && rows\.size\)/, "only for opted-in stores, only after a good read");
  assert.match(src, /if \(html && isPurchaseLocked\(html\)\) \{\s*row\.inStock = false;/, "a lock only ever turns a row OFF");
  assert.doesNotMatch(src, /row\.inStock = true/, "nothing in this pass may mark a row in stock");
  assert.match(src, /if \(!row\.inStock \|\| !allowed\(new URL\(row\.url\)\.pathname\)\) continue;/, "robots.txt honoured, sold-out rows not re-read");
  assert.match(src, /await sleep\(REQUEST_DELAY_MS\)/);
});
