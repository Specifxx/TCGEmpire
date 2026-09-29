// WHAT ONE ACCOUNT OWNS OF A SET (2026-09-29, DECISIONS.md, "Set tracker").
//
// The user-scoped, UNCACHED half of the set tracker: lib/set-checklist.ts holds
// the catalogue every reader in a market shares; this is the one narrow read of
// the caller's own rows, made per request by GET /api/collection/owned (the
// overlay on a released /sets/[set] page) and by the /portfolio/sets pages.
//
// ONE groupBy in Postgres, not a row pull: a collection row is per (card,
// condition, foil), so a set holder's rows can run to several a card, and the
// tracker only wants "how many copies of this card, whatever the finish and
// condition". The result is one {cardId, quantity} per OWNED card, capped
// (OWNED_TAKE), scoped by userId first (the (userId) index), so it can never
// return another account's rows and its size follows the set, not the account.
import type { prisma } from "./db";
import type { OwnedMap } from "./set-scope";

/** Distinct owned cards returned for ONE set. A set is a few hundred; this is a backstop. */
export const OWNED_TAKE = 1500;

/**
 * The cap for a read across several sets: one set's backstop for each, so the
 * index (every tracked set in one groupBy) is not cut at 1,500 cards shared
 * between them and a completionist's progress bars undercount. `cardCounts` is
 * how many cards each listed set has in the catalogue, which bounds what the
 * account can own of it; never below OWNED_TAKE.
 */
export function ownedTakeFor(cardCounts: readonly number[]): number {
  return Math.max(OWNED_TAKE, cardCounts.reduce((n, c) => n + Math.max(0, c), 0));
}

type Grouped = { cardId: string; _sum: { quantity: number | null } };
export type OwnedDb = {
  collectionCard: {
    groupBy: (args: {
      by: ["cardId"];
      where: { userId: string; card: { setCode: string | { in: string[] } } };
      _sum: { quantity: true };
      orderBy: { cardId: "asc" };
      take: number;
    }) => PromiseLike<Grouped[]>;
  };
};

/** {cardId: copies} for the account's cards in one set (or several sets, for the index). */
export async function ownedBySet(
  db: OwnedDb | typeof prisma,
  userId: string,
  setCodes: string | string[],
  take: number = OWNED_TAKE,
): Promise<OwnedMap> {
  const d = db as OwnedDb;
  const rows = await d.collectionCard.groupBy({
    by: ["cardId"],
    where: { userId, card: { setCode: Array.isArray(setCodes) ? { in: setCodes } : setCodes } },
    _sum: { quantity: true },
    orderBy: { cardId: "asc" },
    take,
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    if (q > 0) out[r.cardId] = q;
  }
  return out;
}
