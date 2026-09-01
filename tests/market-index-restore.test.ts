import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compositeSeries, computeStats, INDEX_SIZE } from "../src/lib/market-index";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// The RiftCompare Index (/market) was removed 26 Aug 2026 "per request", not for
// being broken — its computation, data model and dependencies (sydneyDayKey,
// PriceHistory, IndexChart/MarketSwitcher/MarketSectionNav) all survived the
// removal untouched because other features kept using them. Brought back
// 1 Sep 2026 because it turned out to be missed. This file pins the restore:
// the core computation, the page and its satellite routes, the portfolio
// benchmark, and that nothing still points at the dead /market 404.
//
// Deliberately NOT restored: the separate Weekly Market Report (auto-generated
// blog posts) — its generator was already dead before the Index was removed,
// and it wasn't what was asked for. No test here should assume it exists.
//
// 2026-09-01, second pass: the restored file assumed PriceHistory still wrote a
// snapshot per card per day, because that was true when this module was first
// written. It no longer is — HISTORY_MIN_INTERVAL_DAYS in price-import.ts now
// gates writes to at most once every 7 days, a cost control adopted at some
// point after this file's original version predates. Two consequences pinned
// below: (1) the old rolling 45-DAY read window was quietly capping the index
// to ~6 actual snapshots instead of 45, so it's gone — the whole basket's
// history is read every time, which is cheap now that snapshots are sparse;
// (2) day-scoped caching and "1 day"/"30-day" labels were both silently wrong
// under the new cadence (a "day" apart is now really "whatever the write
// interval currently is"), so the cache moved to week-scoped and the labels
// were reworded to not name a specific interval.
// ─────────────────────────────────────────────────────────────────────────────

test("compositeSeries rebases every region to 100 at the common start, then equal-weight averages", () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 7, 1);
  // Region A has one extra early day (t0) that region B doesn't — the composite
  // must start at t0+1*DAY (the youngest region's first day), not t0.
  const regionA = [
    { t: t0, v: 100 },
    { t: t0 + DAY, v: 110 }, // common start: rebases to 100
    { t: t0 + 2 * DAY, v: 121 }, // +10% from its own rebase point
  ];
  const regionB = [
    { t: t0 + DAY, v: 50 }, // common start: rebases to 100
    { t: t0 + 2 * DAY, v: 55 }, // +10%
  ];
  const points = compositeSeries([regionA, regionB]);
  assert.equal(points.length, 2, "the pre-common-start day must not appear in the composite");
  assert.equal(points[0].t, t0 + DAY);
  assert.equal(points[0].v, 100, "both regions are exactly 100 at their shared rebase point");
  assert.equal(points[1].v, 110, "both regions moved +10%, so the equal-weight composite also reads +10%");
});

test("compositeSeries drops a region with fewer than 2 points instead of dividing by a single-point series", () => {
  const t0 = Date.UTC(2026, 7, 1);
  const real = [{ t: t0, v: 100 }, { t: t0 + 86_400_000, v: 105 }];
  const tooShort = [{ t: t0, v: 999 }]; // a region that hasn't accumulated history yet
  const points = compositeSeries([real, tooShort]);
  assert.equal(points[points.length - 1].v, 105, "the short region must not distort the composite");
});

test("compositeSeries returns an empty series rather than throwing when nothing is live yet", () => {
  assert.deepEqual(compositeSeries([]), []);
  assert.deepEqual(compositeSeries([[{ t: 0, v: 100 }]]), [], "a single-point-only input has no region with >=2 points");
});

test("the core computation caches on sydneyWeekKey, imported from its canonical home", () => {
  // NOT sydneyDayKey — PriceHistory writes at most once every 7 days (see the
  // file-header note above), so a day-scoped key recomputed an unchanged answer
  // up to seven times for nothing. price-history.ts's own getPriceHistory()
  // already made this exact fix for the same reason; market-index.ts's restored
  // version hadn't caught up to it until now.
  const src = read("src/lib/market-index.ts");
  assert.match(src, /import\s*\{[^}]*sydneyWeekKey[^}]*\}\s*from\s*"\.\/price-history"/, "must import, not redefine, the week-key helper");
  assert.doesNotMatch(codeOnly(src), /sydneyDayKey/, "no day-scoped cache key should survive anywhere in this file");
  assert.doesNotMatch(codeOnly(src), /export function sydneyWeekKey/, "a second definition would silently diverge from price-history.ts's");
  assert.equal(INDEX_SIZE, 200);
});

test("the PriceHistory read has no time-window cutoff — the whole basket's history is used", () => {
  const code = codeOnly(read("src/lib/market-index.ts"));
  assert.doesNotMatch(code, /WINDOW_DAYS/, "the old rolling-window constant must be gone, not just unused");
  assert.doesNotMatch(code, /day:\s*\{\s*gte:/, "the PriceHistory query must not filter by a cutoff date");
  // The query itself: scoped to country + this basket's card ids, nothing else.
  assert.match(
    code,
    /dbHistory\.priceHistory\.findMany\(\{\s*where:\s*\{\s*country,\s*cardId:\s*\{\s*in:\s*cards\.map/,
    "must still be scoped to the basket, just not to a recent window",
  );
});

test("both cache functions revalidate on a week-plus-slack TTL, matching the week-keyed cache", () => {
  const code = codeOnly(read("src/lib/market-index.ts"));
  const matches = [...code.matchAll(/revalidate:\s*(8 \* 86400|172800)/g)];
  assert.equal(matches.length, 2, "expected exactly two unstable_cache calls (region + global)");
  for (const m of matches) assert.equal(m[1], "8 * 86400", `found a stale 172800 (2-day) TTL: ${m[0]}`);
});

test("no surviving 'daily'/'1 day'/'30-day' label claims the index moves faster than it actually does", () => {
  // A sweep across every user-facing surface this cadence fix touched. Each one
  // specifically claimed a cadence (daily updates, "1 day", "30-day, daily")
  // that stopped being true once PriceHistory moved to weekly writes.
  const checks: [string, RegExp][] = [
    ["src/app/market/page.tsx", /\bdaily\b/i],
    ["src/app/market/page.tsx", /label="1 day"/],
    ["src/app/market/opengraph-image.tsx", /updated daily/i],
    ["src/components/IndexStats.tsx", /30-day, daily/],
    ["src/components/IndexConstituents.tsx", /label="1-day"/],
    ["src/app/llm/market/route.ts", /\bA daily\b/],
    ["src/app/llm/market/route.ts", /`- Change: 1d /],
    ["src/app/llms-full.txt/route.ts", /`- Change: 1d /],
    ["src/app/api/v1/index.json/route.ts", /\bA daily\b/],
  ];
  for (const [path, pattern] of checks) {
    assert.doesNotMatch(codeOnly(read(path)), pattern, `${path} still matches ${pattern}`);
  }
});

test("computeStats sizes its volatility window in snapshots, not a hard-coded day count", () => {
  // Synthetic base-100 series: 20 points, alternating +5%/-5% so every return is
  // the same magnitude — lets the test assert on lookback SIZE without needing
  // to hand-derive a stdev. Only the last VOLATILITY_LOOKBACK_POINTS (13) points
  // should feed the calculation; an inflated first stretch that would change the
  // reading if (wrongly) included proves the slice is actually bounded.
  const points = [];
  let v = 100;
  for (let i = 0; i < 20; i++) {
    v = i < 7 ? v * 1.5 : v * (i % 2 === 0 ? 1.05 : 0.95); // wild early swings, steady recent ones
    points.push({ t: i * 86_400_000, v });
  }
  const constituents: Parameters<typeof computeStats>[1] = [];
  const stats = computeStats(points, constituents);
  assert.ok(stats.volatilityPct != null, "20 points should clear the 5-return minimum");
  // A stdev computed over ALL 20 points (including the wild early ×1.5 jumps)
  // would be far larger than one computed over just the steady last 13.
  assert.ok(stats.volatilityPct! < 10, `volatility ${stats.volatilityPct}% looks like it included the early ×1.5 jumps, not just the recent steady moves`);
});

test("/market is a real, dynamic page wired to the restored computation", () => {
  const src = read("src/app/market/page.tsx");
  assert.match(src, /export const dynamic = "force-dynamic"/, "searchParams-driven — an ISR window here previously served loading.tsx as the final response");
  assert.match(src, /import \{ getMarketIndex, INDEX_SIZE, type MarketScope, type IndexConstituent \} from "@\/lib\/market-index"/);
  assert.match(src, /<IndexChart points=\{index\.points\}/);
  assert.match(src, /<IndexStats index=\{index\}/);
  assert.match(src, /<IndexConstituents constituents=\{index\.constituents\}/);
  assert.match(src, /<MarketSwitcher value=\{market\}/);
});

test("the satellite routes (public JSON, embed badge, LLM feed, OG image) all exist and export GET", () => {
  for (const path of [
    "src/app/api/v1/index.json/route.ts",
    "src/app/embed/index/route.ts",
    "src/app/llm/market/route.ts",
  ]) {
    const src = read(path);
    assert.match(src, /export async function GET\(/, `${path} must export GET`);
  }
  const og = read("src/app/market/opengraph-image.tsx");
  assert.match(og, /export default async function Image\(/);
});

test("the embed badge validates ?market against the full country registry, not a hand-written AU/US/UK list", () => {
  // The original route only recognised AU/US/UK, silently folding SG and CA into
  // the GLOBAL composite — the exact staleness /market's own parseMarket comment
  // warns about. Fixed to match on restore.
  const src = codeOnly(read("src/app/embed/index/route.ts"));
  assert.match(src, /up in COUNTRIES/, "must validate against the COUNTRIES registry like /market does");
  assert.doesNotMatch(src, /up === "AU" \|\| up === "US" \|\| up === "UK"/, "must not fall back to the old hand-written list");
});

test("getPortfolio computes the RiftCompare Index benchmark, and the page renders it", () => {
  const lib = codeOnly(read("src/lib/premium.ts"));
  assert.match(lib, /import \{ getMarketIndex \} from "\.\/market-index"/);
  assert.match(lib, /index:\s*\{\s*d7:\s*number \| null;\s*d30:\s*number \| null\s*\}\s*\|\s*null/, "Portfolio must carry the index benchmark field");
  assert.match(lib, /getMarketIndex\(country\)\.catch\(\(\) => null\)/, "must be best-effort — never block the portfolio on the index");

  const page = codeOnly(read("src/app/portfolio/page.tsx"));
  assert.match(page, /vs the market \(RiftCompare Index\)/);
  assert.match(page, /<PnlView pnl=\{portfolio\.pnl\} index=\{portfolio\.index\} d7=\{portfolio\.d7\} d30=\{portfolio\.d30\}/);
});

// ── Functional: actually run the handlers, not just read their source ────────

test("GET /api/v1/index.json responds 200 with a real status field, live data or not", async () => {
  const { GET } = await import("../src/app/api/v1/index.json/route");
  const res = await GET(new Request("https://riftcompare.com/api/v1/index.json"));
  assert.equal(res.status, 200, "warming/no-data is a real state, never a 5xx");
  const body = await res.json();
  assert.ok(body.status === "ready" || body.status === "warming", `unexpected status: ${body.status}`);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex");
});

test("GET /embed/index returns real, frameable HTML either way", async () => {
  const { GET } = await import("../src/app/embed/index/route");
  const res = await GET(new Request("https://riftcompare.com/embed/index"));
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  const body = await res.text();
  assert.match(body, /<!doctype html>/i);
  assert.match(body, /The RiftCompare Index/);
});

test("GET /llm/market returns markdown either way", async () => {
  const { GET } = await import("../src/app/llm/market/route");
  const res = await GET();
  assert.equal(res.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  const body = await res.text();
  assert.match(body, /^# The RiftCompare Index/);
});

test("the nav and footer point at /market again — Prices group, PRIMARY_NAV, and MarketSwitcher's own default", () => {
  const nav = codeOnly(read("src/components/nav-groups.ts"));
  assert.match(nav, /\{ href: "\/market", label: "Market Index"/);
  assert.match(nav, /PRIMARY_NAV[\s\S]{0,200}\{ href: "\/market", label: "Index" \}/);

  const switcher = read("src/components/MarketSwitcher.tsx");
  assert.match(switcher, /basePath = "\/market"/, "the Index page is the default consumer again");
});

test("nothing still points at the dead /market 404 via a records-only workaround", () => {
  // movers/page.tsx briefly linked straight to /market/records to route around
  // the missing Index; now that /market exists again it should link there
  // instead — /market/records stays reachable via the Index page itself.
  const movers = read("src/app/movers/page.tsx");
  assert.match(movers, /href="\/market"/, "movers must link back to the Index");
});

test("no stray reference still calls the Index page a 404 or routes around it", () => {
  // A light sweep: every file this restore touched should mention /market
  // somewhere, not just the records subpage — catches a file that got the
  // satellite-route treatment but never actually got its /market link back.
  for (const path of ["src/app/about/page.tsx", "src/app/dashboard/page.tsx", "src/app/singles/page.tsx"]) {
    const src = read(path);
    assert.match(src, /href="\/market"|href={`?\/market/, `${path} should link back to the Index`);
  }
});
