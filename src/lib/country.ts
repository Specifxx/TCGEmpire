// Country / market selection. The UNITED STATES is the global default; a visitor is
// auto-switched to AU, NZ, UK, SG or CA only when IP geo detects one of those
// (everything else — incl. the US and undetectable — resolves to US). This module is
// PURE (no next/headers) so it's safe to import from both server and client
// components. The server-side cookie + geo reader lives in get-country.ts.

export type Country = "AU" | "NZ" | "US" | "UK" | "SG" | "CA";

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
  CA: { code: "CA", label: "Canada", adjective: "Canadian", place: "Canada", flag: "🇨🇦", currency: "CAD", locale: "en-CA" },
};

// Order shown in the switcher. UK is live, priced in GBP (TCGplayer now; eBay UK
// joins on the next daily import, CardTrader once its API token is set).
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.AU, COUNTRIES.NZ, COUNTRIES.US, COUNTRIES.UK, COUNTRIES.SG, COUNTRIES.CA];
// US is the default market (the ISR baseline + the fallback when geo can't place a
// visitor in AU/NZ/UK). Geo auto-switches AU/NZ/UK visitors client-side.
export const DEFAULT_COUNTRY: Country = "US";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "NZ", "US", "UK", "SG", "CA"]);

// EU member states (+ EEA/Schengen-adjacent UK-shipping-friendly neighbours) —
// there's no separate EU store/eBay market, but UK (GBP, real UK stores) is a
// far closer match for a European shopper's real prices/shipping than the US
// default: nearer currency, nearer postage. A visitor from one of these markets
// browses the same real UK store inventory as a genuine UK visitor, but SEES
// prices displayed in EUR by default (see get-country.ts's getDisplayCurrency
// and CountryProvider's `currency`/`fmt`) — GBP is the real, buyable currency;
// EUR is a display conversion of it, never a second market.
const EU_ISO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

// True for a raw ISO geo/cookie value that's an EU market (never GB/UK itself,
// which has its own code and is never in EU_ISO). Exported so get-country.ts and
// /api/geo can derive "should this UK-market visitor see EUR?" from the same set.
export function isEuIso(v: string | undefined | null): boolean {
  return EU_ISO.has((v ?? "").toUpperCase());
}

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

// Explicit override for the UK market's DISPLAY currency (GBP vs EUR) — separate
// from the `country` cookie so a deliberate switcher pick and an auto-detected
// EU visitor can both be remembered without conflating "which store inventory"
// with "which currency to show it in". Values: "EUR" | "GBP". Absent = infer
// from geo (see get-country.ts's getDisplayCurrency).
export const EUR_DISPLAY_COOKIE = "eur_display";

// The Shopify storefront ?country= param + eBay use ISO 3166 alpha-2, where the UK
// is "GB" (not "UK"). Everywhere else we use our own "UK" code.
export function isoCountry(country: Country): string {
  return country === "UK" ? "GB" : country;
}

// The Card column holding the lowest price for this market.
export type PriceField =
  | "lowestPriceCents"
  | "lowestPriceCentsNz"
  | "lowestPriceCentsUs"
  | "lowestPriceCentsUk"
  | "lowestPriceCentsSg"
  | "lowestPriceCentsCa";
export function priceField(country: Country): PriceField {
  return country === "NZ"
    ? "lowestPriceCentsNz"
    : country === "US"
    ? "lowestPriceCentsUs"
    : country === "UK"
    ? "lowestPriceCentsUk"
    : country === "SG"
    ? "lowestPriceCentsSg"
    : country === "CA"
    ? "lowestPriceCentsCa"
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
    lowestPriceCentsCa?: number | null;
  },
  country: Country
): number | null {
  if (country === "NZ") return card.lowestPriceCentsNz ?? null;
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  if (country === "UK") return card.lowestPriceCentsUk ?? null;
  if (country === "SG") return card.lowestPriceCentsSg ?? null;
  if (country === "CA") return card.lowestPriceCentsCa ?? null;
  return card.lowestPriceCents;
}

export function currencyOf(country: Country): string {
  return COUNTRIES[country].currency;
}
