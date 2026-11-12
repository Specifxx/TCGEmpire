// The Monday report's sign-up lines (2026-11-12): how many price alerts and weekly
// email subscriptions each sister site holds, and how many came this week. Counts
// only: never an address. Four bounded aggregate reads on private tables, once a week.
import type { prisma as Prisma } from "../db";
import { SISTER_ALERT_SITES } from "./sites";

export interface SisterSignups {
  /** Per site key. */
  sites: Record<string, { alerts: number; alertsNew: number; weekly: number; weeklyNew: number }>;
  addresses: number;
  confirmed: number;
}

type Db = Pick<typeof Prisma, "sisterAlert" | "sisterDigest" | "sisterAlertAddress">;

export async function loadSisterSignups(db: Db, now = new Date()): Promise<SisterSignups> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [alerts, alertsNew, weekly, weeklyNew, addresses, confirmed] = await Promise.all([
    db.sisterAlert.groupBy({ by: ["site"], _count: { _all: true } }),
    db.sisterAlert.groupBy({ by: ["site"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.sisterDigest.groupBy({ by: ["site"], _count: { _all: true } }),
    db.sisterDigest.groupBy({ by: ["site"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.sisterAlertAddress.count(),
    db.sisterAlertAddress.count({ where: { confirmedAt: { not: null } } }),
  ]);
  const sites: SisterSignups["sites"] = {};
  const at = (k: string) => (sites[k] ??= { alerts: 0, alertsNew: 0, weekly: 0, weeklyNew: 0 });
  for (const r of alerts) at(r.site).alerts = r._count._all;
  for (const r of alertsNew) at(r.site).alertsNew = r._count._all;
  for (const r of weekly) at(r.site).weekly = r._count._all;
  for (const r of weeklyNew) at(r.site).weeklyNew = r._count._all;
  return { sites, addresses, confirmed };
}

/** Plain lines for the report (the HTML part escapes them). Pure. */
export function signupLines(s: SisterSignups | null): string[] {
  if (!s) return [];
  const lines = [`Addresses: ${s.addresses} signed up, ${s.confirmed} confirmed by email.`];
  const quiet: string[] = [];
  for (const site of SISTER_ALERT_SITES) {
    const c = s.sites[site.key];
    if (!c || (!c.alerts && !c.weekly)) {
      quiet.push(site.name);
      continue;
    }
    lines.push(`${site.name}: ${c.alerts} price alerts (+${c.alertsNew} this week), ${c.weekly} on the weekly email (+${c.weeklyNew}).`);
  }
  if (quiet.length) lines.push(`None yet: ${quiet.join(", ")}.`);
  return lines;
}
