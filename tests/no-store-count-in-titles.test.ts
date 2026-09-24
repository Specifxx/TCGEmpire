import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { homeTitle, regionHomeTitle } from "../src/lib/seo";

// ─────────────────────────────────────────────────────────────────────────────
// "No store count goes in a page title" — DECISIONS.md, 2026-09-21. Two
// independent generation runs over the six country buying guides proposed
// different counts for the same pages, a direct RETAILER_LIST count gave a
// third set, and the figures already in the titles matched none of them,
// because "stores we track" and "stores with a live listing right now" are not
// the same number and a title cannot say which it means.
//
// That was recorded as prose, which is why it nearly got undone the next day:
// a homepage title reading "Compare 168 Stores" was written, gated and queued
// to deploy before the entry was found. A number in a title is a claim that has
// to survive every crawl, delisting and new retailer. This turns the decision
// into a guard.
//
// Singapore is the one documented exception: the article body, RETAILER_LIST,
// both generation runs and docs/seo-keyword-map.md all agree on 11. That
// agreement is the bar — if a future count clears it, add it here explicitly
// rather than loosening the pattern.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const STORE_COUNT = /\b\d+\s+(?:stores?|retailers?|shops?)\b/i;
const DOCUMENTED_EXCEPTIONS = new Set(["riftbound-price-comparison-singapore"]);

test("no article title claims a store count, except the one that cleared the bar", () => {
  const offenders = getArticles()
    .filter((a) => !DOCUMENTED_EXCEPTIONS.has(a.slug) && STORE_COUNT.test(a.title))
    .map((a) => `${a.slug}: ${a.title}`);
  assert.deepEqual(offenders, [], `store counts are back in article titles:\n  ${offenders.join("\n  ")}`);
});

test("no route title claims a store count", () => {
  // The region home titles are built by one helper, so it is checked directly
  // rather than per page.
  const files = [
    "src/app/page.tsx",
    "src/app/stores/page.tsx",
    "src/app/stores/tracked/page.tsx",
    "src/lib/seo.ts",
  ];
  for (const f of files) {
    for (const m of read(f).matchAll(/title: (?:\{ absolute: )?[`"]([^`"]+)[`"]/g)) {
      assert.ok(!STORE_COUNT.test(m[1]), `${f} puts a store count in a title: "${m[1]}"`);
    }
  }
  // …and not via interpolation either, which is how the near-miss was written.
  assert.ok(
    !/title[^\n]*\$\{[^}]*RETAILER_LIST\.length/.test(read("src/app/page.tsx")),
    "the homepage title must not interpolate the tracked-store count",
  );
});

test("the market homepage titles quote a LIVE in-stock store count, derived, never typed", () => {
  // REVERSED 2026-09-24 by the owner's growth-pass brief, which asks for "live
  // counts" in these six titles. The 2026-09-21/22 objection was ambiguity —
  // "stores we track" vs "stores with a live listing" — and that is answered by
  // saying which: the count is stores with an IN-STOCK listing in that market
  // (home-stats liveStoresByCountry), recomputed hourly, and a zero or failed
  // read drops the number rather than printing one. Articles and every other
  // route stay count-free (the tests above).
  assert.equal(homeTitle(172), "Riftbound Card Prices: Live Price Guide, 172 Stores + eBay");
  assert.equal(regionHomeTitle("AU", 28), "Riftbound Card Prices Australia: Compare 28 AU Stores");
  for (const n of [null, 0]) {
    assert.ok(!STORE_COUNT.test(homeTitle(n)), homeTitle(n));
    assert.ok(!STORE_COUNT.test(regionHomeTitle("UK", n)), regionHomeTitle("UK", n));
  }
  for (const r of ["AU", "UK", "CA", "SG", "EU"] as const) {
    for (const n of [5, 88, 150]) {
      const t = regionHomeTitle(r, n);
      assert.ok(t.startsWith("Riftbound Card Prices"), t);
      assert.ok(t.length <= 60, `${t} is ${t.length} chars`);
    }
  }
  const meta = read("src/lib/home-metadata.ts");
  assert.match(meta, /homeTitle\(stats\?\.liveStoresAll\)/);
  assert.match(meta, /stores: stats\?\.liveStoresByCountry\?\.\[region\]/);
  assert.doesNotMatch(read("src/lib/seo.ts") + meta, /RETAILER_LIST\.length/, "never the tracked-store count");
  assert.match(read("src/lib/home-stats.ts"), /where: \{ inStock: true, NOT: \{ retailer: \{ startsWith: "ebay" \} \} \}/);
});
