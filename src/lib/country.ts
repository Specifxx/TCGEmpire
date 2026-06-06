// Country / market selection. Australia is the global default; New Zealand and the
// United States are also supported. This module is PURE (no next/headers) so it's
// safe to import from both server and client components. The server-side cookie +
// geo reader lives in get-country.ts.

export type Country = "AU" | "NZ" | "US";

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
  US: { code: "US", label: "United States", flag: "🇺🇸", currency: "USD", locale: "en-US" },
};

// Order shown in the switcher.
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.AU, COUNTRIES.NZ, COUNTRIES.US];
export const DEFAULT_COUNTRY: Country = "AU";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "NZ", "US"]);

// Coerce any cookie/geo/query value to a supported Country (defaults to AU). Accepts
// ISO country codes from the geo header too (e.g. "US", "NZ"); anything else → AU.
export function normalizeCountry(v: string | undefined | null): Country {
  const up = (v ?? "").toUpperCase();
  return VALID.has(up as Country) ? (up as Country) : "AU";
}

// The Card column holding the lowest price for this market.
export type PriceField = "lowestPriceCents" | "lowestPriceCentsNz" | "lowestPriceCentsUs";
export function priceField(country: Country): PriceField {
  return country === "NZ" ? "lowestPriceCentsNz" : country === "US" ? "lowestPriceCentsUs" : "lowestPriceCents";
}

// Pick the effective lowest price for the selected market from a card-like object.
export function pickPrice(
  card: { lowestPriceCents: number | null; lowestPriceCentsNz?: number | null; lowestPriceCentsUs?: number | null },
  country: Country
): number | null {
  if (country === "NZ") return card.lowestPriceCentsNz ?? null;
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  return card.lowestPriceCents;
}

export function currencyOf(country: Country): string {
  return COUNTRIES[country].currency;
}
