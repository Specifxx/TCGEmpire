import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { clickMixDims, clickMixKey, gapBucket, parseMixKey, positionBucket, summariseMix } from "../src/lib/click-mix";

// The click mix (2026-11-17, DECISIONS.md "Click mix by market"): closed-set
// buckets in Counter rows, never a row per click, never request text as a key.

test("buckets: position and gap", () => {
  assert.deepEqual(["1", "2", "3", "4", "9", "0", "x", null].map((v) => positionBucket(v)), ["1", "2", "3", "4+", "4+", "na", "na", "na"]);
  assert.deepEqual(["-3", "0", "1", "8", "9", "20", "21", "", "abc"].map((v) => gapBucket(v)), ["0", "0", "1-8", "1-8", "9-20", "9-20", "21+", "na", "na"]);
});

test("a forged beacon can only land on the fixed grid", () => {
  const d = clickMixDims({ retailer: "ebay_us", country: "zz:evil", paid: "0", page: "../../x", position: "99", gap: "1e9" });
  assert.ok(d);
  assert.equal(d.country, "other");
  assert.equal(d.page, "other");
  assert.equal(d.pos, "4+");
  assert.equal(d.gap, "21+");
  assert.equal(d.paid, true, "an eBay link always pays");
  assert.equal(clickMixDims({ retailer: "", country: "AU" }), null);
  assert.equal(clickMixDims({ retailer: "cherry", country: "au", page: "pokemon_set" })?.page, "pokemon");
  assert.equal(clickMixDims({ retailer: "cherry" })?.paid, false);
  assert.equal(clickMixDims({ retailer: "cherry", paid: "1" })?.paid, true);
});

test("key round-trips and the summary gives each market's paid share", () => {
  const rows = [
    { retailer: "cherry", country: "AU", paid: "0", page: "card_detail", position: "1", gap: "0" },
    { retailer: "cherry", country: "AU", paid: "0", page: "card_detail", position: "2", gap: "5" },
    { retailer: "ebay_au", country: "AU", page: "card_detail", position: "3", gap: "5" },
    { retailer: "tcgplayer", country: "US", page: "card_detail", position: "1", gap: "0" },
    { retailer: "ebay_us", country: "US", page: "sealed" },
  ].flatMap((i) => {
    const d = clickMixDims(i)!;
    const r = parseMixKey(clickMixKey("2026-11-17", d), 1);
    assert.ok(r);
    assert.deepEqual({ ...r, n: undefined, day: undefined }, { ...d, n: undefined, day: undefined });
    return [r];
  });
  const [au, us] = summariseMix(rows);
  assert.equal(au.country, "AU");
  assert.equal(au.clicks, 3);
  assert.equal(au.paid, 1);
  assert.equal(au.unpaidStore, 2);
  assert.equal(au.paidWithin8, 1);
  assert.equal(us.paidShare, 1);
  assert.equal(us.firstRowShare, 1);
});

test("the beacon route and the link stay wired, and no ClickEvent row is written", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/click/route.ts"), "utf8");
  assert.match(route, /countClickMix/);
  assert.doesNotMatch(route, /dbHistory|clickEvent\./i);
  const link = readFileSync(join(process.cwd(), "src/components/OutboundLink.tsx"), "utf8");
  assert.match(link, /cheapestPrice/);
});
