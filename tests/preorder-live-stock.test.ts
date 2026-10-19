import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withLiveStock, shopifyProductJsUrl, LIVE_CHECKS_PER_GROUP } from "../src/lib/preorder-live-stock";
import type { SealedGroup } from "../src/lib/sealed-import";

// 2026-10-19 (owner, forwarding a buyer: "Your $119 is sold out"). The pre-order
// headline is re-checked at the store; DECISIONS.md, "Pre-order headlines are
// re-checked at the store".
const NOW = Date.parse("2026-10-19T00:00:00Z");
const seen = new Date(NOW - 3600_000).toISOString();
const row = (retailer: string, priceCents: number, inStock = true) => ({
  retailer,
  retailerName: retailer,
  priceCents,
  url: `https://${retailer}.example/products/radiance-box`,
  inStock,
  lastSeen: seen,
});
const group = (listings: SealedGroup["listings"]): SealedGroup => ({
  groupKey: "RAD|Booster Box",
  name: "Radiance Booster Box",
  productType: "Booster Box",
  setCode: "RAD",
  imageUrl: null,
  lowestPriceCents: Math.min(...listings.filter((l) => l.inStock).map((l) => l.priceCents)),
  storeCount: listings.filter((l) => l.inStock).length,
  msrpCents: null,
  atMsrp: false,
  overMsrpPct: null,
  firstSeenAt: null,
  listings,
});

test("a headline the store now calls sold out is dropped, and the next open offer leads", async () => {
  const g = group([row("vault", 11999), row("nerdz", 12997), row("ebay_us", 11000), row("closed", 10000, false)]);
  const [out] = await withLiveStock([g], async (url) => !url.includes("vault"), NOW);
  assert.equal(out.lowestPriceCents, 11000, "eBay is open and was never re-checked");
  assert.equal(out.listings.find((l) => l.retailer === "vault")!.inStock, false);
  assert.equal(out.storeCount, 2);
  const [stores] = await withLiveStock([group([row("vault", 11999), row("nerdz", 12997)])], async (url) => !url.includes("vault"), NOW);
  assert.equal(stores.lowestPriceCents, 12997);
});

test("one-way: an unclear answer, an error or an open answer never changes a row", async () => {
  const g = group([row("vault", 11999), row("nerdz", 12997)]);
  for (const answer of [null, true]) {
    const [out] = await withLiveStock([g], async () => answer, NOW);
    assert.equal(out, g, `${answer} leaves the group untouched`);
  }
  const reopen = group([row("gone", 9000, false), row("nerdz", 12997)]);
  const asked: string[] = [];
  await withLiveStock([reopen], async (url) => (asked.push(url), true), NOW);
  assert.ok(!asked.some((u) => u.includes("gone")), "a sold-out row is never asked, so it is never reopened");
});

test("only the cheapest few open store offers are asked, never a marketplace", async () => {
  const asked: string[] = [];
  const g = group([row("a", 1), row("b", 2), row("c", 3), row("d", 4), row("ebay_uk", 0), row("tcgplayer", 0), row("cardmarket", 0)]);
  await withLiveStock([g], async (url) => (asked.push(url), true), NOW);
  assert.equal(asked.length, LIVE_CHECKS_PER_GROUP);
  assert.deepEqual(asked.map((u) => new URL(u).hostname[0]), ["a", "b", "c"]);
});

test("the Shopify product endpoint is derived only from a product URL", () => {
  assert.equal(shopifyProductJsUrl("https://vaultgamestore.com/products/radiance-booster-display-radiance-711365"), "https://vaultgamestore.com/products/radiance-booster-display-radiance-711365.js");
  assert.equal(shopifyProductJsUrl("https://store.com/en-au/products/x?variant=1"), "https://store.com/products/x.js");
  assert.equal(shopifyProductJsUrl("https://store.com/collections/riftbound"), null);
  assert.equal(shopifyProductJsUrl("http://store.com/products/x"), null);
  assert.equal(shopifyProductJsUrl("not a url"), null);
});

test("every pre-order surface goes through it, and its cache is the pages' own six hours", () => {
  const src = readFileSync(join(__dirname, "../src/lib/sealed-import.ts"), "utf8");
  assert.match(src, /return withLiveStock\(all\.filter\(\(g\) => isPreorderSetCode\(g\.setCode\)\)\);/);
  const live = readFileSync(join(__dirname, "../src/lib/preorder-live-stock.ts"), "utf8");
  assert.match(live, /const REVALIDATE_S = 21600;/, "never under a page's revalidate (CLAUDE.md)");
});
