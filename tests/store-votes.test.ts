import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTrusted, parseStoreVote, shapeTally, storeKey } from "../src/lib/store-votes/core";
import { voteCorsHeaders, voteSiteForOrigin } from "../src/lib/store-votes/origin";
import { shown, storeKey as clientStoreKey } from "../src/components/StoreVote";

// Store thumbs up and down, one tally for every site (owner, 2026-11-06).
// DECISIONS.md, "Store thumbs up and down, one tally for every site".

test("a store is its host without www, the same on the server and in the browser", () => {
  for (const f of [storeKey, clientStoreKey]) {
    assert.equal(f("https://www.CherryCollectables.com.au/products/x?y=1"), "cherrycollectables.com.au");
    assert.equal(f("https://us.althea.kr/products/a"), "us.althea.kr");
    assert.equal(f("bemusedkorea.com"), "bemusedkorea.com");
    // eBay and Amazon rows are full price rows with thumbs (owner, 2026-11-06), one tally per domain
    assert.equal(f("https://www.ebay.com/itm/1"), "ebay.com");
    assert.equal(f("https://rover.ebay.co.uk/x"), "ebay.co.uk");
    assert.equal(f("https://www.amazon.com.au/dp/x"), "amazon.com.au");
    assert.equal(f("https://smile.amazon.com/dp/x"), "amazon.com");
    assert.equal(f("https://www.tcgplayer.com/product/1"), null);
    assert.equal(f("https://www.awin1.com/cread.php?x"), null, "an affiliate redirect is never a store");
    assert.equal(f("javascript:alert(1)"), null);
    assert.equal(f("https://localhost/"), null);
    assert.equal(f(null), null);
  }
});

test("a vote is a known host, 1, -1 or 0, and a browser id", () => {
  assert.deepEqual(parseStoreVote({ store: "example.com", vote: 1, vid: "a".repeat(32) }), { kind: "ok", store: "example.com", vote: 1, vid: "a".repeat(32) });
  assert.equal(parseStoreVote({ store: "example.com", vote: 0, vid: "a".repeat(32) }).kind, "ok");
  assert.equal(parseStoreVote({ store: "example.com", vote: 2, vid: "a".repeat(32) }).kind, "error");
  assert.equal(parseStoreVote({ store: "Example.com", vote: 1, vid: "a".repeat(32) }).kind, "error");
  assert.equal(parseStoreVote({ store: "ebay.com", vote: 1, vid: "a".repeat(32) }).kind, "ok");
  assert.equal(parseStoreVote({ store: "rover.ebay.com", vote: 1, vid: "a".repeat(32) }).kind, "error", "one tally per eBay domain");
  assert.equal(parseStoreVote({ store: "tcgplayer.com", vote: 1, vid: "a".repeat(32) }).kind, "error");
  assert.equal(parseStoreVote({ store: "example.com", vote: 1, vid: "short" }).kind, "error");
  assert.equal(parseStoreVote({ store: "x".repeat(90) + ".com", vote: 1, vid: "a".repeat(32) }).kind, "error");
  assert.equal(parseStoreVote(null).kind, "error");
});

test("the public tally is counts only, most voted first, capped", () => {
  const t = shapeTally(
    [
      { store: "a.com", vote: 1, count: 2 },
      { store: "a.com", vote: -1, count: 1 },
      { store: "b.com", vote: 1, count: 9 },
      { store: "BAD HOST", vote: 1, count: 5 },
    ],
    new Date("2026-11-06T00:00:00Z"),
    5,
  );
  assert.deepEqual(t, { at: "2026-11-06T00:00:00.000Z", stores: { "b.com": [9, 0], "a.com": [2, 1] } });
  assert.deepEqual(Object.keys(shapeTally([{ store: "a.com", vote: 1, count: 1 }, { store: "b.com", vote: 1, count: 2 }], new Date(), 1).stores), ["b.com"]);
  assert.equal(isTrusted([3, 0]), true);
  assert.equal(isTrusted([2, 0]), false, "too few votes");
  assert.equal(isTrusted([4, 2]), false, "under 80%");
});

test("the browser adds its own vote only while the tally predates it", () => {
  assert.deepEqual(shown([5, 1], { v: 1, at: 200, p: 0 }, 100), [6, 1]);
  assert.deepEqual(shown([5, 1], { v: 1, at: 50, p: 0 }, 100), [5, 1], "the tally already counts it");
  assert.deepEqual(shown([5, 1], { v: -1, at: 200, p: 1 }, 100), [4, 2], "a changed vote moves");
  assert.deepEqual(shown([0, 0], { v: 0, at: 200, p: 1 }, 100), [0, 0], "never below zero");
  assert.deepEqual(shown(undefined, undefined, 0), [0, 0]);
});

test("only the family's own https origins may vote; the GET is public and cached six hours", () => {
  assert.equal(voteSiteForOrigin("https://riftcompare.com"), "riftcompare");
  assert.equal(voteSiteForOrigin("https://www.riftcompare.com"), "riftcompare");
  assert.equal(voteSiteForOrigin("https://kaeyoung.com"), "kaeyoung");
  assert.equal(voteSiteForOrigin("https://riftcompare.com.evil.example"), null);
  assert.equal(voteSiteForOrigin("http://riftcompare.com"), null);
  assert.equal(voteSiteForOrigin(null), null);
  assert.deepEqual(voteCorsHeaders("https://evil.example"), { Vary: "Origin" });
  const route = readFileSync("src/app/api/store-votes/route.ts", "utf8");
  assert.match(route, /s-maxage=21600/);
  assert.match(route, /MAX_VOTERS_PER_IP_PER_STORE/);
  assert.doesNotMatch(route, /ipHash:\s*ip\b|voter:\s*p\.vid/, "only keyed hashes are stored");
  const read = readFileSync("src/lib/store-votes/read.ts", "utf8");
  assert.match(read, /groupBy\(\{ by: \["store", "vote"\]/, "the public tally reads counts only, never the hashes");
});
