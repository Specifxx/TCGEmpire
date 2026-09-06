import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeStats, chainLinkSeries, INDEX_SIZE } from "../src/lib/market-index";

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
//
// 2026-09-01, third pass: backfilling meant the constituent list (today's top
// 200 by search) can now span far more history than it used to, and a new
// set's cards climb into that top 200 within weeks of release — with a full
// backfill and no time window, a plain per-snapshot weighted average would
// jump the instant those new, differently-priced cards entered. Replaced with
// chain-linking (see chainLinkSeries below): each step is a % return computed
// only from constituents priced at both it and the previous charted step, so
// a debuting card simply has nothing to compare against until it has two
// consecutive prices, and can't move the level on entry alone. The formula
// this pins is also now published on /market and in the methodology guide
// article — pinned below too, so the tests fail if the two ever disagree.
//
// 2026-09-02, fourth pass: the GLOBAL composite (every region chain-linked
// together into one currency-agnostic number, briefly the default view) was
// removed per request — one region, priced in its own real currency, beat a
// blend across six markets of uneven depth. getMarketIndex() now defaults to
// US and there is no other market scope; compositeSeries is gone along with
// it. No test below should assume GLOBAL exists.
// ─────────────────────────────────────────────────────────────────────────────

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

test("the PriceHistory read uses a generous multi-year circuit breaker, not the old ~6-snapshot 45-day window", () => {
  const code = codeOnly(read("src/lib/market-index.ts"));
  assert.doesNotMatch(code, /\bWINDOW_DAYS\b/, "the old 45-day rolling-window constant must be gone, not just unused");
  assert.match(code, /const MAX_LOOKBACK_DAYS = (\d+);/, "expected a named, generous lookback bound");
  const days = Number(/const MAX_LOOKBACK_DAYS = (\d+);/.exec(code)![1]);
  assert.ok(days >= 365, `MAX_LOOKBACK_DAYS=${days} is not generous enough to function as a "not a real limit today" backfill`);
  // The query itself: scoped to the (historySource-resolved) country + this
  // basket's card ids + the (generous) cutoff. (.*? not [^)]* for the map
  // callback — cards.map((c) => c.id) nests parens.)
  assert.match(
    code,
    /dbHistory\.priceHistory\.findMany\(\{\s*where:\s*\{\s*country:\s*source,\s*cardId:\s*\{\s*in:\s*cards\.map\(.*?\)\s*\},\s*day:\s*\{\s*gte:\s*cutoff\s*\}/,
    "must be scoped to the basket AND the circuit-breaker cutoff",
  );
  assert.match(code, /const \{ source, convert \} = historySource\(country\)/, "must resolve CA/EU to their historySource before reading");
});

test("the region cache revalidates on a week-plus-slack TTL, matching the week-keyed cache", () => {
  // Was "expected exactly two unstable_cache calls (region + global)" until the
  // GLOBAL composite (and its own separate cache) was removed 2026-09-02 — one
  // unstable_cache call now, getRegionIndex's.
  const code = codeOnly(read("src/lib/market-index.ts"));
  const matches = [...code.matchAll(/revalidate:\s*(8 \* 86400|172800)/g)];
  assert.equal(matches.length, 1, "expected exactly one unstable_cache call (getRegionIndex)");
  assert.equal(matches[0][1], "8 * 86400", `found a stale 172800 (2-day) TTL: ${matches[0][0]}`);
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

// ── chainLinkSeries: the piece that keeps a new set's cards from jumping the Index ──

test("chainLinkSeries: a new constituent entering the basket does not move the level, but a genuine price move still propagates", () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 7, 1);
  const days = [0, 1, 2, 3, 4].map((i) => t0 + i * DAY);
  const [d0, d1, d2, d3, d4] = days;

  // A, B, C are tracked from day 0. D doesn't exist in the basket (and has no
  // price history at all) until day 2 — a stand-in for a brand-new set's card
  // climbing into the top-200-by-search basket. D's price (900) is wildly
  // different from A/B/C's (50-100) and D's weight (300) is the single
  // largest in the basket, deliberately, so a level change on its entry would
  // be obvious if chain-linking weren't doing its job.
  const byCard = new Map<string, Map<number, number>>([
    ["A", new Map([[d0, 100], [d1, 100], [d2, 100], [d3, 120], [d4, 120]])], // +20% genuine move at day 3
    ["B", new Map([[d0, 50], [d1, 50], [d2, 50], [d3, 50], [d4, 50]])],
    ["C", new Map([[d0, 80], [d1, 80], [d2, 80], [d3, 80], [d4, 80]])],
    ["D", new Map([[d2, 900], [d3, 900], [d4, 900]])], // enters at day 2, no earlier price
  ]);
  const cardIds = ["A", "B", "C", "D"];
  const weights = [300, 200, 200, 300];

  const points = chainLinkSeries(days, byCard, cardIds, weights);
  const byDay = new Map(points.map((p) => [p.t, p.v]));

  assert.equal(byDay.get(d0), 100, "series starts at day 0 — A, B and C already have prices then");
  assert.equal(byDay.get(d1), 100, "no price moved yet");
  assert.equal(
    byDay.get(d2), 100,
    "D just entered with a price 9-18x the rest of the basket and the largest weight in it — the level must not move on that account alone"
  );
  assert.equal(
    byDay.get(d3), 101.8,
    "A's genuine +20% move (now with D also contributing its weight) must still propagate: (300*120+200*50+200*80+300*900)/(300*100+200*50+200*80+300*900)*100 = 101.8"
  );
  assert.equal(byDay.get(d4), 101.8, "nothing moved since day 3");
});

test("chainLinkSeries starts at the first day ANY constituent has a price — not once most of the basket does", () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 7, 1);
  const days = [0, 1, 2].map((i) => t0 + i * DAY);
  const [d0, d1, d2] = days;
  // X is a tiny sliver of the basket (10 of 1000 total weight = 1%); Y — 99%
  // of the weight — has no price until day 2. An earlier version of this
  // function waited for a basket-wide coverage supermajority before starting
  // a single point, which would have thrown away days 0-1 entirely even
  // though real, if thin, data existed for them. Regression test for that:
  // the series must start as soon as ANY constituent has a price, however
  // small a slice of the basket it is on its own.
  const byCard = new Map<string, Map<number, number>>([
    ["X", new Map([[d0, 10], [d1, 10], [d2, 10]])],
    ["Y", new Map([[d2, 500]])], // enters day 2 — a much bigger, differently-priced card
  ]);
  const points = chainLinkSeries(days, byCard, ["X", "Y"], [10, 990]);
  const byDay = new Map(points.map((p) => [p.t, p.v]));
  assert.equal(byDay.get(d0), 100, "must start at day 0 on X alone (1% of the basket), not wait for Y to also have a price");
  assert.equal(byDay.get(d1), 100, "X's price hasn't moved");
  assert.equal(
    byDay.get(d2), 100,
    "Y joining with a price 50x X's, and 99% of the basket's weight, must not move the level — same entry-exclusion rule as any other new constituent"
  );
});

test("chainLinkSeries returns an empty series rather than throwing on degenerate input", () => {
  assert.deepEqual(chainLinkSeries([], new Map(), [], []), [], "no weights at all");
  const DAY = 86_400_000;
  const days = [0, DAY];
  assert.deepEqual(
    chainLinkSeries(days, new Map(), ["A", "B"], [30, 70]),
    [],
    "neither constituent ever has a tracked price, so the series must never start"
  );
});

// ── The published formula must actually match what the code computes ────────

test("the methodology guide publishes the exact chain-linking formula, not just prose", () => {
  const guide = read("src/lib/articles.ts");
  assert.match(guide, /slug:\s*"understanding-the-riftcompare-index-methodology"/);
  assert.match(guide, /## The Exact Formula/);
  assert.match(guide, /1 \+ searchCount/, "the weight formula must be spelled out literally");
  assert.match(
    guide,
    /return = \( Σ w\[i\]·p\[i,t\] for i in C \) ÷ \( Σ w\[i\]·p\[i,t'\] for i in C \)/,
    "the literal per-step return formula must be published"
  );
  assert.match(guide, /Index\(t\) = Index\(t'\) × return/, "the literal chain-linking recurrence must be published");
  assert.match(guide, /## A Concrete Example: A New Set's Launch/, "the new-set scenario the formula exists for must be walked through");
});

test("/market's own methodology prose describes chain-linking, not the old plain weighted average, and links to the full formula", () => {
  const page = codeOnly(read("src/app/market/page.tsx"));
  assert.match(page, /chain-linked/i);
  assert.doesNotMatch(
    page,
    /Each day.?s value is the weighted average/,
    "the old plain-average description must not survive alongside the new chain-linked one"
  );
  assert.match(
    page,
    /href="\/guides\/understanding-the-riftcompare-index-methodology"/,
    "the on-page summary must link to the full published formula"
  );
});

test("the machine-readable index surfaces (JSON API, LLM feed) both point at the published methodology", () => {
  const json = codeOnly(read("src/app/api/v1/index.json/route.ts"));
  assert.match(
    json,
    /methodology:\s*`\$\{SITE_URL\}\/guides\/understanding-the-riftcompare-index-methodology`/,
    "an agent consuming the JSON API should be able to find the formula without scraping the HTML page"
  );
  const llm = read("src/app/llm/market/route.ts");
  assert.match(llm, /understanding-the-riftcompare-index-methodology/, "the LLM-facing markdown feed should also cite the methodology");
});

test("/market is a real, dynamic page wired to the restored computation", () => {
  const src = read("src/app/market/page.tsx");
  assert.match(src, /export const dynamic = "force-dynamic"/, "searchParams-driven — an ISR window here previously served loading.tsx as the final response");
  assert.match(src, /import \{ getMarketIndex, INDEX_SIZE, type IndexConstituent \} from "@\/lib\/market-index"/);
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
  // the default market — the exact staleness /market's own parseMarket comment
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

// ── GLOBAL composite removed 2026-09-02 — the Index now defaults to US ───────

test("GET /api/v1/index.json defaults to the US market when ?market= is omitted", async () => {
  const { GET } = await import("../src/app/api/v1/index.json/route");
  const res = await GET(new Request("https://riftcompare.com/api/v1/index.json"));
  const body = await res.json();
  // `market` is echoed straight from parseMarket() even on the "warming" branch
  // (no live DB needed to prove the default), so this holds regardless of
  // whether this environment has data.
  assert.equal(body.market, "US", `expected the default market to be US, got ${body.market}`);
});

test("no trace of the GLOBAL composite survives anywhere in the Index's code or docs", () => {
  const checks: [string, RegExp][] = [
    ["src/lib/market-index.ts", /GLOBAL|MarketScope|compositeSeries|computeGlobalIndex|getGlobalIndex/],
    ["src/app/market/page.tsx", /GLOBAL|isGlobal|MarketScope/],
    ["src/components/MarketSwitcher.tsx", /GLOBAL|includeGlobal/],
    ["src/app/api/v1/index.json/route.ts", /GLOBAL|MarketScope/],
    ["src/app/embed/index/route.ts", /GLOBAL|MarketScope/],
    ["src/app/market/opengraph-image.tsx", /GLOBAL/],
    ["src/app/llm/market/route.ts", /GLOBAL/],
    ["src/app/llms-full.txt/route.ts", /GLOBAL|global composite/i],
    ["src/lib/openapi.ts", /GLOBAL|MARKET_PARAM_WITH_GLOBAL/],
    ["src/lib/articles.ts", /Global composite/],
  ];
  for (const [path, pattern] of checks) {
    assert.doesNotMatch(codeOnly(read(path)), pattern, `${path} still matches ${pattern}`);
  }
});

test("getMarketIndex and /market's own parseMarket both default to DEFAULT_COUNTRY, not a hardcoded market", () => {
  const lib = codeOnly(read("src/lib/market-index.ts"));
  assert.match(lib, /import \{ pickPrice, priceField, DEFAULT_COUNTRY, COUNTRIES, type Country \} from "\.\/country"/);
  assert.match(lib, /export async function getMarketIndex\(market: Country = DEFAULT_COUNTRY\)/);

  const page = codeOnly(read("src/app/market/page.tsx"));
  assert.match(page, /function parseMarket\(v\?: string\): Country \{/);
  assert.match(page, /return up in COUNTRIES \? \(up as Country\) : DEFAULT_COUNTRY;/);
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
