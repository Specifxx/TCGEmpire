// Pure, dependency-free launch-market list — split out of lib/marketplace.ts
// (which imports the Prisma client and so can't be imported from "use client"
// components like ShippingAddressCard/MarketplaceCheckout). lib/marketplace.ts
// re-exports this so there's still one source of truth.
//
// Germany (DE) was added 2026-08-20 and removed the same day (see the header
// note in lib/country.ts). This list must track lib/country.ts's Country union
// exactly — the marketplace has no market that price comparison doesn't also
// have — so DE was removed here too, not just from the priced-market list.
export const MARKETPLACE_LAUNCH_COUNTRIES = ["AU", "UK", "US", "SG", "CA", "EU"] as const;

export function isLaunchCountry(country: string | null | undefined): boolean {
  return !!country && (MARKETPLACE_LAUNCH_COUNTRIES as readonly string[]).includes(country);
}

// Also pure — every marketplace region's settlement currency.
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" };

// Where a seller in the EU market is treated as based, for Stripe Connect. "EU"
// is not a country and Stripe needs one — same translation isoCountry() does for
// Shopify, anchored to the same country (see country.ts's EU_ANCHOR_ISO). Note
// this only affects the DEFAULT: Connect onboarding asks the seller for their
// real country, so a Dutch seller is not made Spanish by this line.
export const EU_STRIPE_DEFAULT_COUNTRY = "ES";
