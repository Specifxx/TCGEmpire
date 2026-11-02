// EMPIRE HQ's rows: one per site, Google clicks against the week's target, earnings
// by affiliate tag, health, and the owner's open steps. PURE (buildHqRows); the
// loader is lib/hq/load.ts. DECISIONS.md, "Empire HQ and the one Monday report".
import type { Severity } from "../ops/types";
import { addDays } from "../earnings/core";
import type { SiteRow } from "../earnings/sites";
import { GROWTH_TARGETS } from "../admin-growth";
import { HQ_SITES, normaliseHost, siteForTag, type HqSite } from "./sites";
import type { SiteHealth } from "./status";
import type { StepView } from "./owner-steps";

export interface Week {
  last7: number | null;
  prev7: number | null;
}

export interface HqRow {
  site: HqSite;
  clicks: Week;
  /** Week-over-week change in %, null without both weeks or from zero. */
  clicksPct: number | null;
  targetPct: number;
  /** null when a week lacks data. */
  met: boolean | null;
  /** Display cents (AUD), last 7 full days and the 7 before; null when earnings did not load. */
  earned: Week;
  /** Vercel cost, last 7 full days (null when the billing token is not set). */
  cost7: number | null;
  health: SiteHealth;
  openSteps: number;
}

export interface GscSnapshot {
  updatedAt?: string;
  sites?: Record<string, { status: string; days: { d: string; clicks: number }[] }>;
}

/**
 * Last 7 settled Search Console days against the 7 before, per host. Search
 * Console is two days behind, so the weeks end at the newest day any property
 * reported (no later than two days ago); the same days for every site.
 * Properties of one host (URL prefix and Domain) are merged by the per-day max.
 */
export function gscWeeks(j: GscSnapshot | null | undefined, today: string): { end: string | null; hosts: Map<string, Week> } {
  const perHost = new Map<string, Map<string, number>>();
  for (const [prop, s] of Object.entries(j?.sites ?? {})) {
    if (s.status !== "ok") continue;
    const host = normaliseHost(prop);
    const m = perHost.get(host) ?? new Map<string, number>();
    for (const x of s.days) m.set(x.d, Math.max(m.get(x.d) ?? 0, x.clicks));
    perHost.set(host, m);
  }
  let end: string | null = null;
  const cap = addDays(today, -2);
  for (const m of perHost.values()) for (const d of m.keys()) if (d <= cap && (!end || d > end)) end = d;
  const hosts = new Map<string, Week>();
  if (!end) return { end, hosts };
  const sum = (m: Map<string, number>, from: string, to: string) => {
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) n += m.get(d) ?? 0;
    return n;
  };
  for (const [host, m] of perHost) {
    const first = [...m.keys()].sort()[0];
    const prevFrom = addDays(end, -13);
    hosts.set(host, { last7: sum(m, addDays(end, -6), end), prev7: first && first <= prevFrom ? sum(m, prevFrom, addDays(end, -7)) : null });
  }
  return { end, hosts };
}

export const pctChange = (w: Week): number | null => (w.last7 == null || w.prev7 == null || w.prev7 === 0 ? null : Math.round(((w.last7 - w.prev7) / w.prev7) * 100));

/** Earnings and cost rows (siteLedger, keyed by tag prefix) summed into HQ sites. */
export function ledgerBySite(rows: readonly SiteRow[] | null): Map<string, { earned: number; vercel: number }> {
  const out = new Map<string, { earned: number; vercel: number }>();
  for (const r of rows ?? []) {
    const site = siteForTag(r.key) ?? HQ_SITES.find((s) => s.key === r.key) ?? null;
    if (!site) continue;
    const t = out.get(site.key) ?? { earned: 0, vercel: 0 };
    t.earned += r.earned;
    t.vercel += r.vercel;
    out.set(site.key, t);
  }
  return out;
}

export function buildHqRows(input: {
  gsc: { hosts: Map<string, Week> };
  ledgerLast: readonly SiteRow[] | null;
  ledgerPrev: readonly SiteRow[] | null;
  costsConnected: boolean;
  health: readonly SiteHealth[];
  steps: readonly StepView[];
}): HqRow[] {
  const last = ledgerBySite(input.ledgerLast);
  const prev = ledgerBySite(input.ledgerPrev);
  return HQ_SITES.map((site) => {
    const clicks = input.gsc.hosts.get(site.host) ?? { last7: null, prev7: null };
    const targetPct = site.rift ? GROWTH_TARGETS.rift.pct : GROWTH_TARGETS.sisters.pct;
    const met = clicks.last7 == null || clicks.prev7 == null ? null : clicks.last7 >= clicks.prev7 * (1 + targetPct / 100);
    const health: SiteHealth = input.health.find((h) => h.key === site.key) ?? { key: site.key, severity: "unknown" as Severity, at: null, source: "probe", problems: [], summary: "Not collected yet.", link: null };
    return {
      site,
      clicks,
      clicksPct: pctChange(clicks),
      targetPct,
      met,
      earned: { last7: input.ledgerLast ? last.get(site.key)?.earned ?? 0 : null, prev7: input.ledgerPrev ? prev.get(site.key)?.earned ?? 0 : null },
      cost7: input.costsConnected && input.ledgerLast ? last.get(site.key)?.vercel ?? 0 : null,
      health,
      openSteps: input.steps.filter((s) => !s.doneAt && (s.site === site.key || (site.rift && s.site === "all"))).length,
    };
  });
}

/** The family's headline: every site's clicks against the two targets. */
export function familyTotals(rows: readonly HqRow[]): { sisters: Week; rift: Week; all: Week } {
  const add = (pick: (r: HqRow) => boolean, k: keyof Week) => {
    const xs = rows.filter(pick).map((r) => r.clicks[k]);
    return xs.some((x) => x != null) ? xs.reduce<number>((n, x) => n + (x ?? 0), 0) : null;
  };
  const w = (pick: (r: HqRow) => boolean): Week => ({ last7: add(pick, "last7"), prev7: add(pick, "prev7") });
  return { sisters: w((r) => !r.site.rift), rift: w((r) => !!r.site.rift), all: w(() => true) };
}
