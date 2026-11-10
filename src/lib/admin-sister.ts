// ADMIN: who uses a sister site (DexCompare) as a member, read from RiftCompare's
// own database. DexCompare has no accounts, so a "Dex account" is a RiftCompare
// account that signed in through /sister-premium/dex (SisterMember), plus anyone
// with a Dex price alert (SisterAlert, email only, maybe no account at all).
// Uncached, per-request, select-limited, called only from the admin Accounts
// page (admin session or ADMIN_TOKEN). Read-only. DECISIONS.md, 2026-11-10.
import { prisma } from "./db";
import { NOT_SEED_WHERE } from "./premium";
import { PREMIUM_TRIAL_DAYS } from "./trial-config";

export type PlanStatus = "paid" | "trial" | "lapsed" | "free" | "no-account";

/** One word for an account's plan. Trial = Premium active and still inside the trial window from its first trial start. */
export function planStatus(
  u: { premiumUntil: Date | null; trialStartedAt: Date | null } | null,
  now: Date,
  trialDays: number = PREMIUM_TRIAL_DAYS,
): PlanStatus {
  if (!u) return "no-account";
  const active = !!u.premiumUntil && u.premiumUntil > now;
  if (active) {
    const inTrial = !!u.trialStartedAt && trialDays > 0 && now.getTime() < u.trialStartedAt.getTime() + (trialDays + 1) * 86400_000;
    return inTrial ? "trial" : "paid";
  }
  return u.premiumUntil ? "lapsed" : "free";
}

export interface SisterRow {
  email: string;
  member: boolean; // signed in through the site's Premium door
  alerts: number;
  confirmed: boolean; // alert address confirmed (double opt-in)
  plan: PlanStatus;
  premiumUntil: Date | null;
  signedUp: Date; // first sign-in through the site, else first alert
  lastSeen: Date | null; // latest hand-off
}

export interface SisterSummary {
  people: number;
  members: number;
  alertEmails: number;
  paid: number;
  trial: number;
  lapsed: number;
  free: number;
  noAccount: number;
  /** Members on paid Premium / members (trials counted separately), as a percent. */
  conversionPct: number;
  new7: number;
  new30: number;
}

const TAKE = 500;

export function summarise(rows: SisterRow[], now: Date): SisterSummary {
  const c = (p: PlanStatus) => rows.filter((r) => r.plan === p).length;
  const members = rows.filter((r) => r.member);
  const paidMembers = members.filter((r) => r.plan === "paid").length;
  const since = (d: number) => rows.filter((r) => r.signedUp.getTime() >= now.getTime() - d * 86400_000).length;
  return {
    people: rows.length,
    members: members.length,
    alertEmails: rows.filter((r) => r.alerts > 0).length,
    paid: c("paid"),
    trial: c("trial"),
    lapsed: c("lapsed"),
    free: c("free"),
    noAccount: c("no-account"),
    conversionPct: members.length ? Math.round((paidMembers / members.length) * 1000) / 10 : 0,
    new7: since(7),
    new30: since(30),
  };
}

export async function loadSisterAccounts(site: string, now: Date = new Date()): Promise<{ rows: SisterRow[]; summary: SisterSummary; truncated: boolean }> {
  const [members, alertGroups, addresses] = await Promise.all([
    prisma.sisterMember.findMany({ where: { site }, select: { email: true, firstLinkedAt: true, lastLinkedAt: true }, take: 5000 }).catch(() => []),
    prisma.sisterAlert.groupBy({ by: ["email"], where: { site }, _count: { _all: true }, _min: { createdAt: true }, take: 5000 }),
    prisma.sisterAlertAddress.findMany({ where: { confirmedAt: { not: null } }, select: { email: true }, take: 20000 }),
  ]);
  const confirmed = new Set(addresses.map((a) => a.email));
  const map = new Map<string, SisterRow>();
  for (const m of members) {
    map.set(m.email, { email: m.email, member: true, alerts: 0, confirmed: confirmed.has(m.email), plan: "no-account", premiumUntil: null, signedUp: m.firstLinkedAt, lastSeen: m.lastLinkedAt });
  }
  for (const g of alertGroups) {
    const first = g._min.createdAt ?? now;
    const r = map.get(g.email);
    if (r) {
      r.alerts = g._count._all;
      if (first < r.signedUp) r.signedUp = first;
    } else {
      map.set(g.email, { email: g.email, member: false, alerts: g._count._all, confirmed: confirmed.has(g.email), plan: "no-account", premiumUntil: null, signedUp: first, lastSeen: null });
    }
  }
  const emails = [...map.keys()];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { AND: [NOT_SEED_WHERE, { email: { in: emails, mode: "insensitive" } }] },
        select: { email: true, premiumUntil: true, trialStartedAt: true },
      })
    : [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  for (const r of map.values()) {
    const u = byEmail.get(r.email) ?? null;
    r.plan = planStatus(u, now);
    r.premiumUntil = u?.premiumUntil ?? null;
  }
  const all = [...map.values()].sort((a, b) => b.signedUp.getTime() - a.signedUp.getTime());
  return { rows: all.slice(0, TAKE), summary: summarise(all, now), truncated: all.length > TAKE };
}
