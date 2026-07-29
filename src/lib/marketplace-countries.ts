// Pure, dependency-free launch-market list — split out of lib/marketplace.ts
// (which imports the Prisma client and so can't be imported from "use client"
// components like ShippingAddressCard/MarketplaceCheckout). lib/marketplace.ts
// re-exports this so there's still one source of truth.
// NOTE on CA: Stripe Connect Express supports Canada/CAD natively, so this is
// wired up for completeness with the CA market. It is the ONE part of the CA
// rollout that depends on Stripe ACCOUNT configuration (payout currency /
// cross-border capability) which can't be verified from the codebase. If CAD
// payouts aren't enabled on the platform's Stripe account, the failure mode is
// visible and contained — a Canadian seller can't finish Connect onboarding, so
// `payoutsEnabled` stays false and they can't list. It does NOT affect the
// read-only CA price comparison, which needs none of this.
export const MARKETPLACE_LAUNCH_COUNTRIES = ["AU", "UK", "US", "NZ", "SG", "CA"] as const;

export function isLaunchCountry(country: string | null | undefined): boolean {
  return !!country && (MARKETPLACE_LAUNCH_COUNTRIES as readonly string[]).includes(country);
}

// Also pure — every marketplace region's settlement currency.
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD" };
