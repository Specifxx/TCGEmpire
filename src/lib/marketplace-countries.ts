// Pure, dependency-free launch-market list — split out of lib/marketplace.ts
// (which imports the Prisma client and so can't be imported from "use client"
// components like ShippingAddressCard/MarketplaceCheckout). lib/marketplace.ts
// re-exports this so there's still one source of truth.
// NOTE on CA/DE: Stripe Connect Express supports both Canada/CAD and
// Germany/EUR natively, so both are wired up for completeness alongside their
// price-comparison market. This is the ONE part of the rollout that depends on
// Stripe ACCOUNT configuration (payout currency / cross-border capability)
// which can't be verified from the codebase. If a market's payout currency
// isn't enabled on the platform's Stripe account, the failure mode is visible
// and contained — that market's seller can't finish Connect onboarding, so
// `payoutsEnabled` stays false and they can't list. It does NOT affect the
// read-only price comparison, which needs none of this. (The marketplace was
// pulled from navigation/discoverability sitewide — see MARKETPLACE.md — but
// its escrow/payout machinery is still live for existing orders, so this list
// still matters for anyone who reaches it by direct URL.)
export const MARKETPLACE_LAUNCH_COUNTRIES = ["AU", "UK", "US", "SG", "CA", "DE"] as const;

export function isLaunchCountry(country: string | null | undefined): boolean {
  return !!country && (MARKETPLACE_LAUNCH_COUNTRIES as readonly string[]).includes(country);
}

// Also pure — every marketplace region's settlement currency.
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD", DE: "EUR" };
