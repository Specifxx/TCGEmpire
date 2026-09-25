import { getPremiumSubscriptionDetails, type PremiumSubscriptionDetails } from "./premium";

// The two billing facts the client chrome needs about a PAYING viewer's own
// subscription (2026-09-25), published on /api/me:
//
//   trialing — still inside the free trial. The plan-change routes
//     (api/premium/upgrade, downgrade, switch-to-annual) select only ACTIVE
//     subscriptions, so a Plus trialist offered "Upgrade to Premium" got an
//     error. SubscriptionActions already hid its switches mid-trial; the
//     dialog and every PremiumButton gate now read this and do the same.
//   interval — "month" | "year". Those routes keep the subscriber's interval,
//     so an annual Plus member upgrading is billed Premium's ANNUAL price; the
//     buttons used to quote the monthly one.
//
// One Stripe read per PLUS customer — the only viewers these facts change
// anything for (the Plus → Premium upgrade offers) — memoised per instance for
// 10 minutes, the same budget introEligibleFor keeps, so /api/me doesn't call
// Stripe on every page view. Premium, free and signed-out viewers never cause
// a read (the callers pass `paid` only for Plus), and no database query is
// added (egress rules, lib/db.ts): the customer id is already on the session
// user.
//
// Never allowed to hold up the response it rides on (review, 2026-09-25):
// /api/me also carries the adFree flag the ad placements wait for, and the
// Stripe client has no timeout of its own. A read slower than READ_TIMEOUT_MS
// answers NONE for this request and is memoised when it lands. A read that
// comes back empty — no live subscription (a comp grant), or a failed call,
// which getPremiumSubscriptionDetails also reports as null — is memoised for
// a minute only, so an outage can't pin a trialist to "not trialing" (and so
// to an upgrade offer the route refuses) for ten.
export type BillingState = { trialing: boolean; interval: "month" | "year" | null };

const NONE: BillingState = { trialing: false, interval: null };
const TTL_MS = 10 * 60_000;
const EMPTY_TTL_MS = 60_000;
export const READ_TIMEOUT_MS = 1500;
const memo = new Map<string, { state: BillingState; at: number; ttl: number }>();
const inflight = new Map<string, Promise<BillingState>>();

type Read = (customerId: string) => Promise<Pick<PremiumSubscriptionDetails, "status" | "interval"> | null>;

export async function billingStateFor(
  user: { stripeCustomerId?: string | null } | null,
  paid: boolean,
  now: number = Date.now(),
  read: Read = getPremiumSubscriptionDetails,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<BillingState> {
  const id = user?.stripeCustomerId;
  if (!paid || !id) return NONE;
  const hit = memo.get(id);
  if (hit && now - hit.at < hit.ttl) return hit.state;
  // One read in flight per customer: requests that arrive while a slow read
  // is still out wait on that one rather than starting another.
  let landed = inflight.get(id);
  if (!landed) {
    const pending: Promise<BillingState> = read(id)
      .catch(() => null)
      .then((d) => {
        const state: BillingState = d ? { trialing: d.status === "trialing", interval: d.interval } : NONE;
        if (memo.size > 5000) memo.clear();
        memo.set(id, { state, at: now, ttl: d ? TTL_MS : EMPTY_TTL_MS });
        return state;
      })
      .finally(() => {
        if (inflight.get(id) === pending) inflight.delete(id);
      });
    inflight.set(id, pending);
    landed = pending;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<BillingState>((resolve) => {
    timer = setTimeout(() => resolve(NONE), timeoutMs);
  });
  try {
    return await Promise.race([landed, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only: the memo is per module instance. */
export function forgetBillingState(): void {
  memo.clear();
  inflight.clear();
}
