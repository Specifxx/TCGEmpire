import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGradedVariant } from "../src/lib/condition";
import { bestVariantPrice } from "../src/lib/price-import";

test("a graded slab variant never prices the raw card (OP Compare, 2026-11-19)", () => {
  // Real variants of one store product: the cheaper slab used to win as "NM".
  assert.equal(
    bestVariantPrice([
      { id: 1, title: "Graded - Beckett 9.5", price: "115.00", available: true },
      { id: 2, title: "Near Mint", price: "344.00", available: true },
    ])?.priceCents,
    34400,
  );
  assert.equal(bestVariantPrice([{ title: "PSA 10", price: "50.00", available: true }]), null);
  for (const t of ["Graded - Beckett 9.5", "PSA 10", "BGS 9.5 Black Label", "CGC 9", "Slab", "TAG 10", "SGC 10", "ACE Grading 10"]) assert.ok(isGradedVariant(t), t);
  for (const t of ["Near Mint", "Lightly Played", "Default Title", "Near Mint / Foil", "Good"]) assert.ok(!isGradedVariant(t), t);
});

test("the Shopify store pass skips slab variants too", () => {
  const src = readFileSync(join(__dirname, "../src/lib/price-import.ts"), "utf8");
  assert.match(src, /const priced = p\.variants\.filter\(\(v\) => parseFloat\(v\.price\) > 0 && !isGradedVariant\(v\.title\)\)/);
});
