import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SourceResult } from "../src/lib/earnings/core";
import { buildGrowthReport, growthReportText, reportWeeks, tagParts } from "../src/lib/earnings/growth-report";
import { growthReportEmail } from "../src/lib/ops/owner";

const today = "2026-10-30";
const src = (key: SourceResult["key"], days: SourceResult["days"], tags?: SourceResult["tags"]): SourceResult => ({ key, status: "ok", days, tags, fetchedAt: 0 });

test("four whole weeks ending yesterday, oldest first", () => {
  const w = reportWeeks(today);
  assert.equal(w.length, 4);
  assert.deepEqual(w[3], { start: "2026-10-23", end: "2026-10-29" });
  assert.deepEqual(w[0], { start: "2026-10-02", end: "2026-10-08" });
});

test("a tag splits into site, market and placement; the product slug is dropped", () => {
  assert.deepEqual(tagParts("rc-us-card_pinned"), { site: "rc", market: "us", placement: "card_pinned" });
  assert.deepEqual(tagParts("gundam-au-card_pinned-gd01-001"), { site: "gundam", market: "au", placement: "card_pinned" });
  assert.equal(tagParts("").site, "(no tag)");
});

test("the report shows each placement week over week with last week's sales", () => {
  const ebay = src("ebay", [{ day: "2026-10-20", currency: "AUD", cents: 1000 }, { day: "2026-10-27", currency: "AUD", cents: 1500 }], [
    { day: "2026-10-20", tag: "rc-us-card_pinned", currency: "AUD", cents: 1000, pendingCents: 0, sales: 1 },
    { day: "2026-10-27", tag: "rc-us-card_pinned-x", currency: "AUD", cents: 1500, pendingCents: 0, sales: 2 },
  ]);
  const clicks = new Map([["2026-10-27", { ebay: 40 }], ["2026-10-20", { ebay: 20 }]]);
  const text = growthReportText(buildGrowthReport([ebay, src("adsense", [])], clicks, today));
  assert.match(text, /rc · card_pinned · eBay: A\$0\.00 \| A\$0\.00 \| A\$10\.00 \| A\$15\.00 \(2 sales last week\) \+50%/);
  assert.match(text, /ebay: 0 \| 0 \| 20 \| 40 \+100%/);
  assert.match(text, /TOTAL: .*A\$15\.00 \+50%/);
});

test("the route mails a fixed business inbox and never returns the report", () => {
  assert.equal(growthReportEmail({}), "riftcompare@gmail.com");
  assert.equal(growthReportEmail({ GROWTH_REPORT_EMAIL: "x@y.com" }), "x@y.com");
  const route = readFileSync(new URL("../src/app/api/cron/growth-report/route.ts", import.meta.url), "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*\btext\b/);
  assert.doesNotMatch(route, /searchParams|req\.json\(/);
});
