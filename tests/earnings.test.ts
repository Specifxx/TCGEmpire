import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addDays,
  adsenseDays,
  dayIn,
  epnDays,
  impactDays,
  inRange,
  dailyTotals,
  forecastQuarters,
  growthFactor,
  SEASON,
  SCENARIOS,
  ASSUMED_COMMISSION,
  FORECAST_MAX_MONTHLY,
  latestDayFigure,
  latestReportDay,
  linearTrend,
  runningTotal,
  mergeDays,
  rangeStart,
  seriesFor,
  stripeDays,
  totalFor,
  windows,
  type SourceResult,
} from "../src/lib/earnings/core";
import { convertCents } from "../src/lib/fx";

// The admin earnings dashboard (2026-10-24, DECISIONS.md "One earnings dashboard").

test("days are Sydney calendar days; ranges end today and include it", () => {
  // 2026-10-24 13:30 UTC is 00:30 on the 25th in Sydney (AEDT, UTC+11).
  assert.equal(dayIn(Date.parse("2026-10-24T13:30:00Z")), "2026-10-25");
  assert.equal(dayIn(Date.parse("2026-10-24T12:30:00Z")), "2026-10-24");
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(rangeStart("1d", "2026-10-24"), "2026-10-24");
  assert.equal(rangeStart("7d", "2026-10-24"), "2026-10-18");
  assert.equal(rangeStart("30d", "2026-10-24"), "2026-09-25");
  assert.equal(rangeStart("90d", "2026-10-24"), "2026-07-27");
  assert.equal(rangeStart("all", "2026-10-24"), null);
  assert.ok(inRange("2026-10-18", "7d", "2026-10-24"));
  assert.ok(!inRange("2026-10-17", "7d", "2026-10-24"));
  assert.ok(!inRange("2026-10-25", "all", "2026-10-24"), "nothing after today");
});

test("totals per range, pending kept apart, other currencies converted at the site's rates", () => {
  const days = [
    { day: "2026-10-24", currency: "USD", cents: 1000, pendingCents: 400 },
    { day: "2026-10-20", currency: "AUD", cents: 1500 },
    { day: "2026-08-01", currency: "USD", cents: 500 },
  ];
  const today = "2026-10-24";
  assert.deepEqual(totalFor(days, "1d", today, "USD"), { cents: 1000, pendingCents: 400, native: { USD: 1000 } });
  const week = totalFor(days, "7d", today, "USD");
  assert.equal(week.cents, 1000 + convertCents(1500, "AUD", "USD"));
  assert.deepEqual(week.native, { USD: 1000, AUD: 1500 });
  assert.equal(totalFor(days, "30d", today, "USD").cents, week.cents);
  assert.equal(totalFor(days, "90d", today, "USD").cents, week.cents + 500);
  assert.equal(totalFor(days, "all", today, "USD").cents, week.cents + 500);
  // Displayed in AUD instead.
  assert.equal(totalFor(days, "1d", today, "AUD").cents, convertCents(1000, "USD", "AUD"));
});

test("the combined series has one bucket per day (per month for all time), split by source", () => {
  const src = (key: SourceResult["key"], days: SourceResult["days"]): SourceResult => ({ key, status: "ok", days, fetchedAt: 0 });
  const sources = [src("stripe", [{ day: "2026-10-23", currency: "USD", cents: 300 }]), src("ebay", [{ day: "2026-10-23", currency: "USD", cents: 200 }])];
  const week = seriesFor(sources, "7d", "2026-10-24", "USD");
  assert.equal(week.length, 7, "every day of the range, empty ones included");
  const b = week.find((x) => x.label === "2026-10-23")!;
  assert.equal(b.cents, 500);
  assert.deepEqual(b.bySource, { stripe: 300, ebay: 200 });
  const all = seriesFor(sources, "all", "2026-10-24", "USD");
  assert.deepEqual(all.map((x) => x.label), ["2026-10"]);
});

test("Stripe: net of fees per Sydney day; payouts and transfers are not earnings", () => {
  const t = (type: string, net: number, iso: string, currency = "usd") => ({ type, net, currency, created: Date.parse(iso) / 1000 });
  const days = stripeDays([
    t("charge", 935, "2026-10-24T01:00:00Z"),
    t("charge", 935, "2026-10-24T02:00:00Z"),
    t("refund", -999, "2026-10-24T03:00:00Z"),
    t("stripe_fee", -50, "2026-10-24T03:00:00Z"),
    t("payout", -5000, "2026-10-24T04:00:00Z"),
    t("transfer", -100, "2026-10-24T04:00:00Z"),
  ]);
  assert.deepEqual(days, [{ day: "2026-10-24", currency: "USD", cents: 935 + 935 - 999 - 50, pendingCents: 0 }]);
});

test("Impact (TCGplayer): payouts by event day; reversed pays nothing; pending tracked", () => {
  const days = impactDays({
    Actions: [
      { Payout: "1.50", Currency: "USD", EventDate: "2026-10-20T10:00:00-07:00", State: "APPROVED" },
      { Payout: "2.00", Currency: "USD", EventDate: "2026-10-20T11:00:00-07:00", State: "PENDING" },
      { Payout: "9.99", Currency: "USD", EventDate: "2026-10-20T12:00:00-07:00", State: "REVERSED" },
      { Payout: "1.00", Currency: "USD", EventDate: "not a date", State: "APPROVED" },
    ],
  });
  assert.deepEqual(days, [{ day: "2026-10-21", currency: "USD", cents: 350, pendingCents: 200 }]);
  assert.deepEqual(impactDays(null), []);
});

test("eBay Partner Network: Performance by Day rows, all in the account's ONE currency whatever the checkout site", () => {
  const days = epnDays(
    {
      Records: [
        { Date: "2026-10-22", CheckoutSite: "US", Earnings: "3.20", OtherEarnings: "0.30" },
        { Date: "2026-10-22", CheckoutSite: "AU", Earnings: "1.10" },
        { Date: "2026-10-23", CheckoutSite: "UK", Earnings: "0" },
        { Date: "bad", CheckoutSite: "US", Earnings: "5" },
      ],
    },
    "AUD",
  );
  // The bug this pins (2026-10-25): US rows were labelled USD and converted to AUD a
  // second time, ~1.5x too much. eBay reports every row in the account currency.
  assert.deepEqual(days, [{ day: "2026-10-22", currency: "AUD", cents: 460, pendingCents: 0 }]);
  // A bare array and lower-case keys parse the same; an unknown shape is empty, not a crash.
  assert.equal(epnDays([{ date: "2026-10-22", checkoutsite: "US", earnings: "1" }])[0].cents, 100);
  assert.equal(epnDays([{ date: "2026-10-22", earnings: "1" }], "USD")[0].currency, "USD");
  assert.deepEqual(epnDays({ unexpected: true }), []);
});

test("AdSense: DATE × ESTIMATED_EARNINGS rows in the report's currency", () => {
  const days = adsenseDays({
    headers: [{ name: "DATE", type: "DIMENSION" }, { name: "ESTIMATED_EARNINGS", type: "METRIC_CURRENCY", currencyCode: "USD" }],
    rows: [{ cells: [{ value: "2026-10-23" }, { value: "0.42" }] }, { cells: [{ value: "2026-10-24" }, { value: "0.00" }] }],
  });
  assert.deepEqual(days, [{ day: "2026-10-23", currency: "USD", cents: 42, pendingCents: 0 }]);
  assert.deepEqual(adsenseDays({}), []);
});

test("windows cover a span exactly, and mergeDays sums per day and currency", () => {
  assert.deepEqual(windows("2026-01-01", "2026-01-10", 4), [
    ["2026-01-01", "2026-01-04"],
    ["2026-01-05", "2026-01-08"],
    ["2026-01-09", "2026-01-10"],
  ]);
  assert.deepEqual(mergeDays([
    { day: "2026-01-02", currency: "USD", cents: 1 },
    { day: "2026-01-01", currency: "USD", cents: 2 },
    { day: "2026-01-02", currency: "USD", cents: 3 },
  ]).map((d) => [d.day, d.cents]), [["2026-01-01", 2], ["2026-01-02", 4]]);
});

test("admin only: the page and the manual-entry route are gated; secrets stay server-side", () => {
  const page = readFileSync(new URL("../src/app/admin/earnings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\);/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  const route = readFileSync(new URL("../src/app/api/admin/earnings/manual/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!\(await allowed\(body\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}, \{ status: 403 \}\);/g);
  const sources = readFileSync(new URL("../src/lib/earnings/sources.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sources, /NEXT_PUBLIC_(IMPACT|EPN|ADSENSE_API)/, "API credentials are never public env vars");
  // The manual table is private: never in the public data export.
  const pub = readFileSync(new URL("../src/lib/public-data/models.ts", import.meta.url), "utf8").toString();
  assert.doesNotMatch(pub, /manualEarning|ManualEarning/);
});

test("API error text shown on the dashboard and in the ops email never carries a key", async () => {
  const { scrubSecrets } = await import("../src/lib/earnings/sources");
  assert.equal(scrubSecrets("Invalid API Key provided: sk_live_abc123XYZ"), "Invalid API Key provided: [key]");
  assert.equal(scrubSecrets("bad header Basic dXNlcjpwYXNz"), "bad header Basic [hidden]");
  assert.equal(scrubSecrets("token ya29.a0AfH6SM-x refresh 1//0gabc"), "token [token] refresh [token]");
});

test("eBay: the daily report is the v2 id (overridable), and v2-style column names parse", async () => {
  const { EPN_DAILY_REPORT } = await import("../src/lib/earnings/sources");
  assert.equal(EPN_DAILY_REPORT, "ebay_partner_perf_by_day_v2");
  const days = epnDays({
    Records: [
      { "Event Date": "2026-10-23", "Checkout Site": "AU", "Total Earnings": "2.50" },
      { event_date: "2026-10-23", checkout_site: "US", earnings: "1.00", other_earnings: "0.25", currency_code: "USD" },
    ],
  });
  assert.deepEqual(days, [
    { day: "2026-10-23", currency: "AUD", cents: 250, pendingCents: 0 },
    { day: "2026-10-23", currency: "USD", cents: 125, pendingCents: 0 },
  ]);
});

test("eBay transactions: an adjusted sale counts once, at its latest record", async () => {
  const { epnTransactions, latestPerSale, txnDays } = await import("../src/lib/earnings/core");
  const recs = epnTransactions({
    Records: [
      { EpnTransactionId: "A", EventDate: "2026-10-20T10:00:00-07:00", UpdateDate: "2026-10-20T10:00:00-07:00", Earnings: "1.00", Status: "Pending", CustomId: "rc-au-ebay" },
      { EpnTransactionId: "A", EventDate: "2026-10-20T10:00:00-07:00", UpdateDate: "2026-10-22T09:00:00-07:00", Earnings: "0.90", DeltaEarnings: "-0.10", Status: "Approved", CustomId: "rc-au-ebay" },
      { EpnTransactionId: "B", EventDate: "2026-10-21T08:00:00-07:00", UpdateDate: "2026-10-21T08:00:00-07:00", Earnings: "2.00", Status: "Pending", CustomId: "op-us-card" },
    ],
  });
  assert.equal(recs.length, 3);
  const sales = latestPerSale(recs);
  assert.equal(sales.length, 2);
  assert.deepEqual(txnDays(sales), [
    { day: "2026-10-20", currency: "AUD", cents: 90, pendingCents: 0 },
    { day: "2026-10-21", currency: "AUD", cents: 200, pendingCents: 200 },
  ]);
});

test("eBay by tag: grouped by the tag's site prefix, then each full tag, within the range", async () => {
  const { tagGroup, tagBreakdown, tagDays } = await import("../src/lib/earnings/core");
  assert.equal(tagGroup("rc-au-ebay").key, "rc");
  assert.equal(tagGroup("OP-us-card").key, "op");
  assert.equal(tagGroup("dexcompare-x").key, "dexcompare");
  assert.deepEqual(tagGroup("mtg-us-card"), { key: "mtg", label: "MTG" });
  assert.deepEqual(tagGroup("gd_au_kit"), { key: "gd", label: "GD" });
  assert.equal(tagGroup("lorcana").key, "lor", "no separator: the first three characters");
  assert.equal(tagGroup("pkmn-kindhub").key, "pkmn");
  assert.equal(tagGroup("").label, "No tag");
  assert.deepEqual(tagGroup("zz-thing"), { key: "zz", label: "ZZ" });
  const t = (day: string, tag: string, cents: number) => ({ id: tag + day, day, tag, pending: false, currency: "AUD", cents, updated: "" });
  const rows = tagDays([t("2026-10-24", "rc-au-ebay", 300), t("2026-10-24", "rc-us-card", 100), t("2026-10-25", "op-au-x", 500), t("2026-01-02", "rc-au-ebay", 999)]);
  const g = tagBreakdown(rows, "7d", "2026-10-25", "AUD");
  assert.deepEqual(
    g.map((x) => [x.key, x.cents, x.sales]),
    [
      ["op", 500, 1],
      ["rc", 400, 2],
    ],
  );
  assert.deepEqual(
    g[1].tags.map((x) => [x.tag, x.cents]),
    [
      ["rc-au-ebay", 300],
      ["rc-us-card", 100],
    ],
  );
  assert.equal(tagBreakdown(rows, "all", "2026-10-25", "AUD").find((x) => x.key === "rc")!.cents, 1399);
});

// ── Costs (2026-10-25) ──────────────────────────────────────────────────────
test("costs: one-off on its day; monthly on the start's day, clamped, up to today or the end date", async () => {
  const { expandCost } = await import("../src/lib/earnings/core");
  const base = { id: "x", label: "x", category: "AI", amountCents: 2000, currency: "USD", endDay: null };
  assert.deepEqual(expandCost({ ...base, startDay: "2026-10-15", recurrence: "once" }, "2026-10-25"), [{ day: "2026-10-15", currency: "USD", cents: 2000 }]);
  assert.deepEqual(expandCost({ ...base, startDay: "2026-11-01", recurrence: "once" }, "2026-10-25"), [], "nothing in the future");
  const monthly = expandCost({ ...base, startDay: "2026-01-31", recurrence: "monthly" }, "2026-04-30").map((d) => d.day);
  assert.deepEqual(monthly, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"], "the 31st clamps to each month's last day");
  const stopped = expandCost({ ...base, startDay: "2026-06-05", recurrence: "monthly", endDay: "2026-08-04" }, "2026-10-25").map((d) => d.day);
  assert.deepEqual(stopped, ["2026-06-05", "2026-07-05"], "no charge after the end date");
  const yearly = expandCost({ ...base, startDay: "2025-03-01", recurrence: "yearly" }, "2026-10-25").map((d) => d.day);
  assert.deepEqual(yearly, ["2025-03-01", "2026-03-01"]);
});

test("costs: Anthropic's cost report (USD cents as decimal strings) by day", async () => {
  const { anthropicCostDays } = await import("../src/lib/earnings/core");
  const days = anthropicCostDays({
    data: [
      { starting_at: "2026-10-20T00:00:00Z", ending_at: "2026-10-21T00:00:00Z", results: [{ amount: "123.45", currency: "USD" }, { amount: "10", currency: "USD" }] },
      { starting_at: "2026-10-21T00:00:00Z", results: [] },
    ],
    has_more: false,
  });
  assert.deepEqual(days, [{ day: "2026-10-20", currency: "USD", cents: 133, pendingCents: 0 }]);
  assert.deepEqual(anthropicCostDays(null), []);
});

test("costs: the pre-filled entry is what the owner said, seeded once, and the routes are admin-only", () => {
  const costs = readFileSync(new URL("../src/lib/earnings/costs.ts", import.meta.url), "utf8");
  assert.doesNotMatch(costs, /seedKey: "vercel-pro"/, "Vercel comes from its invoices, not an estimate");
  assert.match(costs, /seedKey: "ads-reddit-meta-2026",[\s\S]*?amountCents: 20000,[\s\S]*?recurrence: "once"/);
  assert.match(costs, /createMany\(\{ data: SEEDS, skipDuplicates: true \}\)/, "seeded once: a removed seed keeps its row and its seedKey");
  assert.match(costs, /where: \{ removedAt: null \}/);
  const route = readFileSync(new URL("../src/app/api/admin/earnings/costs/route.ts", import.meta.url), "utf8");
  assert.equal((route.match(/if \(!\(await allowed\(body\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}, \{ status: 403 \}\);/g) ?? []).length, 3, "POST, PATCH and DELETE are all gated");
  assert.match(route, /data: \{ removedAt: new Date\(\) \}/, "delete keeps the row");
  const pub = readFileSync(new URL("../src/lib/public-data/models.ts", import.meta.url), "utf8");
  assert.doesNotMatch(pub, /manualCost|ManualCost/);
});

test("eBay: report dates parse in ISO, US and written-out forms; the shape names columns, never values", async () => {
  const { reportDay, reportShape } = await import("../src/lib/earnings/core");
  assert.equal(reportDay("2026-10-24T00:00:00-07:00"), "2026-10-24");
  assert.equal(reportDay("10/24/2026"), "2026-10-24");
  assert.equal(reportDay("Oct 24, 2026"), "2026-10-24");
  assert.equal(reportDay("October 4 2026"), "2026-10-04");
  assert.equal(reportDay("13/40/2026"), null);
  assert.equal(reportDay("soon"), null);
  const days = epnDays({ Records: [{ Date: "10/24/2026", CheckoutSite: "AU", Earnings: "$1.50" }, { EventDate: "Oct 24, 2026", CheckoutSite: "AU", Earnings: "0.50" }] });
  assert.deepEqual(days, [{ day: "2026-10-24", currency: "AUD", cents: 200, pendingCents: 0 }]);
  assert.deepEqual(reportShape({ Records: [{ Date: "x", Earnings: "9" }] }), { rows: 1, columns: ["Date", "Earnings"] });
  assert.deepEqual(reportShape({ Records: [] }), { rows: 0, columns: [] });
});

test("eBay: the daily report is asked for every campaign and checkout site, as eBay's guide does", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/earnings/sources.ts"), "utf8");
  assert.match(src, /EPN_DAILY_REPORT, "CAMPAIGN_ID=0&CHECKOUT_SITE=0"/);
  assert.match(src, /ebay_partner_transaction_detail/);
});

test("TCGplayer: an action fetched twice (overlapping windows) counts once; reversed never counts", async () => {
  const { impactActions, uniqueActions, impactActionDays } = await import("../src/lib/earnings/core");
  const page = {
    Actions: [
      { Id: "1", Payout: "2.00", Currency: "USD", EventDate: "2026-10-20T01:00:00Z", State: "APPROVED" },
      { Id: "2", Payout: "1.00", Currency: "USD", EventDate: "2026-10-20T02:00:00Z", State: "PENDING" },
      { Id: "3", Payout: "5.00", Currency: "USD", EventDate: "2026-10-20T03:00:00Z", State: "REVERSED" },
    ],
  };
  const acts = uniqueActions([...impactActions(page), ...impactActions(page)]);
  assert.equal(acts.length, 3);
  assert.deepEqual(impactActionDays(acts), [{ day: "2026-10-20", currency: "USD", cents: 300, pendingCents: 100 }]);
  assert.equal(impactActionDays(acts, ["REVERSED"])[0].cents, 500);
});

test("TCGplayer: the windows walk Impact's last-updated date (StartDate/EndDate), not only the event date", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/earnings/sources.ts"), "utf8");
  assert.match(src, /StartDate=\$\{isoSec/);
  assert.match(src, /windows\(EARNINGS_SINCE, dayIn\(Date\.now\(\)\), 44\)/, "Impact allows at most 45 days per StartDate/EndDate pair");
});

test("eBay daily report: a repeated row counts once; Earnings and Other earnings are kept apart for checking", async () => {
  const { uniqueRecords, epnDailyParts } = await import("../src/lib/earnings/core");
  const row = { Date: "2026-10-20", CheckoutSite: "US", Earnings: "3.00", OtherEarnings: "0.50" };
  const recs = uniqueRecords([row, { ...row }, { ...row, CheckoutSite: "AU" }]);
  assert.equal(recs.length, 2);
  const parts = epnDailyParts(recs, "AUD");
  assert.deepEqual(parts.earnings, [{ day: "2026-10-20", currency: "AUD", cents: 600, pendingCents: 0 }]);
  assert.deepEqual(parts.other, [{ day: "2026-10-20", currency: "AUD", cents: 100, pendingCents: 0 }]);
});

// eBay's Today was always 0 (2026-10-28): EPN has no same-day data in Sydney's day.
test("a lagging source with nothing today shows its latest earning day; others never do", () => {
  const days = [
    { day: "2026-10-25", currency: "AUD", cents: 1200, pendingCents: 1200 },
    { day: "2026-10-26", currency: "AUD", cents: 2850, pendingCents: 2850 },
  ];
  const today = "2026-10-28";
  const ebay = latestDayFigure({ days, reportedThrough: "2026-10-27" }, today, "AUD");
  assert.equal(ebay?.day, "2026-10-26");
  assert.equal(ebay?.total.cents, 2850);
  assert.equal(latestDayFigure({ days }, today, "AUD"), null, "a source that does not lag keeps its real 0");
  assert.equal(latestDayFigure({ days: [...days, { day: today, currency: "AUD", cents: 5 }], reportedThrough: today }, today, "AUD"), null, "real same-day data wins");
  assert.equal(latestDayFigure({ days: [], reportedThrough: "" }, today, "AUD"), null);
  assert.equal(totalFor(days, "1d", today, "AUD").cents, 0, "Today's total itself stays dated, never borrowed");
});

test("latestReportDay reads every row's date, zero-earning rows too", () => {
  assert.equal(latestReportDay([{ Date: "10/26/2026", Earnings: "1.00" }, { Date: "10/27/2026", Earnings: "0" }, { Date: "" }], "Date"), "2026-10-27");
  assert.equal(latestReportDay([], "Date"), "");
});

test("growth line: running total and a least-squares trend", () => {
  const run = runningTotal([
    { label: "a", cents: 100, bySource: { ebay: 100 } },
    { label: "b", cents: 50, bySource: { tcgplayer: 50 } },
    { label: "c", cents: 30, bySource: { ebay: 30 } },
  ]);
  assert.deepEqual(run.map((b) => b.cents), [100, 150, 180]);
  assert.deepEqual(run[2].bySource, { ebay: 130, tcgplayer: 50 });
  assert.deepEqual(linearTrend([10, 20, 30, 40]), { start: 10, end: 40, slope: 10 });
  assert.equal(linearTrend([1, 2]), null);
  assert.equal(linearTrend([5, 5, 5])?.slope, 0);
});

// Forecast (2026-10-28; scenarios with stated assumptions since 2026-11-01, owner:
// "$250K next year … that's 5 million dollars in sales, which is kind of crazy").
const season = (day: string) => SEASON[Number(day.slice(5, 7)) - 1];
const src = (key: SourceResult["key"], daily: { label: string; cents: number }[]) => ({ key, days: daily.map((d) => ({ day: d.label, currency: "AUD", cents: d.cents })) });
const series = (from: string, to: string, f: (d: string, i: number) => number) => {
  const out: { label: string; cents: number }[] = [];
  let i = 0;
  for (let d = from; d <= to; d = addDays(d, 1), i++) out.push({ label: d, cents: f(d, i) });
  return out;
};
const NO_ADS = SCENARIOS.map((s) => ({ ...s, adsenseAudCentsPerDay: 0 }));

test("forecast: flat seasonal earnings project the season; actual days count as earned; scenarios are ordered", () => {
  const f = forecastQuarters([src("ebay", series("2026-07-01", "2026-10-27", (d) => 1000 * season(d)))], "2026-10-28", "AUD", NO_ADS)!;
  assert.equal(f.from, "2026-10-26", "the last two days (eBay's lag) are projected, not counted as earned");
  assert.deepEqual(f.periods.map((p) => p.label), ["Q4 2026", "Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"]);
  assert.equal(f.months.length, 15);
  assert.equal(f.perDayNow, 1000);
  assert.equal(f.observedPct28, 0);
  assert.equal(f.periods[0].actualCents, Math.round(25 * 1000 * season("2026-10-01")));
  const dec = f.months.find((m) => m.label === "2026-12")!;
  const jan = f.months.find((m) => m.label === "2027-01")!;
  assert.ok(dec.scenarios.base.cents > jan.scenarios.base.cents * 1.3, "December peak, January dip");
  for (const p of [...f.periods.slice(1), ...f.years])
    assert.ok(p.scenarios.conservative.cents < p.scenarios.base.cents && p.scenarios.base.cents < p.scenarios.optimistic.cents, p.label);
});

test("forecast: a business that doubled in six weeks is NOT extrapolated; growth is the scenario's, capped", () => {
  // A business that doubled in six weeks (the shape that made the old fit say ~13× a year).
  const daily = series("2026-09-01", "2026-10-30", (d, i) => Math.round(2000 * Math.exp(0.02 * i)));
  const f = forecastQuarters([src("ebay", daily)], "2026-11-01", "AUD", NO_ADS)!;
  assert.ok(f.observedPct28! > 50, "the doubling is reported…");
  const runRate = f.perDayNow * 365;
  const next = f.years[1].scenarios;
  assert.ok(next.optimistic.cents < runRate * 2.5, `…but the optimistic year is ${next.optimistic.cents} vs run rate ${runRate}`);
  assert.ok(next.base.cents < runRate * 1.4 && next.base.cents > runRate * 0.9);
  assert.ok(next.conservative.cents < runRate);
  // Implied sales = affiliate earnings ÷ commission.
  assert.equal(next.base.salesCents, Math.round(next.base.cents / ASSUMED_COMMISSION));
  assert.ok(SCENARIOS.every((s) => s.monthly <= FORECAST_MAX_MONTHLY));
  assert.ok(Math.abs(growthFactor(1, 30) - (1 + FORECAST_MAX_MONTHLY)) < 1e-9, "a scenario cannot exceed the cap");
});

test("forecast: only eBay and TCGplayer imply sales; AdSense is an assumption, not the run rate; too little data is null", () => {
  const daily = series("2026-08-01", "2026-10-30", () => 1000);
  const f = forecastQuarters([src("ebay", daily), src("stripe", daily), src("adsense", daily)], "2026-11-01", "AUD")!;
  assert.ok(Math.abs(f.affiliatePerDayNow * 2 - f.perDayNow) <= 1, "AdSense's history is left out of the run rate");
  const y = f.years[1].scenarios.base;
  assert.ok(y.salesCents < (y.cents / ASSUMED_COMMISSION) * 0.6, "Stripe and AdSense imply no store sales");
  assert.equal(forecastQuarters([src("ebay", daily.slice(-20))], "2026-11-01", "AUD"), null);
  assert.deepEqual(dailyTotals([{ days: [{ day: "2026-10-01", currency: "AUD", cents: 5 }, { day: "2026-10-29", currency: "AUD", cents: 9 }] }], "2026-10-28", "AUD"), [{ label: "2026-10-01", cents: 5 }]);
});
