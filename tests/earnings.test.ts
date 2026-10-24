import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDays,
  adsenseDays,
  dayIn,
  epnDays,
  impactDays,
  inRange,
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

test("eBay Partner Network: Performance by Day rows, earnings in each checkout site's currency", () => {
  const days = epnDays({
    Records: [
      { Date: "2026-10-22", CheckoutSite: "US", Earnings: "3.20", OtherEarnings: "0.30" },
      { Date: "2026-10-22", CheckoutSite: "AU", Earnings: "1.10" },
      { Date: "2026-10-23", CheckoutSite: "UK", Earnings: "0" },
      { Date: "bad", CheckoutSite: "US", Earnings: "5" },
    ],
  });
  assert.deepEqual(days, [
    { day: "2026-10-22", currency: "USD", cents: 350, pendingCents: 0 },
    { day: "2026-10-22", currency: "AUD", cents: 110, pendingCents: 0 },
  ]);
  // A bare array and lower-case keys parse the same; an unknown shape is empty, not a crash.
  assert.equal(epnDays([{ date: "2026-10-22", checkoutsite: "US", earnings: "1" }])[0].cents, 100);
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
