import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { portfolioPerformance, type PerfHolding } from "../src/lib/portfolio-performance";
import { METHODOLOGY_BREAKS } from "../src/lib/market-index";

// ─────────────────────────────────────────────────────────────────────────────
// /portfolio's 7- and 30-day moves and its value chart (2026-09-25).
//
// The old code compared two raw sums of "every holding priced on that day". A
// card priced for the FIRST time inside the window joined only the later sum, so
// its whole value read as growth: Radiance prices from its 23 Oct release, and
// every Radiance card in a binder would have shown as a gain. It also had a
// "1 day" chip that was the weekly step relabelled, and it charted the 23 Sep
// TCGplayer re-basing as a crash. These run the maths on synthetic series.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400_000;
const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const series = (points: Record<string, number>) => new Map(Object.entries(points).map(([k, v]) => [d(k), v]));
const nm = (cardId: string, quantity = 1): PerfHolding => ({ cardId, quantity, multiplier: 1 });

test("d7 compares only holdings priced at both ends: a newly priced card is never a gain", () => {
  // A is flat at $10. B (a Radiance card, say) gets its first price in the
  // latest snapshot, at $50. Raw sums would say $10 → $60, +500%.
  const byCard = new Map([
    ["A", series({ "2026-11-06": 1000, "2026-11-13": 1000 })],
    ["B", series({ "2026-11-13": 5000 })],
  ]);
  const perf = portfolioPerformance([nm("A"), nm("B")], byCard);
  assert.equal(perf.change(7), 0, "B was not priced a week ago, so it sits the week out");
  // The chart's latest point is still the real total, B included…
  assert.equal(perf.series.at(-1)!.v, 6000);
  // …and the line does not jump on B's debut.
  assert.equal(perf.series[0].v, 6000);
});

test("d7 is the ratio over the holdings priced at both window endpoints, weighted by quantity and condition", () => {
  const byCard = new Map([
    ["A", series({ "2026-11-06": 1000, "2026-11-13": 1100 })], // +10%
    ["B", series({ "2026-11-06": 2000, "2026-11-13": 1800 })], // −10%
    ["C", series({ "2026-11-13": 9999 })], // new: excluded
  ]);
  // 3 × A (NM) and 1 × B at LP (0.85): start 3000 + 1700 = 4700, end 3300 + 1530 = 4830.
  const holdings: PerfHolding[] = [nm("A", 3), { cardId: "B", quantity: 1, multiplier: 0.85 }, nm("C")];
  const perf = portfolioPerformance(holdings, byCard);
  assert.equal(perf.change(7), Math.round(((4830 - 4700) / 4700) * 1000) / 10);
});

test("d30 never counts a debut, but a card you hold still counts from its second price", () => {
  // A flat throughout. B debuts on 10-23 at $20 and falls to $10 by 11-13 —
  // a real loss on a card this binder holds. Old raw sums: +200% (debut). An
  // "A only" window would hide B's real fall; chaining week by week shows it.
  const byCard = new Map([
    ["A", series({ "2026-10-09": 1000, "2026-10-16": 1000, "2026-10-23": 1000, "2026-10-30": 1000, "2026-11-06": 1000, "2026-11-13": 1000 })],
    ["B", series({ "2026-10-23": 2000, "2026-10-30": 1500, "2026-11-06": 1000, "2026-11-13": 1000 })],
  ]);
  const perf = portfolioPerformance([nm("A"), nm("B")], byCard);
  const d30 = perf.change(30)!;
  assert.ok(d30 < 0, `B's fall after its first price is real, got ${d30}`);
  // (1000+1500)/(1000+2000) × (1000+1000)/(1000+1500) = 2000/3000 → −33.3%
  assert.equal(d30, -33.3);
  // The debut week (10-16 → 10-23) is flat on the chart.
  const at = (iso: string) => perf.series.find((p) => p.t === d(iso))!.v;
  assert.equal(at("2026-10-16"), at("2026-10-23"));
});

test("a step ending inside a methodology break is held flat, as on the Index", () => {
  // The 2026-09-23 re-basing: every card's recorded low drops ~25% at once.
  const byCard = new Map([
    ["A", series({ "2026-09-02": 1000, "2026-09-09": 1000, "2026-09-16": 1000, "2026-09-23": 750, "2026-10-07": 780 })],
  ]);
  const perf = portfolioPerformance([nm("A")], byCard, METHODOLOGY_BREAKS);
  // 09-16 → 09-23 ends in the break: no −25% on the chart…
  const at = (iso: string) => perf.series.find((p) => p.t === d(iso))!.v;
  assert.equal(at("2026-09-16"), at("2026-09-23"));
  // …and d30 is only the measured move after it (750 → 780 = +4%).
  assert.equal(perf.change(30), 4);
  // Without the break the same data is a crash.
  assert.equal(portfolioPerformance([nm("A")], byCard).change(30), -22);
});

test("a window made only of break steps has no move: null, not 0%", () => {
  const byCard = new Map([["A", series({ "2026-09-16": 1000, "2026-09-23": 750 })]]);
  const perf = portfolioPerformance([nm("A")], byCard, METHODOLOGY_BREAKS);
  assert.equal(perf.change(7), null, "the chip hides rather than claiming 'unchanged'");
});

test("no snapshot a full window back means no figure, and one snapshot charts nothing to compare", () => {
  const byCard = new Map([["A", series({ "2026-11-10": 1000, "2026-11-13": 1200 })]]);
  const perf = portfolioPerformance([nm("A")], byCard);
  assert.equal(perf.change(7), null, "3 days of history is not a 7-day move");
  assert.equal(portfolioPerformance([nm("A")], new Map([["A", series({ "2026-11-13": 1000 })]])).change(7), null);
  assert.deepEqual(portfolioPerformance([], new Map()).series, []);
});

test("a steady binder charts exactly its raw value — nothing changes when nothing debuts", () => {
  const byCard = new Map([
    ["A", series({ "2026-10-30": 1000, "2026-11-06": 1200, "2026-11-13": 900 })],
    ["B", series({ "2026-10-30": 500, "2026-11-06": 500, "2026-11-13": 600 })],
  ]);
  const perf = portfolioPerformance([nm("A", 2), nm("B")], byCard);
  assert.deepEqual(
    perf.series.map((p) => p.v),
    [2500, 2900, 2400],
  );
  assert.equal(perf.change(7), Math.round(((2400 - 2900) / 2900) * 1000) / 10);
  assert.equal(perf.series[0].t + 14 * DAY, perf.series[2].t);
});

const codeOnly = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("/portfolio has no '1 day' chip and says the history is weekly", () => {
  const page = codeOnly("src/app/portfolio/page.tsx");
  assert.doesNotMatch(page, /label="1 day"/, "the weekly step is not a 1-day move");
  assert.match(page, /after the next weekly snapshot/);
  assert.doesNotMatch(page, /check back tomorrow/);
  // The dead re-gate branch advertised "Daily history" and paid "unlimited price alerts".
  assert.doesNotMatch(page, /Daily history|unlimited price alerts/);
  const lib = codeOnly("src/lib/premium.ts");
  assert.doesNotMatch(lib, /\bd1:/, "Portfolio carries no d1");
  assert.match(lib, /portfolioPerformance\([\s\S]*?METHODOLOGY_BREAKS,?\s*\)/, "the series applies the methodology breaks");
});
