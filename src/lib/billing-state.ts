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
// One Stripe read per paying customer, memoised per instance for 10 minutes —
// the same budget introEligibleFor keeps — so /api/me doesn't call Stripe on
// every page view. Free and signed-out viewers never cause a read at all, and
// no database query is added (egress rules, lib/db.ts): the customer id is
// already on the session user.
export type BillingState = { trialing: boolean; interval: "month" | "year" | null };

const NONE: BillingState = { trialing: false, interval: null };
const TTL_MS = 10 * 60_000;
const memo = new Map<string, { state: BillingState; at: number }>();

export async function billingStateFor(
  user: { stripeCustomerId?: string | null } | null,
  paid: boolean,
  now: number = Date.now(),
  read: (customerId: string) => Promise<Pick<PremiumSubscriptionDetails, "status" | "interval"> | null> = getPremiumSubscriptionDetails,
): Promise<BillingState> {
  const id = user?.stripeCustomerId;
  if (!paid || !id) return NONE;
  const hit = memo.get(id);
  if (hit && now - hit.at < TTL_MS) return hit.state;
  const d = await read(id);
  const state: BillingState = d ? { trialing: d.status === "trialing", interval: d.interval } : NONE;
  if (memo.size > 5000) memo.clear();
  memo.set(id, { state, at: now });
  return state;
}

/** Tests only: the memo is per module instance. */
export function forgetBillingState(): void {
  memo.clear();
}
