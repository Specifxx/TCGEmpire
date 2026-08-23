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
// anywhere above it). Fixed to reuse the same in-memory memoization pattern
// this file already uses for its eBay/TCGplayer US pulls.
// ─────────────────────────────────────────────────────────────────────────────

const ARBITRAGE = "src/lib/arbitrage.ts";

test("the deal-finder cross-region tab has no caching layer of its own", () => {
  // Pins the PREMISE of the fix below: if this page ever gains ISR/unstable_cache,
  // the in-memory memoization stops being the only thing bounding this query and
  // this test (not the fix) should be revisited.
  const page = read("src/app/tools/deal-finder/page.tsx");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /unstable_cache/);
});

test("getCrossRegionGaps's full-catalogue read is memoized, not per-request", () => {
  const src = read(ARBITRAGE);
  assert.match(src, /async function computeCrossRegionRows\(homeCountry: Country\)/);
  // Same TTL + globalThis-Map pattern as the file's existing eBay/TCG memos —
  // survives hot-module-reload in dev, shared across warm lambda invocations.
  assert.match(src, /xRegionRowsMemo\.get\(homeCountry\)/);
  assert.match(src, /Date\.now\(\) - hit\.at < ARB_MEMO_TTL_MS/);
  assert.match(src, /xRegionRowsMemo\.set\(homeCountry,/);
  // The exported function must call the memoized helper, not run its own findMany.
  const exported = src.slice(src.indexOf("export async function getCrossRegionGaps"));
  assert.match(exported, /await computeCrossRegionRows\(homeCountry\)/);
  assert.doesNotMatch(exported, /prisma\.card\.findMany/, "the full-catalogue query must live only in the memoized helper");
});

test("the memo key is per-country, so one market's fetch can't serve another's prices", () => {
  const src = read(ARBITRAGE);
  assert.match(src, /XRegionRowsMemo = Map<Country,/);
});
