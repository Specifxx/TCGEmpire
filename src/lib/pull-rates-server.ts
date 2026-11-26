import { prisma } from "./db";
import { shapeTally, type PullTally } from "./pull-rates";

// THE PUBLIC PULL TALLY (lib/pull-rates.ts has the rules), as the pull-rate pages and /api/pulls/rates
// read it. Three grouped reads of two small private tables, memoised on globalThis for six hours (the
// lib/store-votes/read.ts convention, not unstable_cache: see lib/db.ts), under pages that revalidate
// every six hours, so a busy day costs a handful of reads. Only counts leave, and only for a set past
// MIN_MEMBERS and MIN_PACKS: never a log, a member id or a date. Any error is an empty tally, never a 500.

const TTL_MS = 6 * 60 * 60_000;
const g = globalThis as unknown as { __rcPullTally?: { at: number; value: PullTally } };

export async function getPullTally(): Promise<PullTally> {
  const now = Date.now();
  if (g.__rcPullTally && now - g.__rcPullTally.at < TTL_MS) return g.__rcPullTally.value;
  try {
    const [logs, pairs, hits] = await Promise.all([
      prisma.pullLog.groupBy({ by: ["setCode"], _sum: { packs: true }, _count: { _all: true } }),
      // One row per (set, member): the member count. Bounded by members x sets.
      prisma.pullLog.groupBy({ by: ["setCode", "userId"], _count: { _all: true }, take: 100_000, orderBy: { setCode: "asc" } }),
      prisma.pullHit.groupBy({ by: ["setCode", "cardId", "tier"], _sum: { qty: true } }),
    ]);
    const members = new Map<string, number>();
    for (const p of pairs) members.set(p.setCode, (members.get(p.setCode) ?? 0) + 1);
    const value = shapeTally(
      logs.map((l) => ({ setCode: l.setCode, packs: l._sum.packs ?? 0, logs: l._count._all })),
      [...members].map(([setCode, n]) => ({ setCode, members: n })),
      hits.map((h) => ({ setCode: h.setCode, cardId: h.cardId, tier: h.tier, qty: h._sum.qty ?? 0 })),
      new Date(now),
    );
    g.__rcPullTally = { at: now, value };
    return value;
  } catch {
    return { at: new Date(now).toISOString(), sets: {} };
  }
}
