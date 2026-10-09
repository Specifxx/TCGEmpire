// Server half of the daily search allowance (lib/search-quota.ts holds the rules).
// Reads the visitor's tier and the signed counter cookie; route handlers also
// write the cookie back. A server component may only READ (Next.js cannot set a
// cookie while rendering), so /browse asks wouldRefuse() and leaves the counting
// to /api/search/quota, which its client island calls once per new search.
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "./auth";
import { authSecret } from "./auth-secret";
import { isBotUserAgent } from "./card-views";
import { premiumTierOf } from "./premium";
import { decodeQuota, encodeQuota } from "./search-quota-cookie";
import {
  SEARCH_QUOTA_COOKIE,
  currentState,
  meter,
  quotaDay,
  searchCapsEnabled,
  searchLimitFor,
  wouldRefuse,
  type QuotaDecision,
  type QuotaState,
  type SearchTier,
} from "./search-quota";

export interface QuotaContext {
  /** False when the meter does not apply: switched off, a crawler, or Premium. */
  metered: boolean;
  tier: SearchTier;
  limit: number | null;
  state: QuotaState;
}

export async function quotaContext(): Promise<QuotaContext> {
  const day = quotaDay();
  const blank: QuotaState = { d: day, n: 0, q: "", u: "" };
  if (!searchCapsEnabled()) return { metered: false, tier: "premium", limit: null, state: blank };
  // Crawlers and unfurlers are never metered (an empty user agent counts as one).
  if (isBotUserAgent(headers().get("user-agent"))) return { metered: false, tier: "premium", limit: null, state: blank };
  const user = await getCurrentUser();
  const paid = premiumTierOf(user);
  const tier: SearchTier = !user ? "anon" : paid === "premium" ? "premium" : paid === "plus" ? "plus" : "free";
  const limit = searchLimitFor(tier);
  const state = currentState(decodeQuota(cookies().get(SEARCH_QUOTA_COOKIE)?.value, authSecret()), user?.id ?? "", day);
  return { metered: limit != null, tier, limit, state };
}

/** For a server component: would this query be refused today? Counts nothing. */
export function refusedNow(ctx: QuotaContext, q: string): boolean {
  return ctx.metered && wouldRefuse(ctx.state, q, ctx.limit);
}

/** For a route handler: meter the query and write the cookie back when it changed. */
export function meterAndStore(ctx: QuotaContext, q: string): QuotaDecision {
  const decision = meter(ctx.state, q, ctx.limit);
  if (ctx.metered && decision.state !== ctx.state) {
    cookies().set(SEARCH_QUOTA_COOKIE, encodeQuota(decision.state, authSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 36,
    });
  }
  return decision;
}
