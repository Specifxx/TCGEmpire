// The too-cheap guard on store singles (lib/price-sanity.ts, docs/store-vetting.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { implausiblyCheap } from "../src/lib/price-sanity";

test("a store price under a quarter of TCGplayer's market is dropped", () => {
  assert.equal(implausiblyCheap(400, "USD", 2000, "Near Mint"), true); // $4 vs $20
  assert.equal(implausiblyCheap(600, "USD", 2000, "Near Mint"), false); // $6 vs $20: a real deal
});

test("other currencies convert to USD first", () => {
  // A$5 is about US$3.3, under a quarter of $20
  assert.equal(implausiblyCheap(500, "AUD", 2000, null), true);
  assert.equal(implausiblyCheap(1500, "AUD", 2000, null), false);
});

test("bulk cards, unknown references and damaged copies are left alone", () => {
  assert.equal(implausiblyCheap(10, "USD", 150, null), false);
  assert.equal(implausiblyCheap(100, "USD", null, null), false);
  assert.equal(implausiblyCheap(300, "USD", 2000, "Damaged"), false);
  assert.equal(implausiblyCheap(300, "USD", 2000, "Heavily Played"), false);
  assert.equal(implausiblyCheap(300, "XYZ", 2000, null), false);
});

test("the store import applies it", () => {
  const src = readFileSync("src/lib/price-import.ts", "utf8");
  assert.match(src, /implausiblyCheap\(priceCents, currencyOf\(cc\), tcgUs\.get\(cardId\), condition\)/);
});
