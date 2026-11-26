import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin-emails";
import { sydneyDay } from "@/lib/giveaway";
import { monthRange, pointsFor, rankHunters, type ContributionKind, type HunterRow } from "@/lib/contributions";

// Server half of the community contributions (lib/contributions.ts is pure). Per request, uncached, select-limited, called only
// from /api/* routes (deal votes, pulls, the pulse, /api/community/*) and the giveaway's points: never from a page.

/** Record one contribution (idempotent: the same kind on the same thing counts once). Never throws: a failure earns nothing. */
export async function recordContribution(userId: string, kind: ContributionKind, site: string, ref: string, now = new Date()): Promise<{ recorded: boolean; points: number }> {
  try {
    const day = sydneyDay(now);
    // A hot and a cold vote on one drop are one contribution: whichever came first (lib/contributions.ts), so flipping earns nothing.
    const kinds: ContributionKind[] = kind === "hot" || kind === "cold" ? ["hot", "cold"] : [kind];
    const exists = await prisma.contribution.findFirst({ where: { userId, site, ref, kind: { in: kinds } }, select: { id: true } });
    if (exists) return { recorded: false, points: 0 };
    const today = await prisma.contribution.aggregate({ where: { userId, day }, _sum: { points: true } });
    const points = pointsFor(kind, today._sum.points ?? 0);
    await prisma.contribution.create({ data: { userId, kind, site, ref, points, day } });
    return { recorded: true, points };
  } catch (e) {
    // A unique clash (two taps at once) or a database hiccup: the vote itself still stands.
    console.warn("[contributions] record failed:", (e as Error).message);
    return { recorded: false, points: 0 };
  }
}

/** Contribution points each account made inside a window (the open giveaway's), by account. */
export async function contributionPoints(userIds: string[], window: { gte: Date; lte: Date }): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.contribution
    .groupBy({ by: ["userId"], where: { userId: { in: userIds }, createdAt: window }, _sum: { points: true } })
    .catch(() => []);
  return new Map(rows.map((r) => [r.userId, r._sum.points ?? 0] as const));
}

/** The member's own totals: this month and all time. */
export async function myContributions(userId: string, now = new Date()): Promise<{ month: number; monthPoints: number; total: number }> {
  const range = monthRange(now.toISOString().slice(0, 7))!;
  const [m, t] = await Promise.all([
    prisma.contribution.aggregate({ where: { userId, createdAt: { gte: range.gte, lt: range.lt } }, _sum: { points: true }, _count: { _all: true } }),
    prisma.contribution.count({ where: { userId } }),
  ]);
  return { month: m._count._all, monthPoints: m._sum.points ?? 0, total: t };
}

/**
 * The month's Top deal hunters on one site (or every site with site "all"): only members who chose a handle, never the team.
 * Points made on the site that month, then contributions, then who started first.
 */
export async function topHunters(site: string, month: string): Promise<{ handle: string; points: number; contributions: number }[]> {
  const range = monthRange(month);
  if (!range) return [];
  const rows = await prisma.contribution.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: range.gte, lt: range.lt }, ...(site === "all" ? {} : { site }) },
    _sum: { points: true },
    _count: { _all: true },
    _min: { createdAt: true },
    orderBy: { _sum: { points: "desc" } },
    take: 200,
  });
  if (rows.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) }, handle: { not: null }, isAdmin: false },
    select: { id: true, handle: true, email: true },
  });
  const named = new Map(users.filter((u) => !isAdminEmail(u.email)).map((u) => [u.id, u.handle!] as const));
  const list: HunterRow[] = [];
  for (const r of rows) {
    const handle = named.get(r.userId);
    if (!handle) continue;
    list.push({ handle, points: r._sum.points ?? 0, contributions: r._count._all, first: r._min.createdAt ?? range.gte });
  }
  return rankHunters(list).map(({ handle, points, contributions }) => ({ handle, points, contributions }));
}

/** For each drop, the handle of the first member who voted it hot ("First vouched by @name"). Members without a handle are skipped. */
export async function firstVouchers(site: string, dropIds: string[]): Promise<Record<string, string>> {
  if (dropIds.length === 0) return {};
  const rows = await prisma.contribution
    .findMany({
      where: { site, kind: "hot", ref: { in: dropIds }, user: { handle: { not: null } } },
      orderBy: { createdAt: "asc" },
      select: { ref: true, user: { select: { handle: true } } },
      // Bounded: at most 20 named hot votes read per drop (the first one is all we keep).
      take: dropIds.length * 20,
    })
    .catch(() => []);
  const out: Record<string, string> = {};
  for (const r of rows) if (r.user.handle && !out[r.ref]) out[r.ref] = r.user.handle;
  return out;
}
