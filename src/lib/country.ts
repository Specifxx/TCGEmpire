// Country / market selection. The UNITED STATES is the global default; a visitor is
// auto-switched to AU, NZ, UK or SG only when IP geo detects one of those (everything
// else — incl. the US and undetectable — resolves to US). This module is PURE (no
// next/headers) so it's safe to import from both server and client components. The
// server-side cookie + geo reader lives in get-country.ts.

export type Country = "AU" | "NZ" | "US" | "UK" | "SG";

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
  SG: { code: "SG", label: "Singapore", adjective: "Singapore", place: "Singapore", flag: "🇸🇬", currency: "SGD", locale: "en-SG" },
};

// Order shown in the switcher. UK is live, priced in GBP (TCGplayer now; eBay UK
// joins on the next daily import, CardTrader once its API token is set).
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.AU, COUNTRIES.NZ, COUNTRIES.US, COUNTRIES.UK, COUNTRIES.SG];
// US is the default market (the ISR baseline + the fallback when geo can't place a
// visitor in AU/NZ/UK). Geo auto-switches AU/NZ/UK visitors client-side.
export const DEFAULT_COUNTRY: Country = "US";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "NZ", "US", "UK", "SG"]);

// EU member states (+ EEA/Schengen-adjacent UK-shipping-friendly neighbours) —
// there's no separate EU store/eBay market, but UK (GBP, real UK stores) is a
// far closer match for a European shopper's real prices/shipping than the US
// default: nearer currency, nearer postage, and the site already offers a Euro
// reference price (see fx.ts's gbpCentsToEur) specifically for this market.
const EU_ISO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

// Coerce any cookie/geo/query value to a supported Country. Accepts ISO country
// codes from the geo header too (e.g. "AU", "NZ", "GB"). AU/NZ/UK/SG geo hits
// pass straight through; an EU country defaults to UK (see EU_ISO above);
// everything else (incl. the US and undetectable) falls through to US.
export function normalizeCountry(v: string | undefined | null): Country {
  let up = (v ?? "").toUpperCase();
  // The geo header / Shopify use the ISO code "GB" for the United Kingdom; we use "UK".
  if (up === "GB") up = "UK";
  if (VALID.has(up as Country)) return up as Country;
  if (EU_ISO.has(up)) return "UK";
  return "US";
}

// The Shopify storefront ?country= param + eBay use ISO 3166 alpha-2, where the UK
// is "GB" (not "UK"). Everywhere else we use our own "UK" code.
export function isoCountry(country: Country): string {
  return country === "UK" ? "GB" : country;
}

// The Card column holding the lowest price for this market.
export type PriceField = "lowestPriceCents" | "lowestPriceCentsNz" | "lowestPriceCentsUs" | "lowestPriceCentsUk" | "lowestPriceCentsSg";
export function priceField(country: Country): PriceField {
  return country === "NZ"
    ? "lowestPriceCentsNz"
    : country === "US"
    ? "lowestPriceCentsUs"
    : country === "UK"
    ? "lowestPriceCentsUk"
    : country === "SG"
    ? "lowestPriceCentsSg"
    : "lowestPriceCents";
}

// Pick the effective lowest price for the selected market from a card-like object.
export function pickPrice(
  card: {
    lowestPriceCents: number | null;
    lowestPriceCentsNz?: number | null;
    lowestPriceCentsUs?: number | null;
    lowestPriceCentsUk?: number | null;
    lowestPriceCentsSg?: number | null;
  },
  country: Country
): number | null {
  if (country === "NZ") return card.lowestPriceCentsNz ?? null;
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  if (country === "UK") return card.lowestPriceCentsUk ?? null;
  if (country === "SG") return card.lowestPriceCentsSg ?? null;
  return card.lowestPriceCents;
}

export function currencyOf(country: Country): string {
  return COUNTRIES[country].currency;
}
