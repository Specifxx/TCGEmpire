import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bucketsFor, chartLines, joinPoints, parseTimeRows, siteTotals, type SiteSeries } from "../src/lib/analytics/series";

test("the Web Analytics API's time rows are read as days; junk rows are skipped", () => {
  const rows = parseTimeRows({
    version: 1,
    data: [
      { timestamp: "2026-10-30T00:00:00.000Z", pageviews: 220, visitors: 180 },
      { timestamp: "2026-10-31T00:00:00.000Z", count: 12, visitors: "9" },
      { timestamp: "nope", pageviews: 5 },
      null,
    ],
  });
  assert.deepEqual(rows, [
    { t: "2026-10-30", pageviews: 220, visitors: 180, count: 0 },
    { t: "2026-10-31", pageviews: 0, visitors: 9, count: 12 },
  ]);
  assert.deepEqual(parseTimeRows({ error: "x" }), []);
  assert.deepEqual(parseTimeRows(null), []);
});

test("visits and buy clicks join by bucket, and two projects of one site add up", () => {
  const pts = joinPoints(
    [
      { t: "2026-10-31", visitors: 10, pageviews: 30 },
      { t: "2026-10-30", visitors: 5, pageviews: 8 },
      { t: "2026-10-31", visitors: 1, pageviews: 2 },
    ],
    [{ t: "2026-10-31", count: 3 }, { t: "2026-10-29", count: 1 }],
  );
  assert.deepEqual(pts, [
    { t: "2026-10-29", visitors: 0, pageviews: 0, clicks: 1 },
    { t: "2026-10-30", visitors: 5, pageviews: 8, clicks: 0 },
    { t: "2026-10-31", visitors: 11, pageviews: 32, clicks: 3 },
  ]);
});

const site = (key: string, daily: [string, number, number][]): SiteSeries => ({
  key,
  label: key.toUpperCase(),
  projects: [key],
  daily: daily.map(([t, visitors, clicks]) => ({ t, visitors, pageviews: visitors * 2, clicks })),
  weekly: [],
});

test("a range draws exactly its days, ending today", () => {
  const b = bucketsFor("7d", "2026-11-01", []);
  assert.equal(b.length, 7);
  assert.equal(b[0], "2026-10-26");
  assert.equal(b[6], "2026-11-01");
  assert.equal(bucketsFor("90d", "2026-11-01", []).length, 90);
  assert.deepEqual(bucketsFor("12m", "2026-11-01", ["2026-10-26", "2025-10-27", "2024-01-01", "2026-10-26"]), ["2025-10-27", "2026-10-26"]);
});

test("one line per site, an all-sites line, and a running total that never sums percentages", () => {
  const sites = [site("rc", [["2026-10-31", 100, 10], ["2026-11-01", 100, 30]]), site("oc", [["2026-10-31", 100, 0]])];
  const buckets = ["2026-10-31", "2026-11-01"];
  const plain = chartLines(sites, "7d", buckets, "visitors", { total: true, cumulative: false });
  assert.deepEqual(plain.map((l) => [l.key, l.values]), [
    ["rc", [100, 100]],
    ["oc", [100, 0]],
    ["total", [200, 100]],
  ]);
  const run = chartLines(sites, "7d", buckets, "clicks", { total: true, cumulative: true });
  assert.deepEqual(run.map((l) => l.values), [[10, 40], [0, 0], [10, 40]]);
  // rc's rate so far on day 2 is 40 clicks / 200 visitors = 20, not 10 + 30.
  const rate = chartLines(sites, "7d", buckets, "rate", { total: true, cumulative: true });
  assert.deepEqual(rate.map((l) => l.values), [[10, 20], [0, 0], [5, 40 / 300 * 100]]);
  assert.deepEqual(chartLines(sites, "7d", buckets, "rate", { total: false, cumulative: false }).map((l) => l.key), ["rc", "oc"]);
});

test("the table totals each site over the range, biggest first, compares with the period before, and ends with all sites", () => {
  const sites = [
    site("oc", [["2026-10-20", 50, 5], ["2026-10-30", 40, 4]]),
    site("rc", [["2026-10-24", 999, 0], ["2026-10-25", 100, 10], ["2026-11-01", 200, 30]]),
  ];
  const t = siteTotals(sites, "7d", "2026-11-01");
  assert.deepEqual(t.map((r) => r.key), ["rc", "oc", "total"]);
  const rc = t[0];
  assert.equal(rc.visitors, 200); // 2026-10-26..11-01 only
  assert.equal(rc.clicks, 30);
  assert.equal(rc.rate, 15);
  assert.equal(rc.prevVisitors, 1099); // 2026-10-19..10-25
  assert.equal(t[2].visitors, 240);
  assert.equal(t[2].clicks, 34);
  assert.equal(t[2].prevVisitors, 1149);
  assert.equal(siteTotals(sites, "90d", "2026-11-01")[0].prevVisitors, null);
});

test("the analytics page uses Vercel's public Web Analytics API, never the dashboard's internal one, and gates on admin", () => {
  const lib = readFileSync("src/lib/analytics/vercel.ts", "utf8");
  assert.match(lib, /\/v1\/query\/web-analytics\/visits\/aggregate/);
  assert.match(lib, /\/v1\/query\/web-analytics\/events\/aggregate/);
  assert.match(lib, /eventName eq 'buy_click'/);
  assert.doesNotMatch(lib, /vercel\.com\/api\/web-analytics|insights|_vercel\/insights/);
  assert.doesNotMatch(lib, /@\/lib\/db|prisma/);
  const page = readFileSync("src/app/admin/analytics/page.tsx", "utf8");
  assert.match(page, /isAdmin/);
  assert.match(page, /notFound\(\)/);
  // The client chart never sees a token: it imports only the pure series module.
  const chart = readFileSync("src/components/admin/AnalyticsChart.tsx", "utf8");
  assert.doesNotMatch(chart, /analytics\/vercel|process\.env/);
});
