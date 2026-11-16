// THE FAMILY'S TWO TREND TARGETS (owner, 2026-11-16: Empire HQ only measured Google clicks, while the
// north star is clicks and earnings growing week on week). They sit beside the Google-click targets in
// lib/admin-growth.ts and never replace or hide them. Visitors compare the last 7 days with the 7 before
// (Vercel Web Analytics). Earnings compare the average of the last two whole weeks with the two before,
// so one lumpy week (a few huge TCGplayer orders) cannot read as a slowdown or a surge on its own.
// PURE: callers pass in the data.
import { addDays } from "../earnings/core";
import type { SourceResult } from "../earnings/core";
import { buildGrowthReport } from "../earnings/growth-report";
import type { Week } from "./view";

export const FAMILY_TRENDS = {
  visitors: { label: "Visitors, every site", pct: 5 },
  earnings: { label: "Earnings, 2-week average", pct: 10 },
} as const;

type BuyDays = readonly { key: string; days: readonly { day: string; visitors: number }[] }[];

/** Visitors over the 7 full days before `today`, against the 7 before; null when no site reports a day. */
export function visitorsWeek(sites: BuyDays, today: string): Week {
  const sum = (from: string, to: string) => {
    let seen = false;
    let t = 0;
    for (const s of sites) for (const d of s.days) if (d.day >= from && d.day <= to) ((seen = true), (t += d.visitors));
    return seen ? t : null;
  };
  return { last7: sum(addDays(today, -7), addDays(today, -1)), prev7: sum(addDays(today, -14), addDays(today, -8)) };
}

/** Average of the last two whole weeks against the two before (cents), from the growth report's weeks. */
export function earningsTrend(sources: readonly SourceResult[], today: string): Week {
  const r = buildGrowthReport(sources, new Map(), today);
  const totals = r.weeks.map((_, i) => r.sources.reduce((n, l) => n + l.weeks[i], 0));
  if (totals.length < 4) return { last7: null, prev7: null };
  const avg = (a: readonly number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return { last7: avg(totals.slice(-2)), prev7: avg(totals.slice(-4, -2)) };
}

export function trendMet(w: Week, pct: number): boolean | null {
  return w.last7 == null || w.prev7 == null || w.prev7 === 0 ? null : w.last7 >= w.prev7 * (1 + pct / 100);
}

