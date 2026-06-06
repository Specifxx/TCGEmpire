// Country / market selection. Australia is the default; New Zealand uses NZ
// stores + NZD. This module is PURE (no next/headers) so it's safe to import from
// both server and client components. The server-side cookie reader lives in
// get-country.ts (which imports next/headers and must stay server-only).

export type Country = "AU" | "NZ";

export interface CountryInfo {
  code: Country;
  label: string;
  flag: string; // emoji
  currency: string; // ISO 4217
  locale: string;
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  AU: { code: "AU", label: "Australia", flag: "🇦🇺", currency: "AUD", locale: "en-AU" },
  NZ: { code: "NZ", label: "New Zealand", flag: "🇳🇿", currency: "NZD", locale: "en-NZ" },
};

export const COUNTRY_LIST = Object.values(COUNTRIES);
export const DEFAULT_COUNTRY: Country = "AU";
export const COUNTRY_COOKIE = "country";

// New Zealand mode is still IN DEVELOPMENT (its prices need cleaning up). While this
// flag is off, the ENTIRE site behaves as AU-only — no NZ stores or prices anywhere,
// and the country switcher is hidden — so live Australian users are never affected by
// the in-progress NZ data. Set NEXT_PUBLIC_NZ_ENABLED=true (e.g. on a preview/branch
// deploy, or locally) to turn NZ on and work on it.
export const NZ_ENABLED = process.env.NEXT_PUBLIC_NZ_ENABLED === "true";

// Coerce any cookie/query value to a valid Country (defaults to AU).
export function normalizeCountry(v: string | undefined | null): Country {
  return v === "NZ" ? "NZ" : "AU";
}

// The Card column holding the lowest price for this market.
export type PriceField = "lowestPriceCents" | "lowestPriceCentsNz";
export function priceField(country: Country): PriceField {
  return country === "NZ" ? "lowestPriceCentsNz" : "lowestPriceCents";
}

// Pick the effective lowest price for the selected market from a card-like object.
export function pickPrice(
  card: { lowestPriceCents: number | null; lowestPriceCentsNz?: number | null },
  country: Country
): number | null {
  return country === "NZ" ? card.lowestPriceCentsNz ?? null : card.lowestPriceCents;
}

export function currencyOf(country: Country): string {
  return COUNTRIES[country].currency;
}
