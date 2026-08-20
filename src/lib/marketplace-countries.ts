// Pure, dependency-free launch-market list — split out of lib/marketplace.ts
// (which imports the Prisma client and so can't be imported from "use client"
// components like ShippingAddressCard/MarketplaceCheckout). lib/marketplace.ts
// re-exports this so there's still one source of truth.
//
// Germany (DE) was added 2026-08-20 and removed the same day (see the header
// note in lib/country.ts). This list must track lib/country.ts's Country union
// exactly — the marketplace has no market that price comparison doesn't also
// have — so DE was removed here too, not just from the priced-market list.
export const MARKETPLACE_LAUNCH_COUNTRIES = ["AU", "UK", "US", "SG", "CA"] as const;

export function isLaunchCountry(country: string | null | undefined): boolean {
  return !!country && (MARKETPLACE_LAUNCH_COUNTRIES as readonly string[]).includes(country);
}

// Also pure — every marketplace region's settlement currency.
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD" };
