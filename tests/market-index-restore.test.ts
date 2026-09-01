import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compositeSeries, INDEX_SIZE } from "../src/lib/market-index";

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

test("the core computation sources sydneyDayKey from its canonical home, not a local redefinition", () => {
  const src = read("src/lib/market-index.ts");
  assert.match(src, /import\s*\{[^}]*sydneyDayKey[^}]*\}\s*from\s*"\.\/price-history"/, "must import, not redefine, the day-key helper");
  assert.doesNotMatch(codeOnly(src), /export function sydneyDayKey/, "a second definition would silently diverge from price-history.ts's");
  assert.equal(INDEX_SIZE, 200);
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
