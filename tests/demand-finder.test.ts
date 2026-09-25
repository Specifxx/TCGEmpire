import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const LIB = "src/lib/demand.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Demand Finder: the Premium leaderboard built from /admin/demand's own
// most-searched / most-viewed ranking. It LEFT PREMIUM on 2026-09-25 (the
// lineup change — DECISIONS.md, "Premium lineup: fewer tools, each one worth
// paying for"): /tools/demand 301s to /movers#most-searched, where a free
// "Most searched this week" strip calls getTopDemand directly.
//
// lib/demand.ts stays — the free strip and /admin/demand read it, and Rising
// Cards' velocity reads the same DemandSnapshot rows — so its egress and
// never-throw guarantees are still pinned below. What this file no longer
// pins is the paid page, which is gone.
// ─────────────────────────────────────────────────────────────────────────────

test("the Demand Finder page is gone and its URL redirects to the free most-searched strip", () => {
  assert.ok(!existsSync(join(ROOT, "src/app/tools/demand/page.tsx")), "the paid page must be deleted");
  assert.match(read("next.config.js"), /\{ source: "\/tools\/demand", destination: "\/movers#most-searched", permanent: true \}/);
});

test("no tier surface still sells the Demand Finder", () => {
  for (const file of [
    "src/components/nav-groups.ts",
    "src/app/tools/page.tsx",
    "src/components/TierComparisonTable.tsx",
    "src/app/premium/page.tsx",
    "src/lib/sitemap-sections.ts",
    "src/app/llms.txt/route.ts",
    "src/app/dashboard/page.tsx",
    "src/lib/dashboard-tools.ts",
    "src/components/PremiumSlideIn.tsx",
    "src/components/PremiumPricingCards.tsx",
  ]) {
    // Comments may record the history; live code may not name the tool or link its URL.
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\/tools\/demand|Demand Finder/, `${file} still sells the Demand Finder`);
  }
});

test("lib/demand.ts never throws — every path degrades to an empty result", () => {
  const src = read(LIB);
  assert.match(src, /catch \{[\s\S]{0,200}bySearch: \[\], byView: \[\]/, "computeTopDemand must catch and return an empty, well-shaped result rather than throw into the page");
});

test("lib/demand.ts computes once at a generous cap and slices for every caller", () => {
  // The expensive scan is cached once per (market, window, day); a short strip
  // must not trigger a second scan.
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
