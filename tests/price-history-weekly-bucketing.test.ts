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

test("computePriceHistory reads the CDN-published per-card series and slices to `take` points", () => {
  // DECISIONS.md, "History off Neon": the old bounded-date-window Postgres
  // query + collapseToWeekly bucketing is gone. scripts/export-history.ts
  // already guarantees at most one point per day per card in the published
  // JSON, so there is nothing left to bucket at read time — a plain
  // chronological slice of the last `take` points is the whole job now.
  const code = codeOnly(read("src/lib/price-history.ts"));
  const fnStart = code.indexOf("async function computePriceHistory");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);

  assert.match(fn, /getCardSeries\(cardId\)/, "must read the per-card CDN file");
  assert.doesNotMatch(fn, /dbHistory\./, "must not query Postgres");
  assert.match(fn, /series\.p\.slice\(-take\)/, "must cap to the last `take` points, chronologically");
});

test("collapseToWeekly stays exported as a tested utility even though computePriceHistory no longer calls it", () => {
  // Kept for any future raw-Postgres reader that needs to collapse legacy
  // dense history — see its own comment in price-history.ts.
  const code = codeOnly(read("src/lib/price-history.ts"));
  assert.match(code, /export function collapseToWeekly/);
});

test("the chart's empty state no longer claims a daily cadence it doesn't have", () => {
  const src = read("src/components/PriceChart.tsx");
  assert.doesNotMatch(src, /daily price points/i);
});

test("the public per-card history API no longer describes itself as daily", () => {
  const src = codeOnly(read("src/app/api/v1/card/[id]/history.json/route.ts"));
  assert.doesNotMatch(src, /daily price series/i);
});
