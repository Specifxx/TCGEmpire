import { tierMonthlyAmount, tierAnnualAmount, PREMIUM_PRICE_PERIOD, type PremiumTierKey } from "./site";

/**
 * What a plan SWITCH to `target` will bill, in the subscriber's own interval
 * (2026-09-25). The upgrade and downgrade routes keep the subscription's
 * interval — `priceIdFor(target, interval)` — so an ANNUAL Plus member moving
 * to Premium is billed Premium's yearly price. Every button that offers the
 * switch (SubscriptionActions, PremiumDialog, the dashboard) used to quote the
 * monthly one.
 *
 * `targetAnnualLive` mirrors priceIdFor's own fallback: with no annual price
 * configured for the target tier the route bills the monthly price, so the
 * label says monthly too. Pure, so tests/premium-tiers.test.ts runs it.
 */
export function planSwitchPriceLabel(
  target: PremiumTierKey,
  interval: "month" | "year" | null | undefined,
  targetAnnualLive = true,
): string {
  return interval === "year" && targetAnnualLive
    ? `${tierAnnualAmount(target)}/yr`
    : `${tierMonthlyAmount(target)}/${PREMIUM_PRICE_PERIOD}`;
}
