// VISITS AND BUY CLICKS FOR EVERY SITE (2026-11-01, owner: "an analytics page in
// the admin … the line graph that compares the last seven days, 30 days, 90 days,
// 12 months of all of the websites on that one graph … a line to show the
// cumulative total … also focus on buy_click events and compare that").
// DECISIONS.md, "Admin analytics page from Vercel's Web Analytics API".
//
// PURE and client-safe: lib/analytics/vercel.ts fetches, this parses the API's
// rows and shapes them for the chart. Nothing here reads the environment.

export type Range = "7d" | "30d" | "90d" | "12m";
export const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
];

export type Metric = "visitors" | "pageviews" | "clicks" | "rate";
export const METRICS: { key: Metric; label: string; note: string }[] = [
  { key: "visitors", label: "Visitors", note: "Each day's visitors, as Vercel counts them." },
  { key: "pageviews", label: "Page views", note: "Every page view." },
  { key: "clicks", label: "Buy clicks", note: "buy_click events: a visitor leaving for a store, eBay, TCGplayer or Amazon." },
  { key: "rate", label: "Buy clicks per 100 visitors", note: "Buy clicks ÷ visitors × 100, for the same days." },
];

/** One time bucket (a day, or a week for the 12-month view) of one site. */
export interface Point {
  t: string; // YYYY-MM-DD, the bucket's first day (UTC)
  visitors: number;
  pageviews: number;
  clicks: number;
}

export interface SiteSeries {
  key: string;
  label: string;
  projects: string[];
  daily: Point[]; // last 90 days
  weekly: Point[]; // last 12 months
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Rows of `visits/aggregate` or `events/aggregate` grouped by a time unit, as
 * one row per bucket: visits give pageviews and visitors, events give count
 * and visitors. A row without a usable timestamp is skipped.
 */
export function parseTimeRows(json: unknown): { t: string; pageviews: number; visitors: number; count: number }[] {
  const data = (json && typeof json === "object" ? (json as { data?: unknown }).data : null) ?? [];
  if (!Array.isArray(data)) return [];
  const out: { t: string; pageviews: number; visitors: number; count: number }[] = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const t = String(row.timestamp ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    out.push({ t, pageviews: num(row.pageviews), visitors: num(row.visitors), count: num(row.count) });
  }
  return out;
}

/** Visits rows and buy_click rows for the same buckets, joined and summed by bucket (several projects can be one site). */
export function joinPoints(
  visits: readonly { t: string; pageviews: number; visitors: number }[],
  clicks: readonly { t: string; count: number }[],
): Point[] {
  const m = new Map<string, Point>();
  const at = (t: string) => {
    const p = m.get(t) ?? { t, visitors: 0, pageviews: 0, clicks: 0 };
    m.set(t, p);
    return p;
  };
  for (const v of visits) {
    const p = at(v.t);
    p.visitors += v.visitors;
    p.pageviews += v.pageviews;
  }
  for (const c of clicks) at(c.t).clicks += c.count;
  return [...m.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The buckets a range draws: the last N days (daily data), or every week of the last year (weekly data). */
export function bucketsFor(range: Range, today: string, weeklyStarts: readonly string[]): string[] {
  if (range === "12m") {
    const from = addDays(today, -364);
    const starts = [...new Set(weeklyStarts)].filter((t) => t >= addDays(from, -6) && t <= today).sort();
    return starts;
  }
  const days = RANGES.find((r) => r.key === range)!.days;
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
}

export function value(p: Pick<Point, "visitors" | "pageviews" | "clicks"> | undefined, metric: Metric): number {
  if (!p) return 0;
  if (metric === "rate") return p.visitors ? (p.clicks / p.visitors) * 100 : 0;
  return p[metric];
}

export interface ChartLine {
  key: string;
  label: string;
  values: number[];
}

/**
 * One line per site over `buckets`, plus the all-sites total when asked. A
 * running total (`cumulative`) adds each bucket to the ones before it; for the
 * rate it is the rate of everything so far (clicks so far ÷ visitors so far),
 * never a sum of percentages, and the total's rate is all clicks ÷ all visitors.
 */
export function chartLines(
  sites: readonly SiteSeries[],
  range: Range,
  buckets: readonly string[],
  metric: Metric,
  opts: { total: boolean; cumulative: boolean },
): ChartLine[] {
  const pick = (s: SiteSeries) => (range === "12m" ? s.weekly : s.daily);
  const rows = sites.map((s) => {
    const by = new Map(pick(s).map((p) => [p.t, p]));
    return { key: s.key, label: s.label, points: buckets.map((t) => by.get(t) ?? { t, visitors: 0, pageviews: 0, clicks: 0 }) };
  });
  if (opts.total) {
    rows.push({
      key: "total",
      label: "All sites",
      points: buckets.map((t, i) =>
        rows.reduce((a, r) => ({ t, visitors: a.visitors + r.points[i].visitors, pageviews: a.pageviews + r.points[i].pageviews, clicks: a.clicks + r.points[i].clicks }), {
          t,
          visitors: 0,
          pageviews: 0,
          clicks: 0,
        }),
      ),
    });
  }
  return rows.map((r) => {
    if (!opts.cumulative) return { key: r.key, label: r.label, values: r.points.map((p) => value(p, metric)) };
    const run = { visitors: 0, pageviews: 0, clicks: 0 };
    return {
      key: r.key,
      label: r.label,
      values: r.points.map((p) => {
        run.visitors += p.visitors;
        run.pageviews += p.pageviews;
        run.clicks += p.clicks;
        return value(run, metric);
      }),
    };
  });
}

export interface SiteTotals {
  key: string;
  label: string;
  visitors: number;
  pageviews: number;
  clicks: number;
  rate: number | null; // buy clicks per 100 visitors
  /** The same totals for the period just before, when the data reaches back that far (7 and 30 days). */
  prevVisitors: number | null;
  prevClicks: number | null;
}

/** Each site's totals over the range, biggest first by visitors, with an "All sites" row last. */
export function siteTotals(sites: readonly SiteSeries[], range: Range, today: string): SiteTotals[] {
  const days = RANGES.find((r) => r.key === range)!.days;
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const hasPrev = range === "7d" || range === "30d";
  const sum = (pts: readonly Point[], a: string, b: string) =>
    pts.filter((p) => p.t >= a && p.t <= b).reduce((s, p) => ({ visitors: s.visitors + p.visitors, pageviews: s.pageviews + p.pageviews, clicks: s.clicks + p.clicks }), { visitors: 0, pageviews: 0, clicks: 0 });
  const rows: SiteTotals[] = sites.map((s) => {
    // 12 months reads the weekly buckets; a week starting up to 6 days before the window still counts, as on the chart.
    const cur = range === "12m" ? sum(s.weekly, addDays(from, -6), today) : sum(s.daily, from, today);
    const prev = hasPrev ? sum(s.daily, prevFrom, addDays(from, -1)) : null;
    return {
      key: s.key,
      label: s.label,
      ...cur,
      rate: cur.visitors ? (cur.clicks / cur.visitors) * 100 : null,
      prevVisitors: prev ? prev.visitors : null,
      prevClicks: prev ? prev.clicks : null,
    };
  });
  rows.sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label));
  const all = rows.reduce(
    (a, r) => ({
      visitors: a.visitors + r.visitors,
      pageviews: a.pageviews + r.pageviews,
      clicks: a.clicks + r.clicks,
      prevVisitors: a.prevVisitors == null || r.prevVisitors == null ? null : a.prevVisitors + r.prevVisitors,
      prevClicks: a.prevClicks == null || r.prevClicks == null ? null : a.prevClicks + r.prevClicks,
    }),
    { visitors: 0, pageviews: 0, clicks: 0, prevVisitors: hasPrev ? 0 : null, prevClicks: hasPrev ? 0 : null } as {
      visitors: number;
      pageviews: number;
      clicks: number;
      prevVisitors: number | null;
      prevClicks: number | null;
    },
  );
  rows.push({ key: "total", label: "All sites", ...all, rate: all.visitors ? (all.clicks / all.visitors) * 100 : null });
  return rows;
}
