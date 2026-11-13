// Site review X2 (2026-11-10): the payload cuts on the homepage and the card page keep what is drawn.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packedStoreUrl, rowStoreUrl, withoutUtm } from "../src/lib/market-rows";
import { topDealsForGrid, type TopDeals } from "../src/lib/top-deals";

const read = (p: string) => readFileSync(p, "utf8");

test("a store URL left out of a card row is rebuilt exactly, and kept whenever it cannot be", () => {
  const store = "https://tcgclubhouse.myshopify.com/products/astral-heron-044-166-ven";
  const tagged = `${store}?utm_source=riftcompare&utm_medium=referral&utm_campaign=card`;
  assert.equal(packedStoreUrl(store, tagged), undefined);
  assert.equal(rowStoreUrl({ buyHref: tagged }), store);
  const variant = "https://shop.example/products/x?variant=123";
  const taggedVariant = `${variant}&utm_source=riftcompare&utm_medium=referral&utm_campaign=card`;
  assert.equal(packedStoreUrl(variant, taggedVariant), undefined);
  assert.equal(rowStoreUrl({ buyHref: taggedVariant }), variant);
  // An affiliate link is not the store URL plus tags: the URL travels.
  const ebay = "https://www.ebay.com/itm/1";
  assert.equal(packedStoreUrl(ebay, "https://www.ebay.com/itm/1?mkevt=1&campid=5339155912"), ebay);
  // Untagged (buyHref is the URL itself) keeps it too, and an explicit null is respected.
  assert.equal(packedStoreUrl(store, store), store);
  assert.equal(rowStoreUrl({ buyHref: tagged, storeUrl: null }), null);
  assert.equal(withoutUtm("not a url"), null);
});

test("Today's Top Deals gets only the columns it draws", () => {
  const d = { savingsVsMarket: [1], priceDrops: [2], risingCards: [3], cheapestSealed: [4], cheapestOnEbay: [5], hasAny: true } as unknown as TopDeals;
  const g = topDealsForGrid(d);
  assert.deepEqual([g.savingsVsMarket, g.priceDrops, g.risingCards], [[1], [2], [3]]);
  assert.deepEqual([g.cheapestSealed, g.cheapestOnEbay], [[], []]);
  assert.doesNotMatch(read("src/components/TodaysTopDeals.tsx"), /cheapestSealed|cheapestOnEbay/, "if the grid draws them again, stop stripping them");
});

test("the homepage has no sealed shelf (owner, 2026-11-13) and a plain sealed tile opens no quick view", () => {
  assert.doesNotMatch(read("src/app/page.tsx"), /HomeSealedShelf|getSealedGroups/);
  assert.match(read("src/components/SealedTile.tsx"), /if \(!quickView\) return;/);
});
