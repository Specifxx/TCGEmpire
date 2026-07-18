// Pure, dependency-free launch-market list — split out of lib/marketplace.ts
// (which imports the Prisma client and so can't be imported from "use client"
// components like ShippingAddressCard/MarketplaceCheckout). lib/marketplace.ts
// re-exports this so there's still one source of truth.
export const MARKETPLACE_LAUNCH_COUNTRIES = ["AU", "UK", "US"] as const;

export function isLaunchCountry(country: string | null | undefined): boolean {
  return !!country && (MARKETPLACE_LAUNCH_COUNTRIES as readonly string[]).includes(country);
}

// Also pure — every marketplace region's settlement currency.
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", SG: "SGD" };
