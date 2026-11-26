import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Search Recovery, 2026-11-26: the facet pages (/cards/type|rarity|printing/*) lead with a readable price
// table of their most valuable cards, ABOVE the grid, and the eBay block stays below our own content.
test("facet pages: price table sits before the grid, eBay after both", () => {
  const src = fs.readFileSync("src/components/FacetPageBody.tsx", "utf8");
  const table = src.indexOf('id="facet-price-table"');
  const grid = src.indexOf("<CardTile key={c.id}");
  const ebay = src.indexOf("<EbayBuyCta");
  assert.ok(table > 0, "price table present");
  assert.ok(table < grid, "price table renders before the grid");
  assert.ok(grid < ebay, "the eBay block stays below our own content");
  assert.match(src, /PRICE_TABLE_ROWS = 10/);
  assert.doesNotMatch(src.slice(table - 1500, grid), /lastKnown/, "never a last-known price in the table");
});
