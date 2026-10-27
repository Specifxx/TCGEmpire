import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { loadEarnings } from "./earnings/sources";
import { addDays, dayIn, toDisplay, SOURCE_LABELS, type EarningsSourceKey } from "./earnings/core";

// The owner's growth view, /admin/growth (2026-10-27: "I need to be able to
// visualize this growth, and I need to see like people actually clicking these
// links"). Uncached reads, admin only. One series per signal, 28 days a bar, and
// the headline compares the last 7 full days with the 7 before them: one day
// against the next is mostly noise (weekday, a big post, a set launch).
//
//   Google clicks    Search Console, stored every 3h by scripts/growth-snapshot.ts
//   Card views       DemandSnapshot day-on-day diff (what visitors open on the site)
//   eBay clicks      ClickEvent (the site's own outbound eBay links)
//   Earnings         every source on /admin/earnings, per day, in AUD

export const GROWTH_DAYS = 28;

export interface Series {
  key: string;
  label: string;
  unit: "count" | "money";
  note: string;
  points: { d: string; v: number | null }[];
  /** Last 7 full days vs the 7 before; null when either week lacks data. */
  last7: number | null;
  prev7: number | null;
}

export function weekCompare(points: { d: string; v: number | null }[]): { last7: number | null; prev7: number | null } {
  // The newest day is today (partial): weeks are the 7 full days before it, and the 7 before those.
  // A source that reports late (Search Console is two days behind) ends in empty days: the weeks
  // end at its newest reported day instead, so it still gets a comparison.
  const full = points.slice(0, -1);
  while (full.length && full[full.length - 1].v == null) full.pop();
  const sum = (xs: { v: number | null }[]) => (xs.length === 7 && xs.every((x) => x.v != null) ? xs.reduce((a, x) => a + (x.v ?? 0), 0) : null);
  return { last7: sum(full.slice(-7)), prev7: sum(full.slice(-14, -7)) };
}

function daysEnding(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

function series(key: string, label: string, unit: Series["unit"], note: string, days: string[], get: (d: string) => number | null): Series {
  const points = days.map((d) => ({ d, v: get(d) }));
  return { key, label, unit, note, points, ...weekCompare(points) };
}

export async function loadGrowth(): Promise<{ series: Series[]; earningsBySource: Series[]; gscUpdatedAt: string | null; errors: string[] }> {
  const today = dayIn(Date.now());
  const days = daysEnding(today, GROWTH_DAYS);
  const since = new Date(Date.now() - (GROWTH_DAYS + 2) * 86400_000);
  const errors: string[] = [];
  const out: Series[] = [];

  // Google (Search Console's own day; the last two days are not final).
  let gscUpdatedAt: string | null = null;
  try {
    const row = await prisma.opsSnapshot.findUnique({ where: { key: "growth:gsc" } });
    const j = row?.json as { updatedAt?: string; sites?: Record<string, { status: string; days: { d: string; clicks: number }[] }> } | undefined;
    gscUpdatedAt = j?.updatedAt ?? null;
    for (const [prop, site] of Object.entries(j?.sites ?? {})) {
      if (site.status !== "ok") continue;
      const m = new Map(site.days.map((x) => [x.d, x.clicks]));
      const name = prop.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/$/, "");
      out.push(series(`gsc:${name}`, `Google clicks · ${name}`, "count", "Search Console; the newest 2 days are still filling in.", days, (d) => m.get(d) ?? (d >= addDays(today, -2) ? null : 0)));
    }
    if (!row) errors.push("Google clicks: no snapshot yet (it is stored every 3 hours by the ops monitor).");
  } catch {
    errors.push("Google clicks: could not read the snapshot.");
  }

  // Card views and searches on the site: day-on-day diff of the cumulative counters.
  try {
    const snap = await prisma.demandSnapshot.groupBy({
      by: ["day"],
      where: { day: { gte: since } },
      _sum: { viewCount: true, searchCount: true },
      orderBy: { day: "asc" },
    });
    const views = new Map<string, number>();
    const searches = new Map<string, number>();
    for (let i = 1; i < snap.length; i++) {
      const a = snap[i - 1];
      const b = snap[i];
      const gap = Math.max(1, Math.round((b.day.getTime() - a.day.getTime()) / 86400_000));
      const d = b.day.toISOString().slice(0, 10);
      const dv = (b._sum.viewCount ?? 0) - (a._sum.viewCount ?? 0);
      const ds = (b._sum.searchCount ?? 0) - (a._sum.searchCount ?? 0);
      if (dv >= 0) views.set(d, Math.round(dv / gap));
      if (ds >= 0) searches.set(d, Math.round(ds / gap));
    }
    out.push(series("views", "Card page views", "count", "One per browser per card per day.", days, (d) => views.get(d) ?? null));
    out.push(series("searches", "Card searches", "count", "Searches that opened a card.", days, (d) => searches.get(d) ?? null));
  } catch {
    errors.push("Card views: could not read DemandSnapshot.");
  }

  // Outbound eBay clicks, per Sydney day.
  try {
    const rows = await dbHistory.$queryRaw<{ d: string; n: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD') AS d, count(*) AS n
      FROM "ClickEvent"
      WHERE "createdAt" >= ${since} AND retailer LIKE 'ebay%'
      GROUP BY 1`;
    const m = new Map(rows.map((r) => [r.d, Number(r.n)]));
    out.push(series("ebay-clicks", "eBay link clicks (this site)", "count", "Clicks on RiftCompare's own eBay links.", days, (d) => m.get(d) ?? 0));
  } catch {
    errors.push("eBay clicks: could not read ClickEvent.");
  }

  // Earnings per day, every source, in AUD.
  const earningsBySource: Series[] = [];
  try {
    const sources = await loadEarnings(false);
    const total = new Map<string, number>();
    for (const s of sources) {
      if (s.status === "not-configured") continue;
      const m = new Map<string, number>();
      for (const x of s.days) {
        const c = toDisplay(x.cents, x.currency, "AUD");
        m.set(x.day, (m.get(x.day) ?? 0) + c);
        total.set(x.day, (total.get(x.day) ?? 0) + c);
      }
      earningsBySource.push(series(`earn:${s.key}`, SOURCE_LABELS[s.key as EarningsSourceKey], "money", s.status === "error" ? "This source answered with an error; see /admin/earnings." : "Per the network's own report; recent days can still change.", days, (d) => m.get(d) ?? 0));
    }
    out.push(series("earnings", "Earnings, all sources (A$)", "money", "Networks report sales late: the newest days usually rise.", days, (d) => total.get(d) ?? 0));
  } catch {
    errors.push("Earnings: could not load the sources.");
  }

  return { series: out, earningsBySource, gscUpdatedAt, errors };
}
