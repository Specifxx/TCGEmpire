import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PAGE = "src/app/tools/demand/page.tsx";
const LIB = "src/lib/demand.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Demand Finder: the public Premium tool built from /admin/demand's own
// leaderboard (most-searched / most-viewed cards, real traffic — not a derived
// buy signal like Rising Cards). New feature, so these pin the design rather
// than guard against a regression from a prior state.
// ─────────────────────────────────────────────────────────────────────────────

test("Demand Finder gates on Premium, not merely on an account", () => {
  const src = read(PAGE);
  assert.match(src, /isPremium\(/, `${PAGE} must gate via isPremium()`);
  assert.ok(!/hasAccount\s*\(/.test(src), `${PAGE} must not gate on hasAccount()`);
});

test("Demand Finder shows a real one-row teaser to non-Premium visitors, not a blank paywall", () => {
  // Same "top pick free" pattern as Value Finder / Rising Cards — a locked wall
  // with nothing behind it converts worse and gives crawlers nothing to index.
  const src = read(PAGE);
  assert.match(src, /!premium && !ADSENSE_REVIEW_MODE/, "must branch on premium, with the AdSense-review escape hatch every other screener has");
  assert.match(src, /rank=\{1\}/, "the teaser row must render a real #1 pick");
  assert.match(src, /blur-\[5px\]/, "locked preview rows must be visually blurred, not simply absent");
});

test("Demand Finder is registered everywhere a Premium tool is expected to be", () => {
  const registrations: [string, RegExp][] = [
    ["src/components/nav-groups.ts", /href: "\/tools\/demand"/],
    ["src/app/tools/page.tsx", /href: "\/tools\/demand"/],
    ["src/components/TierComparisonTable.tsx", /Demand Finder/],
    ["src/app/premium/page.tsx", /\/tools\/demand/],
    ["src/lib/sitemap-sections.ts", /\/tools\/demand/],
    ["src/app/llms.txt/route.ts", /\/tools\/demand/],
    ["src/app/dashboard/page.tsx", /\/tools\/demand/],
  ];
  for (const [file, pattern] of registrations) {
    assert.match(read(file), pattern, `${file} must reference /tools/demand`);
  }
});

test("the Premium dialog/table row for Demand Finder is Premium-only, matching its actual gate", () => {
  const src = read("src/components/TierComparisonTable.tsx");
  const rowMatch = src.match(/\{ feature: "Demand Finder[^}]*\}/);
  assert.ok(rowMatch, "expected a Demand Finder row in TIER_COMPARISON");
  assert.match(rowMatch![0], /account: false/, "Demand Finder must not be marked as included in the free account tier");
  assert.match(rowMatch![0], /premium: true/, "Demand Finder must be marked Premium");
});

test("lib/demand.ts never throws — every path degrades to an empty result", () => {
  const src = read(LIB);
  assert.match(src, /catch \{[\s\S]{0,200}bySearch: \[\], byView: \[\]/, "computeTopDemand must catch and return an empty, well-shaped result rather than throw into the page");
});

test("lib/demand.ts computes once at a generous cap and slices for both the teaser and the full list", () => {
  // Same shape as lib/screener.ts's getUndervalued: the expensive scan is cached
  // once per (market, window, day); a 1-row teaser must not trigger a second scan.
  const src = read(LIB);
  assert.match(src, /const SCAN_LIMIT = \d+/, "expected a named cap distinct from the caller's requested limit");
  assert.match(src, /unstable_cache\(/, "the expensive computation must be cached");
  assert.match(src, /tags: \[CONTENT_TAG\]/, "must revalidate on the same content tag as every other daily screener");
  assert.match(src, /full\.bySearch\.slice\(0, limit\)/, "getTopDemand must slice the cached full result down to the caller's limit");
});

test("lib/demand.ts's all-time queries are bounded and never scan the whole table", () => {
  const src = read(LIB);
  const fn = src.slice(src.indexOf("async function computeAllTime"), src.indexOf("async function computeTopDemand"));
  assert.match(fn, /searchCount: \{ gt: 0 \}/, "the search ranking must filter to cards with real search activity, not scan every card");
  assert.match(fn, /viewCount: \{ gt: 0 \}/, "the view ranking must filter to cards with real view activity");
  assert.match(fn, /take: limit/g, "both all-time queries must be capped with take, not fetched unbounded and sliced in Node");
});

test("lib/demand.ts's windowed query fetches tile data only for the ranked ids, not the whole window", () => {
  // getDemandWindow() itself returns id+two-integers for every card with any
  // activity (bounded by design — see its own header), but the CARD TILE fetch
  // (name, art, prices — much heavier per row) must be scoped to just the
  // union of ranked ids, never every card getDemandWindow returned.
  const src = read(LIB);
  const fn = src.slice(src.indexOf("async function computeTopDemand"), src.length);
  assert.match(fn, /fetchTiles\(unionIds, country\)/, "tile data must be fetched only for the union of ranked ids");
});
