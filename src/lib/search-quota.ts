// Daily search allowance (2026-10-09, owner): signed out 10 a day, a free
// account 30, Plus 100, Premium unlimited. DECISIONS.md, "Search is metered
// again: 10 / 30 / 100 / unlimited".
//
// This REVERSES 2026-09-28's "keep price comparison fully free" for SEARCH
// ONLY, knowingly: a 10 / 100 / unlimited ladder ran for about a day before
// and was removed after pages per visitor fell 3.86 → 2.75 and buy clicks fell
// ~40%. The owner was shown those numbers and chose these limits. So the meter
// is built to be cheap to turn off: SEARCH_CAPS=off (a Vercel variable, then a
// redeploy from the dashboard) makes every search unmetered again.
//
// What a "search" is: a distinct query in a day. The typeahead asks the server
// as the visitor types, so "ak" → "aka" → "akali" is ONE search (each query
// extends or shortens the last counted one), and pressing Enter on it does not
// count again on /browse. Paging, filters and the store tools that look cards
// up (Best Basket, the deck pricer, the trade calculator, the collection) do
// not count. Card, set, champion and store pages are never metered, so price
// comparison itself stays free.
//
// The count lives in a signed httpOnly cookie, bound to the account it was
// earned on. Clearing it resets the count: this is an upgrade prompt, not a
// security boundary, and it costs no database write per search. The cookie's
// signing lives in search-quota-server.ts: this module is shared with client
// components and must not import node:crypto.
export const SEARCH_LIMITS = { anon: 10, free: 30, plus: 100 } as const;
export type SearchTier = "anon" | "free" | "plus" | "premium";
/** The signed-out allowance, named for the pricing table. */
export const SIGNED_OUT_SEARCHES = SEARCH_LIMITS.anon;

export const SEARCH_QUOTA_COOKIE = "rc_sq";

/** The day's allowance, or null for unlimited. */
export function searchLimitFor(tier: SearchTier): number | null {
  return tier === "premium" ? null : SEARCH_LIMITS[tier];
}

/** The kill switch. Anything but "off" leaves the meter on. */
export function searchCapsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SEARCH_CAPS ?? "").trim().toLowerCase() !== "off";
}

/** The UTC calendar day, which is when the allowance resets. */
export function quotaDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface QuotaState {
  d: string; // UTC day
  n: number; // searches counted today
  q: string; // the last counted query, normalised
  u: string; // the account it belongs to ("" when signed out)
}

export const normQuery = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** Same search: one query extends or shortens the other, as a typist's do. */
export function sameSearch(prev: string, next: string): boolean {
  const a = normQuery(prev);
  const b = normQuery(next);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** A state that belongs to this visitor today, or a fresh one. */
export function currentState(s: QuotaState | null, userId: string, day: string): QuotaState {
  if (!s || s.d !== day || s.u !== userId) return { d: day, n: 0, q: "", u: userId };
  return s;
}

export interface QuotaDecision {
  allowed: boolean;
  counted: boolean;
  state: QuotaState;
  used: number;
  limit: number | null;
}

/**
 * Meter one query. A repeat or an extension of the last counted query is free;
 * a new query counts if there is allowance left, and is refused if not. A
 * refused query leaves the state unchanged.
 */
export function meter(s: QuotaState, q: string, limit: number | null): QuotaDecision {
  const nq = normQuery(q);
  if (limit == null) return { allowed: true, counted: false, state: s, used: s.n, limit };
  if (sameSearch(s.q, nq)) {
    // Keep the longer form, so backspacing then retyping is still the same search.
    const keep = nq.length > s.q.length ? nq : s.q;
    const state = { ...s, q: keep };
    return { allowed: true, counted: false, state, used: s.n, limit };
  }
  if (s.n >= limit) return { allowed: false, counted: false, state: s, used: s.n, limit };
  const state = { ...s, n: s.n + 1, q: nq };
  return { allowed: true, counted: true, state, used: state.n, limit };
}

/** Would this query be refused, without counting it (for a server component). */
export function wouldRefuse(s: QuotaState, q: string, limit: number | null): boolean {
  return limit != null && !sameSearch(s.q, q) && s.n >= limit;
}

/** The line a visitor at the limit reads, by tier. */
export function limitCopy(tier: SearchTier): { headline: string; next: string } {
  if (tier === "anon")
    return {
      headline: `You've used today's ${SEARCH_LIMITS.anon} free searches.`,
      next: `Sign up free for ${SEARCH_LIMITS.free} a day, or get Plus for ${SEARCH_LIMITS.plus}.`,
    };
  if (tier === "free")
    return {
      headline: `You've used today's ${SEARCH_LIMITS.free} searches.`,
      next: `Plus gives you ${SEARCH_LIMITS.plus} a day, and Premium is unlimited.`,
    };
  return {
    headline: `You've used today's ${SEARCH_LIMITS.plus} searches.`,
    next: "Premium searches without a limit.",
  };
}
