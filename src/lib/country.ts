// Country / market selection. Australia is the global default; New Zealand and the
// United States are also supported. This module is PURE (no next/headers) so it's
// safe to import from both server and client components. The server-side cookie +
// geo reader lives in get-country.ts.

export type Country = "AU" | "NZ" | "US" | "UK";

export interface CountryInfo {
  code: Country;
  label: string; // display name, e.g. "United States" (switcher, "in {label}" only where it reads right)
  adjective: string; // attributive form, e.g. "US stores", "Australian players"
  place: string; // prepositional form with any article, e.g. "the United States" → "buy in {place}"
  flag: string; // emoji
  currency: string; // ISO 4217
  locale: string;
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  AU: { code: "AU", label: "Australia", adjective: "Australian", place: "Australia", flag: "🇦🇺", currency: "AUD", locale: "en-AU" },
  NZ: { code: "NZ", label: "New Zealand", adjective: "New Zealand", place: "New Zealand", flag: "🇳🇿", currency: "NZD", locale: "en-NZ" },
  US: { code: "US", label: "United States", adjective: "US", place: "the United States", flag: "🇺🇸", currency: "USD", locale: "en-US" },
  UK: { code: "UK", label: "United Kingdom", adjective: "UK", place: "the United Kingdom", flag: "🇬🇧", currency: "GBP", locale: "en-GB" },
};

// Order shown in the switcher. UK is live, priced in GBP (TCGplayer now; eBay UK
// joins on the next daily import, CardTrader once its API token is set).
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.AU, COUNTRIES.NZ, COUNTRIES.US, COUNTRIES.UK];
export const DEFAULT_COUNTRY: Country = "AU";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "NZ", "US", "UK"]);

// Coerce any cookie/geo/query value to a supported Country (defaults to AU). Accepts
// ISO country codes from the geo header too (e.g. "US", "NZ"); anything else → AU.
export function normalizeCountry(v: string | undefined | null): Country {
  let up = (v ?? "").toUpperCase();
  // The geo header / Shopify use the ISO code "GB" for the United Kingdom; we use "UK".
  if (up === "GB") up = "UK";
  return VALID.has(up as Country) ? (up as Country) : "AU";
}

// The Shopify storefront ?country= param + eBay use ISO 3166 alpha-2, where the UK
// is "GB" (not "UK"). Everywhere else we use our own "UK" code.
export function isoCountry(country: Country): string {
  return country === "UK" ? "GB" : country;
}

// The Card column holding the lowest price for this market.
export type PriceField = "lowestPriceCents" | "lowestPriceCentsNz" | "lowestPriceCentsUs" | "lowestPriceCentsUk";
export function priceField(country: Country): PriceField {
  return country === "NZ"
    ? "lowestPriceCentsNz"
    : country === "US"
    ? "lowestPriceCentsUs"
    : country === "UK"
    ? "lowestPriceCentsUk"
    : "lowestPriceCents";
}

// Pick the effective lowest price for the selected market from a card-like object.
export function pickPrice(
  card: {
    lowestPriceCents: number | null;
    lowestPriceCentsNz?: number | null;
    lowestPriceCentsUs?: number | null;
    lowestPriceCentsUk?: number | null;
  },
  country: Country
): number | null {
  if (country === "NZ") return card.lowestPriceCentsNz ?? null;
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  if (country === "UK") return card.lowestPriceCentsUk ?? null;
  return card.lowestPriceCents;
}

export function currencyOf(country: Country): string {
  return COUNTRIES[country].currency;
}
