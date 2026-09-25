import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEMAND_WINDOWS,
  FREE_DEMAND_ROWS,
  PREMIUM_DEMAND_ROWS,
  demandQueryFor,
  parseDemandList,
  parseDemandWindow,
  visibleDemandRows,
} from "../src/lib/demand-view";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { DASHBOARD_TOOLS } from "../src/lib/dashboard-tools";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LIB = "src/lib/demand.ts";
const PAGE = "src/app/tools/demand/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Demand Finder: the most searched and most viewed cards over 7 or 30 days.
// It left Premium on the morning of 2026-09-25 (the lineup change) and came
// back the same day AS A PREMIUM TOOL (DECISIONS.md, "Demand Finder returns as
// a Premium tool") to widen the Plus→Premium gap. The gate is the premium
// minimum; anyone below it gets exactly the free /movers strip's rows.
// ─────────────────────────────────────────────────────────────────────────────

test("the page is back, gated on the premium minimum, and no longer redirected", () => {
  assert.ok(existsSync(join(ROOT, PAGE)), "the Demand Finder page must exist");
  const page = code(read(PAGE));
  assert.match(page, /const premium = isPremium\(user, "premium"\);/, "Plus must not open it — premium minimum only");
  assert.match(page, /const access: DemandAccess = premium \|\| ADSENSE_REVIEW_MODE \? "full" : "free";/);
  assert.doesNotMatch(read("next.config.js"), /source: "\/tools\/demand"/, "the retired redirect must be gone");
  // Free and Plus hit a Premium wall that sells Premium (the default tier);
  // signed out, a sign-in link attributed to the tool gate.
  assert.match(page, /<PremiumButton surface="gate:demand" \/>/);
  assert.doesNotMatch(page, /<PremiumButton[^>]*tier="plus"/, "a Premium-only wall must not sell Plus");
  assert.match(page, /\/login\?next=\/tools\/demand&src=tool_gate/);
});

test("a viewer below Premium never gets more than the /movers strip", () => {
  // The one constant both pages read.
  assert.equal(FREE_DEMAND_ROWS, 10);
  assert.match(read("src/app/movers/page.tsx"), /const MOST_SEARCHED_ROWS = FREE_DEMAND_ROWS;/);

  // The query a free viewer's render makes is the strip's own, whatever the
  // requested window.
  for (const days of DEMAND_WINDOWS) {
    assert.deepEqual(demandQueryFor("free", days), { days: 7, limit: FREE_DEMAND_ROWS });
    assert.deepEqual(demandQueryFor("full", days), { days, limit: PREMIUM_DEMAND_ROWS });
  }

  // And the rows: even handed a full 25-row result with a most-viewed list,
  // a free viewer sees the top ten most searched, never the viewed list.
  const mk = (tag: string) => Array.from({ length: PREMIUM_DEMAND_ROWS }, (_, i) => `${tag}${i}`);
  const result = { bySearch: mk("s"), byView: mk("v") };
  for (const list of ["searched", "viewed"] as const) {
    const free = visibleDemandRows(result, "free", list);
    assert.equal(free.length, FREE_DEMAND_ROWS);
    assert.ok(free.every((r) => r.startsWith("s")), "free is always the most-searched list");
  }
  assert.equal(visibleDemandRows(result, "full", "viewed")[0], "v0");
  assert.equal(visibleDemandRows(result, "full", "searched").length, PREMIUM_DEMAND_ROWS);

  // The page wires those in, fixes the window and list below Premium, and
  // shows the view counts only in full.
  const page = code(read(PAGE));
  assert.match(page, /const days = access === "full" \? parseDemandWindow\(searchParams\.range\) : 7;/);
  assert.match(page, /const list: DemandList = access === "full" \? parseDemandList\(searchParams\.view\) : "searched";/);
  assert.match(page, /const query = demandQueryFor\(access, days\);\s*const result = await getTopDemand\(query\.days, query\.limit\);/);
  assert.match(page, /const rows = visibleDemandRows\(result, access, list\);/);
  assert.match(page, /const showViews = access === "full";/);
  assert.equal((page.match(/getTopDemand\(/g) ?? []).length, 1, "one loader call per render");
});

test("query strings parse to the fixed windows and lists only", () => {
  assert.equal(parseDemandWindow("30"), 30);
  for (const v of [undefined, "7", "all", "365", "0"]) assert.equal(parseDemandWindow(v), 7);
  assert.equal(parseDemandList("viewed"), "viewed");
  for (const v of [undefined, "searched", "anything"]) assert.equal(parseDemandList(v), "searched");
  assert.deepEqual([...DEMAND_WINDOWS], [7, 30], "no all-time mode: pre-hardening counts would lead it");
});

test("the page and the strip call the self-cached loader directly, never inside a cache", () => {
  for (const file of [PAGE, "src/app/movers/page.tsx"]) {
    const src = code(read(file));
    assert.doesNotMatch(src, /unstable_cache|cachedOrDirect|from "next\/cache"/, `${file} wraps nothing in a cache`);
  }
  // Its own cached callback reaches no self-cached loader either.
  const demand = code(read(LIB));
  const body = demand.slice(demand.indexOf("async function computeTopDemand"), demand.indexOf("function getTopDemandCached"));
  for (const loader of ["getTopDemand(", "getPriceMovers(", "getCachedRisingCards(", "getDemandWindow("]) {
    assert.ok(!body.includes(loader), `computeTopDemand must not call ${loader}`);
  }
  assert.match(body, /getDemandWindowOrThrow\(days\)/, "the throwing reader, so a failure is never cached");
});

test("every tier surface sells it as Premium", () => {
  const row = TIER_COMPARISON.find((r) => r.feature.startsWith("Demand Finder"));
  assert.ok(row, "a TIER_COMPARISON row");
  assert.equal(row!.premium, true);
  assert.equal(row!.plus, row!.account, "Plus gets exactly the free taste");
  assert.match(String(row!.account), new RegExp(`^Top ${FREE_DEMAND_ROWS}\\b`));
  const dash = DASHBOARD_TOOLS.find((t) => t.href === "/tools/demand");
  assert.equal(dash?.tier, "premium");
  assert.equal(dash?.freeTaste, `Top ${FREE_DEMAND_ROWS} free`);
  for (const file of [
    "src/components/nav-groups.ts",
    "src/app/tools/page.tsx",
    "src/app/premium/page.tsx",
    "src/lib/sitemap-sections.ts",
    "src/app/llms.txt/route.ts",
    "src/components/PremiumSlideIn.tsx",
    "src/components/PremiumPricingCards.tsx",
    "src/components/MostSearchedStrip.tsx",
  ]) {
    assert.match(code(read(file)), /\/tools\/demand|Demand Finder/, `${file} should list Demand Finder`);
  }
  assert.match(code(read("src/components/MostSearchedStrip.tsx")), /href="\/tools\/demand"[\s\S]{0,200}Full leaderboard — Premium/);
});

test("the copy describes attention, never investing, flipping or prediction", () => {
  const page = code(read(PAGE));
  assert.doesNotMatch(page, /invest|flip|what to buy|will (rise|go up)|predict(?!ion,)|ahead of the market/i);
  assert.match(page, /not a price forecast/, "the table says what the numbers are not");
  // No WebApplication `offers price "0"` for a tool whose full lists are paid.
  assert.doesNotMatch(page, /"@type": "Offer"|offers:/);
});

test("lib/demand.ts never throws — every path degrades to an empty result", () => {
  const src = read(LIB);
  const outer = src.slice(src.indexOf("export async function getTopDemand"));
  assert.match(outer, /catch \{[\s\S]{0,200}bySearch: \[\], byView: \[\], windowUsable: false/, "getTopDemand must catch and return an empty, well-shaped result rather than throw into the page");
  assert.match(outer, /catch \{[\s\S]{0,200}failed: true/, "…and say it failed, which a short window never does");
});

test("lib/demand.ts computes once at the deepest list and slices for every caller", () => {
  // The expensive scan is cached once per (window, day); the ten-row strip
  // must not trigger a second scan.
  const src = read(LIB);
  assert.match(src, /const SCAN_LIMIT = PREMIUM_DEMAND_ROWS;/, "one scan at the Premium depth");
  assert.equal(PREMIUM_DEMAND_ROWS, 25);
  assert.match(src, /unstable_cache\(/, "the expensive computation must be cached");
  assert.match(src, /tags: \[CONTENT_TAG\]/, "must revalidate on the same content tag as every other daily screener");
  assert.match(src, /\["rc-demand-v3", String\(days\), sydneyDayKey\(\)\]/, "a new key for the new shape; no market in it");
  assert.match(src, /bySearch: full\.bySearch\.slice\(0, limit\)/);
  assert.match(src, /byView: full\.byView\.slice\(0, limit\)/);
  const ttl = Number(/\["rc-demand-v3"[\s\S]{0,80}revalidate:\s*(\d+)/.exec(src)?.[1]);
  assert.ok(ttl >= 86400, `the TTL (${ttl}) must not undercut /movers' 86400 revalidate`);
});

test("lib/demand.ts: no all-time scan, and a short window queries no cards", () => {
  const src = read(LIB);
  const live = code(src);
  assert.doesNotMatch(live, /computeAllTime|allTimeSearches|allTimeViews|searchCount|viewCount/);
  const fn = src.slice(src.indexOf("async function computeTopDemand"), src.indexOf("function getTopDemandCached"));
  const unusable = fn.slice(fn.indexOf("if (!usable)"), fn.indexOf("const bySearchIds"));
  assert.match(unusable, /windowUsable: false/);
  assert.doesNotMatch(unusable, /prisma|fetchTiles/, "a short window shows nothing, so it queries no cards");
});

test("lib/demand.ts fetches narrow tile data only for the ranked ids, in one query", () => {
  // getDemandWindowOrThrow() returns id + two integers for every card with any
  // activity (bounded by design — see its own header); the card tile fetch
  // must be scoped to the union of the two ranked lists, never the window.
  const src = read(LIB);
  const fn = src.slice(src.indexOf("async function computeTopDemand"), src.indexOf("function getTopDemandCached"));
  assert.match(fn, /const unionIds = \[\.\.\.new Set\(\[\.\.\.bySearchIds, \.\.\.byViewIds\]\)\];/);
  assert.equal((fn.match(/fetchTiles\(/g) ?? []).length, 1, "one tile read");
  assert.match(fn, /fetchTiles\(unionIds\)/);
  assert.match(fn, /win\.rows\.filter\(\(r\) => r\.searches > 0\)/, "most searched lists only searched cards");
  assert.match(fn, /win\.rows\.filter\(\(r\) => r\.views > 0\)/, "most viewed lists only viewed cards");
  assert.match(src, /select: DEMAND_CARD_SELECT, take: ids\.length/, "narrow select, capped");
});
