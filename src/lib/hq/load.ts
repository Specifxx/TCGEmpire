// EMPIRE HQ's loader: admin pages and the Monday report route only (uncached, a
// handful of small rows: the collector's snapshot, the Search Console snapshot,
// the monitor's report and the steps-done row), plus the earnings sources through
// their own 30-minute memo. Never from a public page. DECISIONS.md, "Empire HQ and
// the one Monday report".
import { prisma } from "../db";
import { getLatestReport, SNAPSHOT_STALE_HOURS } from "../ops/snapshot";
import { loadEarnings } from "../earnings/sources";
import { loadCosts } from "../earnings/costs";
import { addDays, dayIn } from "../earnings/core";
import { siteLedger, span } from "../earnings/sites";
import { healthFromReport, parseHqSnapshot, type SiteHealth } from "./status";
import { loadSteps, parseDone, stepViews, STEPS_DONE_KEY, type StepView } from "./owner-steps";
import { buildHqRows, familyTotals, gscWeeks, type GscSnapshot, type HqRow } from "./view";

export const HQ_SNAPSHOT_KEY = "hq:sites";

export interface Hq {
  rows: HqRow[];
  totals: ReturnType<typeof familyTotals>;
  steps: StepView[];
  /** The Search Console week's last day, and when HQ's own collector last ran. */
  gscEnd: string | null;
  collectedAt: string | null;
  earningsDays: [string, string];
  costsConnected: boolean;
  errors: string[];
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export async function loadHq(fresh = false): Promise<Hq> {
  const errors: string[] = [];
  const now = new Date();
  const today = dayIn(now.getTime());
  const [from, to] = span(addDays(today, -1), 7);
  const [pFrom, pTo] = span(addDays(from, -1), 7);

  const rows = await prisma.opsSnapshot
    .findMany({ where: { key: { in: [HQ_SNAPSHOT_KEY, "growth:gsc", STEPS_DONE_KEY] } } })
    .catch(() => {
      errors.push("Could not read HQ's stored snapshots.");
      return [] as { key: string; json: unknown }[];
    });
  const get = (k: string) => rows.find((r) => r.key === k)?.json ?? null;

  const snap = parseHqSnapshot(get(HQ_SNAPSHOT_KEY));
  if (!snap) errors.push("Sister-site health: not collected yet (RiftCompare's ops monitor collects it every three hours).");
  const report = await getLatestReport();
  const health: SiteHealth[] = [healthFromReport(report, now, SNAPSHOT_STALE_HOURS), ...(snap?.sites ?? [])];

  const gsc = gscWeeks(get("growth:gsc") as GscSnapshot | null, today);
  if (!gsc.end) errors.push("Google clicks: no Search Console snapshot yet.");

  const [sources, costs, steps] = await Promise.all([
    withTimeout(loadEarnings(fresh).catch(() => null), 20_000, null),
    withTimeout(loadCosts(fresh).catch(() => null), 20_000, null),
    loadSteps(),
  ]);
  if (!sources) errors.push("Earnings: the sources did not answer in time.");
  const vercel = costs?.find((c) => c.key === "vercel");
  const costsConnected = vercel?.status === "ok";
  const charges = costsConnected ? vercel?.projects ?? [] : [];
  const ledgerLast = sources ? siteLedger(sources, charges, [], from, to, "AUD") : null;
  const ledgerPrev = sources ? siteLedger(sources, charges, [], pFrom, pTo, "AUD") : null;

  const views = stepViews(steps, parseDone(get(STEPS_DONE_KEY)));
  const hqRows = buildHqRows({ gsc, ledgerLast, ledgerPrev, costsConnected, health, steps: views });
  return { rows: hqRows, totals: familyTotals(hqRows), steps: views, gscEnd: gsc.end, collectedAt: snap?.at ?? null, earningsDays: [from, to], costsConnected, errors };
}
