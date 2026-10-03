import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collapseToWeekly, sydneyWeekKey } from "../src/lib/price-history";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-02: getPriceHistory's "All" range was, in effect, a point per day —
// PriceHistory wrote one row per card per TRACKED day until writes moved to
// weekly (HISTORY_MIN_INTERVAL_DAYS), and every card tracked before that
// switch still has that dense daily-era history sitting in the table. Reading
// it with a fixed `take` at the query level meant `take` got spent on a few
// months of dense daily rows before ever reaching anything older — "All"
// clipped to a few months of noise, not however far back the card's real
// history goes.
//
// Fix: read a bounded DATE window (not a row-count take), collapse same-week
// rows to one (the real lowest, on its real day), THEN cap to `take` points —
// so `take` limits real WEEKS of history, not raw rows. See price-history.ts's
// own comments on collapseToWeekly and computePriceHistory for the full
// reasoning.
// ─────────────────────────────────────────────────────────────────────────────

// Noon UTC, mid-June (AEST, no DST) — safely mid-day in Sydney too, so these
// are unambiguous regardless of timezone rounding at the day boundary.
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

test("collapseToWeekly collapses same-week rows to the real lowest, keeping its real day", () => {
  const rows = [
    { day: d("2026-06-15"), lowestPriceCents: 1000 }, // Mon, week 1
    { day: d("2026-06-17"), lowestPriceCents: 800 },  // Wed, week 1 — the real low
    { day: d("2026-06-19"), lowestPriceCents: 1200 }, // Fri, week 1
    { day: d("2026-06-22"), lowestPriceCents: 500 },  // Mon, week 2
  ];
  const out = collapseToWeekly(rows);
  assert.equal(out.length, 2, "4 rows across 2 weeks must collapse to 2 points");
  assert.equal(out[0].lowestPriceCents, 800, "must keep the real lowest of the week, not the first/last row");
  assert.equal(out[0].day.getTime(), d("2026-06-17").getTime(), "must keep the row's OWN real day, not the week's Monday");
  assert.equal(out[1].lowestPriceCents, 500);
});

test("rows already one-per-week pass through unchanged — no regression for the current write cadence", () => {
  const rows = [
    { day: d("2026-06-01"), lowestPriceCents: 100 },
    { day: d("2026-06-08"), lowestPriceCents: 200 },
    { day: d("2026-06-15"), lowestPriceCents: 300 },
  ];
  const out = collapseToWeekly(rows);
  assert.deepEqual(out.map((r) => r.lowestPriceCents), [100, 200, 300]);
  assert.deepEqual(out.map((r) => r.day.getTime()), rows.map((r) => r.day.getTime()));
});

test("output is sorted ascending by day regardless of input order", () => {
  const rows = [
    { day: d("2026-06-15"), lowestPriceCents: 300 },
    { day: d("2026-06-01"), lowestPriceCents: 100 },
    { day: d("2026-06-08"), lowestPriceCents: 200 },
  ];
  const out = collapseToWeekly(rows);
  assert.deepEqual(out.map((r) => r.lowestPriceCents), [100, 200, 300]);
});

test("sydneyWeekKey takes an optional date (for bucketing historical rows), defaulting to now", () => {
  const now = sydneyWeekKey();
  assert.match(now, /^\d{4}-\d{2}-\d{2}$/, "must still return a plain ISO day string when called with no args");
  const a = sydneyWeekKey(d("2026-06-17")); // Wed
  const b = sydneyWeekKey(d("2026-06-19")); // Fri, same week
  assert.equal(a, b, "two dates in the same week must produce the same key");
  const c = sydneyWeekKey(d("2026-06-22")); // Mon, next week
  assert.notEqual(a, c, "a date in the following week must produce a different key");
});

test("computePriceHistory reads a bounded date window and plots every recorded day, newest `take` of them", () => {
  // 2026-10-03: snapshots are daily again (day files, lib/price-history-store.ts),
  // so the card chart no longer buckets to weeks — it plots every recorded point:
  // daily before 2026-08-31 and from 2026-10-03, weekly in between. The lesson
  // of the bucketing fix still holds: bound the read by DATE, not by a row count
  // at the read, and `take` is generous enough (over a year of daily points)
  // that "All" is never clipped to a few months of dense rows.
  // collapseToWeekly (tested above) stays for the rise predictor's weekly model.
  const code = codeOnly(read("src/lib/price-history.ts"));
  const fnStart = code.indexOf("async function computePriceHistory");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);

  assert.match(fn, /const cutoff = new Date\(Date\.now\(\) - MAX_LOOKBACK_DAYS \* 86400_000\)/, "must bound the read by a generous date window");
  assert.match(fn, /cardHistoryRows\(\{ cardIds: \[cardId\], since: cutoff \}\)\.slice\(-take\)/, "read the window, then keep the newest `take` points");
  assert.doesNotMatch(fn, /collapseToWeekly/, "the chart plots daily points now");
  const take = /export function getPriceHistory\(cardId: string, country: Country = DEFAULT_COUNTRY, take = (\d+)\)/.exec(code);
  assert.ok(take && Number(take[1]) >= 365, "the default `take` must cover more than a year of daily points");
});

test("MAX_LOOKBACK_DAYS is its own constant here, deliberately independent of the Index engines' identical value", () => {
  const code = codeOnly(read("src/lib/price-history.ts"));
  assert.match(code, /const MAX_LOOKBACK_DAYS = 730/);
});

test("the chart's empty state no longer claims a daily cadence it doesn't have", () => {
  const src = read("src/components/PriceChart.tsx");
  assert.doesNotMatch(src, /daily price points/i);
});

test("the public per-card history API no longer describes itself as daily", () => {
  const src = codeOnly(read("src/app/api/v1/card/[id]/history.json/route.ts"));
  assert.doesNotMatch(src, /daily price series/i);
});

test("collapseToWeekly's fast week bucket agrees with sydneyWeekKey on every date-only day, across both DST changes", () => {
  // collapseToWeekly buckets date-only points (UTC midnight of the Sydney day)
  // by plain arithmetic instead of formatting each through Intl — formatting
  // took 5–10 s for the rise predictor's daily points (2026-10-03). The buckets
  // must be exactly the ones sydneyWeekKey gives.
  const start = Date.parse("2025-09-01T00:00:00Z");
  for (let i = 0; i < 2 * 366; i++) {
    const day = new Date(start + i * 86400_000);
    const [only] = collapseToWeekly([{ day, lowestPriceCents: 1 }]);
    const sameWeek = collapseToWeekly([
      { day, lowestPriceCents: 5 },
      { day: new Date(`${sydneyWeekKey(day)}T00:00:00Z`), lowestPriceCents: 3 },
    ]);
    assert.equal(only.day.getTime(), day.getTime());
    assert.equal(sameWeek.length, 1, `${day.toISOString().slice(0, 10)} and its sydneyWeekKey Monday must share a bucket`);
  }
  // A value that is not a UTC midnight still takes the timezone path:
  // 20:00 UTC on Sunday 2026-09-06 is Monday 7 Sep in Sydney, the next week.
  const lateSunday = new Date("2026-09-06T20:00:00Z");
  const out = collapseToWeekly([
    { day: lateSunday, lowestPriceCents: 1 },
    { day: new Date("2026-09-06T00:00:00Z"), lowestPriceCents: 2 },
  ]);
  assert.equal(out.length, 2, "Sydney's Monday is a new week even though the UTC date is Sunday");
});
