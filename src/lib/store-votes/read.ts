import { prisma } from "../db";
import { shapeTally, type StoreTallyPayload } from "./core";

// THE PUBLIC STORE TALLY (lib/store-votes/core.ts), as /api/store-votes serves
// it. One grouped read of a small table, memoised on globalThis for six hours
// (the lib/site-reviews/read.ts convention, not unstable_cache: see lib/db.ts),
// and the CDN keeps the route's answer six hours on top, so a busy day costs a
// handful of reads for every site together. Only the counts leave: never a
// voter id, a network hash or which site a vote came from. Any error is an
// empty tally (no badge anywhere), never a 500.

const TTL_MS = 6 * 60 * 60_000;
const g = globalThis as unknown as { __rcStoreTally?: { at: number; value: StoreTallyPayload } };

export async function getStoreTally(): Promise<StoreTallyPayload> {
  const now = Date.now();
  if (g.__rcStoreTally && now - g.__rcStoreTally.at < TTL_MS) return g.__rcStoreTally.value;
  try {
    const groups = await prisma.storeVote.groupBy({ by: ["store", "vote"], _count: { _all: true } });
    const value = shapeTally(
      groups.map((r) => ({ store: r.store, vote: r.vote, count: r._count._all })),
      new Date(now),
    );
    g.__rcStoreTally = { at: now, value };
    return value;
  } catch {
    return { at: new Date(now).toISOString(), stores: {} };
  }
}
