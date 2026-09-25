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
  assert.match(src, /catch \{[\s\S]{0,200}bySearch: \[\], windowUsable: false/, "getTopDemand must catch and return an empty, well-shaped result rather than throw into the page");
  assert.match(src, /catch \{[\s\S]{0,200}failed: true/, "…and say it failed, which a short window never does");
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

test("lib/demand.ts computes only what the /movers strip reads: no all-time scan, no view ranking", () => {
  // Review, 2026-09-25: the most-viewed ranking, the days=null all-time mode
  // and the 50-row scan were read only by the retired Demand Finder page.
  const src = read(LIB);
  const live = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(live, /computeAllTime|byView|allTimeSearches|allTimeViews/);
  assert.match(src, /const SCAN_LIMIT = 10;/, "the strip shows ten");
  const fn = src.slice(src.indexOf("async function computeTopDemand"), src.indexOf("function getTopDemandCached"));
  const unusable = fn.slice(fn.indexOf("if (!usable)"), fn.indexOf("const bySearchIds"));
  assert.match(unusable, /windowUsable: false/);
  assert.doesNotMatch(unusable, /prisma|fetchTiles/, "a short window hides the strip, so it queries no cards");
});

test("lib/demand.ts's windowed query fetches tile data only for the ranked ids, not the whole window", () => {
  // getDemandWindow() itself returns id+two-integers for every card with any
  // activity (bounded by design — see its own header), but the CARD TILE fetch
  // (name, art, prices — much heavier per row) must be scoped to just the
  // union of ranked ids, never every card getDemandWindow returned.
  const src = read(LIB);
  const fn = src.slice(src.indexOf("async function computeTopDemand"), src.length);
  // No country argument since 2026-09-25: the select is narrow and market-free,
  // so one cached ranking serves every market (lib/demand.ts DEMAND_CARD_SELECT).
  assert.match(fn, /fetchTiles\(bySearchIds\)/, "tile data must be fetched only for the ranked ids");
});
