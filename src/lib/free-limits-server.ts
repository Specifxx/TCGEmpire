// Postgres side of lib/free-limits.ts: what an account already holds, counted
// in the database. Every query is scoped to one account (or one email
// address) and returns either a handful of card ids or ONE integer — egress
// rules 1 and 3 in lib/db.ts.
//
// The distinct count is COUNT(DISTINCT "cardId") in SQL on purpose: Prisma's
// `distinct` dedupes in the client and drops the LIMIT
// (tests/prisma-client-side-distinct.test.ts). It is read only when an add
// brings a card the account does not hold yet (checkFreeAllowance), and never
// for a paid account.
//
// Two overlapping adds at 9 of 10 can both pass and land at 11. Accepted: the
// limit is a funnel, not a quota anyone is billed on, and a lock would hold a
// pooled Neon connection on every heart tap.
import type { prisma } from "./db";
import { checkFreeAllowance, type Allowance, type HoldingsCounter } from "./free-limits";
import { isPremium, type EntitlementUser } from "./premium";

// Structural, so a test can hand in a stub.
type RawCount = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<{ n: number | bigint }[]>;

export type WatchLimitDb = {
  priceAlert: { findMany: (args: { where: object; select: { cardId: true }; take: number }) => PromiseLike<{ cardId: string }[]> };
  $queryRaw: RawCount;
};

export type PortfolioLimitDb = {
  collectionCard: { findMany: (args: { where: object; select: { cardId: true }; take: number }) => PromiseLike<{ cardId: string }[]> };
  $queryRaw: RawCount;
};

// One row per market (6) per card at most for a watch; one per condition (5)
// × foil (2) for a portfolio entry. The take bounds the read to that.
const MARKETS = 6;
const ROWS_PER_PORTFOLIO_CARD = 10;

/**
 * Watches held by an address — and by the account, when there is one. Both
 * halves count: account rows are written with the account's email too, and an
 * email-only watch made before signing in is the same person's. The anonymous
 * route passes just the email, so ten email-only watches per address is the
 * cap there and the anonymous flow is no way around the account's limit.
 */
export function watchHoldings(db: WatchLimitDb | typeof prisma, scope: { email: string; userId?: string | null }): HoldingsCounter {
  const d = db as WatchLimitDb;
  const owner = scope.userId ? { OR: [{ email: scope.email }, { userId: scope.userId }] } : { email: scope.email };
  return {
    async held(cardIds) {
      const rows = await d.priceAlert.findMany({
        where: { AND: [owner, { cardId: { in: cardIds } }] },
        select: { cardId: true },
        take: cardIds.length * MARKETS,
      });
      return new Set(rows.map((r) => r.cardId));
    },
    async count() {
      const rows = scope.userId
        ? await d.$queryRaw`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "PriceAlert" WHERE "email" = ${scope.email} OR "userId" = ${scope.userId}`
        : await d.$queryRaw`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "PriceAlert" WHERE "email" = ${scope.email}`;
      return Number(rows[0]?.n ?? 0);
    },
  };
}

/** Distinct cards in one account's portfolio (CollectionCard rows). */
export function portfolioHoldings(db: PortfolioLimitDb | typeof prisma, userId: string): HoldingsCounter {
  const d = db as PortfolioLimitDb;
  return {
    async held(cardIds) {
      const rows = await d.collectionCard.findMany({
        where: { userId, cardId: { in: cardIds } },
        select: { cardId: true },
        take: cardIds.length * ROWS_PER_PORTFOLIO_CARD,
      });
      return new Set(rows.map((r) => r.cardId));
    },
    async count() {
      const rows = await d.$queryRaw`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "CollectionCard" WHERE "userId" = ${userId}`;
      return Number(rows[0]?.n ?? 0);
    },
  };
}

// ── Route-level decisions ───────────────────────────────────────────────────
// Here rather than in the route files (a route may export only its handlers),
// and driven against a stub client in tests/free-limits.test.ts.

type EntitledAccount = EntitlementUser & { id: string };

export type WatchAllowanceDb = WatchLimitDb & {
  user: { findUnique: (args: { where: { email: string }; select: Record<string, true> }) => PromiseLike<EntitlementUser | null> };
};

/**
 * May these watches be created for `email`? `account` is the signed-in
 * account whose address IS `email` (the subscribe route's ownership rule), or
 * null for an anonymous, email-only watch.
 *
 * An anonymous add that would be blocked gets one more read: if the address
 * belongs to a paying account, that account is unlimited whichever door it
 * came through (a member who happens to be signed out). The read happens only
 * at the limit, so the common anonymous heart costs nothing extra.
 */
export async function watchAllowance(
  db: WatchAllowanceDb | typeof prisma,
  opts: { email: string; account: EntitledAccount | null; cardIds: string[] },
): Promise<Allowance> {
  const d = db as WatchAllowanceDb;
  const paid = isPremium(opts.account);
  const res = await checkFreeAllowance(watchHoldings(d, { email: opts.email, userId: opts.account?.id ?? null }), "watchlist", opts.cardIds, paid);
  if (res.blocked.length === 0 || opts.account) return res;
  const owner = await d.user.findUnique({
    where: { email: opts.email },
    select: { isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true },
  });
  if (!isPremium(owner)) return res;
  return { allowed: [...new Set(opts.cardIds)], blocked: [], count: null, limit: res.limit };
}

/** May these cards be added to `account`'s portfolio? */
export function portfolioAllowance(db: PortfolioLimitDb | typeof prisma, account: EntitledAccount, cardIds: string[]): Promise<Allowance> {
  return checkFreeAllowance(portfolioHoldings(db, account.id), "portfolio", cardIds, isPremium(account));
}
