import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECOMMISSIONED_RETAILERS, RETAILERS, STORE_ROWS_MAX_AGE_H } from "../src/lib/retailers";

// See DECISIONS.md, "A store fell off the site because one request failed",
// 2026-09-23. Three ways a store's rows could be wrong on a card page, each
// seen in the same store-health audit:
//   1. one failed request replaced a healthy store's rows with a partial set
//      (Wolf Den 640 -> 0, Hobbiesville US 1,172 -> 1);
//   2. a store that stopped answering kept its rows forever (E4 Cards, 202h);
//   3. a store removed from RETAILERS would keep them forever too.

const stripComments = (src: string) =>
  src.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const importer = stripComments(readFileSync(join(process.cwd(), "src/lib/price-import.ts"), "utf8"));

const between = (from: string, to: string) => {
  const a = importer.indexOf(from);
  assert.ok(a >= 0, `${from} moved — re-derive this test`);
  const b = importer.indexOf(to, a + from.length);
  assert.ok(b > a, `${to} not found after ${from}`);
  return importer.slice(a, b);
};

test("fetchCollection reports a failed read separately from an empty one", () => {
  const body = between("async function fetchCollection(", "function bestVariantPrice");
  assert.match(body, /failed:\s*boolean/, "the return type must carry `failed`");
  // A 404 is an answer (the conventional BinderPOS handles 404 on most stores),
  // so it must NOT count as a failure — otherwise every store would be skipped.
  assert.match(body, /if \(res\.status !== 404\) failed = true;/);
  assert.match(body, /rate-limited \(429[^;]*;\s*failed = true;/s, "a 429 is a failed read");
  assert.match(body, /non-JSON[^;]*;\s*failed = true;/s, "an HTML challenge page is a failed read");
  assert.match(body, /attempt < 2/, "one retry before giving up");
});

test("a failed read of a known collection skips the store instead of publishing a partial set", () => {
  const body = between("async function fetchShopifyStoreProducts(", "async function fetchWooStoreProducts(");
  assert.match(body, /if \(failed && configured\.has\(handle\)\)\s*\{[\s\S]*?return \[\];/);
  // Only discovered + configured handles count — a conventional BinderPOS handle
  // the store has never had must not be able to veto the whole store.
  assert.match(body, /const configured = new Set\(\[\.\.\.discovered, \.\.\.\(store\.collections \?\? \[\]\)\]\)/);
});

test("a store with no products has rows past the age limit expired, not kept forever", () => {
  const body = between("if (!products.length) {", "await prisma.retailerPrice.deleteMany({ where: { retailer: store.key } });");
  assert.match(body, /retailer: store\.key, lastSeen: \{ lt: new Date\(Date\.now\(\) - STORE_ROWS_MAX_AGE_H \* 3600_000\) \}/);
  // Above store-health's 30h stale alert, so the alert fires before data goes.
  assert.ok(STORE_ROWS_MAX_AGE_H > 30 && STORE_ROWS_MAX_AGE_H <= 96, `unexpected STORE_ROWS_MAX_AGE_H=${STORE_ROWS_MAX_AGE_H}`);
});

test("decommissioned stores are purged before the store loop, card and sealed rows both", () => {
  const purgeAt = importer.indexOf("DECOMMISSIONED_RETAILERS.length");
  const loopAt = importer.indexOf("for (const store of RETAILER_LIST)");
  assert.ok(purgeAt >= 0 && loopAt > purgeAt, "the purge must run, and run before the loop");
  const body = importer.slice(purgeAt, loopAt);
  assert.match(body, /prisma\.retailerPrice\.deleteMany\(\{ where \}\)/);
  assert.match(body, /prisma\.sealedListing\.deleteMany\(\{ where \}\)/);
});

test("a decommissioned store is gone from RETAILERS", () => {
  for (const key of DECOMMISSIONED_RETAILERS) {
    assert.equal(RETAILERS[key], undefined, `${key} is decommissioned but still tracked — its rows would be purged and re-written every run`);
  }
  assert.ok(DECOMMISSIONED_RETAILERS.includes("e4cards"));
});
