// THE FREE ACCOUNT'S LIMITS (owner, 2026-09-28 — DECISIONS.md, "Free limits:
// charge for what people use every week").
//
//   "Charge for the features people use every week. Cap free portfolios …
//    and free watchlists at around 10 cards; paid gets unlimited. Keep price
//    comparison fully free, since that's what brings people in."
//   "For users with currently over 50 cards allow them to keep it but their
//    next card is the upgrade."
//
// A free account watches up to FREE_WATCHLIST_LIMIT distinct cards and keeps
// up to FREE_PORTFOLIO_LIMIT distinct cards in its portfolio. Any paid tier
// (isPremium(user): Plus, Premium, a floor, an admin) is unlimited.
//
// GRANDFATHERING — NOBODY LOSES ANYTHING. The limit only ever blocks ADDING A
// NEW CARD while the account already holds `limit` or more. Everything already
// there keeps working (alerts keep firing, the portfolio keeps valuing), and
// adding copies to a card already held, a second market for a watched card,
// editing and removing are never blocked. A lapsed subscriber over the limit
// is in exactly that position.
//
// Cards, not rows and not copies: a watch is one row per (card, market) and a
// portfolio entry one row per (card, condition, foil), so both are counted as
// DISTINCT cardId — in Postgres (lib/free-limits-server.ts), never by pulling
// rows (tests/prisma-client-side-distinct.test.ts).
//
// Client-safe: no server imports. The routes (the enforcement), the upgrade
// panel and every tier table / FAQ / email that quotes a number read the SAME
// constants, so the promise and the check can never drift apart.

export const FREE_WATCHLIST_LIMIT = 10;
export const FREE_PORTFOLIO_LIMIT = 50;

export type FreeLimitKind = "watchlist" | "portfolio";

export const FREE_LIMITS: Record<FreeLimitKind, number> = {
  watchlist: FREE_WATCHLIST_LIMIT,
  portfolio: FREE_PORTFOLIO_LIMIT,
};

/** HTTP status for "this add needs a paid tier" — 402, used by every route. */
export const FREE_LIMIT_STATUS = 402;

/** The structured error every create route returns at the limit. */
export interface FreeLimitBody {
  error: string;
  code: "free_limit";
  kind: FreeLimitKind;
  limit: number;
  count: number;
}

const NOUN: Record<FreeLimitKind, string> = { watchlist: "watching", portfolio: "tracking" };

/** "You're watching 10 cards, the free limit." — one sentence, the real count. */
export function freeLimitHeadline(kind: FreeLimitKind, count: number): string {
  const limit = FREE_LIMITS[kind];
  const n = Math.max(count, limit);
  const where = kind === "portfolio" ? " in your portfolio" : "";
  return n > limit
    ? `You're ${NOUN[kind]} ${n} cards${where} — over the free limit of ${limit}, and you keep all of them.`
    : `You're ${NOUN[kind]} ${limit} cards${where}, the free limit.`;
}

export function freeLimitBody(kind: FreeLimitKind, count: number): FreeLimitBody {
  const limit = FREE_LIMITS[kind];
  const what = kind === "watchlist" ? "watch" : "add to your portfolio";
  return {
    error: `${freeLimitHeadline(kind, count)} Upgrade to Plus to ${what} more cards.`,
    code: "free_limit",
    kind,
    limit,
    count,
  };
}

/** A route's JSON body, if it is the free-limit error (client side). */
export function parseFreeLimit(body: unknown): FreeLimitBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.code !== "free_limit") return null;
  if (b.kind !== "watchlist" && b.kind !== "portfolio") return null;
  const limit = typeof b.limit === "number" ? b.limit : FREE_LIMITS[b.kind];
  const count = typeof b.count === "number" ? b.count : limit;
  return { error: typeof b.error === "string" ? b.error : freeLimitBody(b.kind, count).error, code: "free_limit", kind: b.kind, limit, count };
}

/**
 * Would adding `cardId` be blocked? The client's pre-check, from what it
 * already holds (the watched-id Set, the collection rows) — so a tap at the
 * limit shows the panel at once instead of flipping a heart and rolling it
 * back. The server re-checks; this only saves the round trip.
 */
export function wouldHitFreeLimit(kind: FreeLimitKind, opts: { paid: boolean; held: ReadonlySet<string>; cardId: string }): boolean {
  if (opts.paid) return false;
  if (opts.held.has(opts.cardId)) return false;
  return opts.held.size >= FREE_LIMITS[kind];
}

// The quiet "N of 10" counter: only once a free account is close (7 of 10,
// 40 of 50), never before — no nagging while the limit is far away.
const COUNTER_FROM: Record<FreeLimitKind, number> = { watchlist: 7, portfolio: 40 };

export function showFreeLimitCounter(kind: FreeLimitKind, count: number, paid: boolean): boolean {
  return !paid && count >= COUNTER_FROM[kind];
}

export function freeLimitCounterText(kind: FreeLimitKind, count: number): string {
  const limit = FREE_LIMITS[kind];
  return count > limit ? `${count} cards · free accounts add up to ${limit}` : `${count} of ${limit} free`;
}

// ── The check itself ────────────────────────────────────────────────────────

/** What an account already holds, asked of the database (or a test stub). */
export interface HoldingsCounter {
  /** Which of these card ids the account already holds (any market / condition). */
  held(cardIds: string[]): Promise<Set<string>>;
  /** Distinct cards the account holds. */
  count(): Promise<number>;
}

export interface Allowance {
  /** Ids that may be written: every already-held id, then new ids up to the limit. */
  allowed: string[];
  /** New ids refused because the account is at the limit. */
  blocked: string[];
  /** Distinct cards held before this add, or null when it was not needed (paid, or nothing new). */
  count: number | null;
  limit: number;
}

/**
 * Split an add into what may land and what is over the free limit.
 * Paid accounts are never counted (no query at all). Ids already held are
 * always allowed — grandfathering, and re-adding a card you already have.
 * New ids fill the remaining allowance in the order given (the import's paste
 * order). The count is read only when there is something new to add.
 */
export async function checkFreeAllowance(
  counter: HoldingsCounter,
  kind: FreeLimitKind,
  cardIds: string[],
  paid: boolean,
): Promise<Allowance> {
  const limit = FREE_LIMITS[kind];
  const ids = [...new Set(cardIds)];
  if (paid || ids.length === 0) return { allowed: ids, blocked: [], count: null, limit };
  const held = await counter.held(ids);
  const fresh = ids.filter((id) => !held.has(id));
  if (fresh.length === 0) return { allowed: ids, blocked: [], count: null, limit };
  const count = await counter.count();
  const room = Math.max(0, limit - count);
  const take = new Set(fresh.slice(0, room));
  return {
    allowed: ids.filter((id) => held.has(id) || take.has(id)),
    blocked: fresh.slice(room),
    count,
    limit,
  };
}
