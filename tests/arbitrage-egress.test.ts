import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// getCrossRegionGaps was the one fully-uncached full-catalogue read this
// session's Neon network-transfer review found: a plain `prisma.card.findMany`
// with no `take`, re-run on every single request to /tools/deal-finder's
// cross-region tab (that page is `force-dynamic` with no ISR/unstable_cache
// anywhere above it). It, and the file's eBay/TCGplayer-US pulls, were first
// bounded by a per-instance globalThis memo, then (2026-08-24) moved to the
// SHARED Next data cache via cachedOrDirect — day-keyed and CONTENT_TAG-busted,
// so one pull per home market per day is shared across every lambda instance
// instead of one per warm instance. These tests pin that shared-cache shape.
// ─────────────────────────────────────────────────────────────────────────────

const ARBITRAGE = "src/lib/arbitrage.ts";

test("the deal-finder cross-region tab has no PAGE-level caching layer of its own", () => {
  // The bounding now lives inside the lib (cachedOrDirect), not on the page. This
  // still pins that the page itself stays force-dynamic with no unstable_cache —
  // if that changes, the two cache layers interact and this should be revisited.
  const page = read("src/app/tools/deal-finder/page.tsx");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /unstable_cache/);
});

test("getCrossRegionGaps's full-catalogue read is shared-cached, not per-request", () => {
  const src = read(ARBITRAGE);
  assert.match(src, /function computeCrossRegionRows\(homeCountry: Country\)/);
  // Shared Next data cache (cachedOrDirect) keyed by home market + Sydney day —
  // one pull per market per day across all instances, busted on import via
  // CONTENT_TAG. NOT a per-instance globalThis memo (which only dedupes within one
  // warm lambda, so every cold instance re-pulled the whole catalogue).
  assert.match(src, /return cachedOrDirect\(async \(\) => \{/);
  assert.match(src, /\["arb-xregion-rows", homeCountry, sydneyDayKey\(\)\]/);
  assert.match(src, /revalidate: 172800, tags: \[CONTENT_TAG\]/);
  assert.doesNotMatch(src, /xRegionRowsMemo/, "the per-instance globalThis memo must be gone");
  // The exported function must call the cached helper, not run its own findMany.
  const exported = src.slice(src.indexOf("export async function getCrossRegionGaps"));
  assert.match(exported, /await computeCrossRegionRows\(homeCountry\)/);
  assert.doesNotMatch(exported, /prisma\.card\.findMany/, "the full-catalogue query must live only in the cached helper");
});

test("the cache key is per-country, so one market's fetch can't serve another's prices", () => {
  const src = read(ARBITRAGE);
  // homeCountry is in the cache key, so each market caches independently.
  assert.match(src, /\["arb-xregion-rows", homeCountry, sydneyDayKey\(\)\]/);
  // The eBay pull is likewise keyed by (country, retailer); TCG-US is market-neutral.
  assert.match(src, /\["arb-ebay-rows", country, ebayKey, sydneyDayKey\(\)\]/);
});
