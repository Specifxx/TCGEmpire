// Country / market selection. The UNITED STATES is the global default; a visitor is
// auto-switched to AU, UK, SG or CA only when IP geo detects one of those
// (everything else — incl. the US and undetectable — resolves to US). This module is
// PURE (no next/headers) so it's safe to import from both server and client
// components. The server-side cookie + geo reader lives in get-country.ts.
//
// New Zealand support was removed 2026-08-20 (NZ never had eBay coverage — see
// arbitrage.ts/affiliate.ts — so the removal freed no eBay credits; the actual
// saving was ~10 fewer Shopify store scrapes per price-import run and dropping
// the dedicated Card.lowestPriceCentsNz column/index). NZ is kept archived in
// git history, not behind a flag — re-adding it is a normal "add a market" pass.
//
// Germany (DE) was added 2026-08-20 and removed the same day (real store
// coverage was too thin to be worth the added complexity — a chrome-language
// toggle, a 6th priced market, a 6th eBay rotation slot — for what it returned).
// DE is kept archived in git history like NZ; re-adding it is a normal
// "add a market" pass, not a restore. Removing it freed its EBAY_ROTATING_MARKETS
// slot back to the quota (see price-import.ts) — DE fell back under EU_ISO below,
// same as every other EU visitor.

export type Country = "AU" | "US" | "UK" | "SG" | "CA";

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
  US: { code: "US", label: "United States", adjective: "US", place: "the United States", flag: "🇺🇸", currency: "USD", locale: "en-US" },
  UK: { code: "UK", label: "United Kingdom", adjective: "UK", place: "the United Kingdom", flag: "🇬🇧", currency: "GBP", locale: "en-GB" },
  SG: { code: "SG", label: "Singapore", adjective: "Singapore", place: "Singapore", flag: "🇸🇬", currency: "SGD", locale: "en-SG" },
  CA: { code: "CA", label: "Canada", adjective: "Canadian", place: "Canada", flag: "🇨🇦", currency: "CAD", locale: "en-CA" },
};

// Order shown in the switcher. UK is live, priced in GBP (TCGplayer now; eBay UK
// joins on the next daily import, CardTrader once its API token is set).
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.AU, COUNTRIES.US, COUNTRIES.UK, COUNTRIES.SG, COUNTRIES.CA];
// US is the default market (the ISR baseline + the fallback when geo can't place a
// visitor in AU/UK). Geo auto-switches AU/UK visitors client-side.
export const DEFAULT_COUNTRY: Country = "US";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "US", "UK", "SG", "CA"]);

// EU member states (+ EEA/Schengen-adjacent UK-shipping-friendly neighbours),
// INCLUDING Germany again now that DE has no store/eBay market of its own (see
// the header note on its 2026-08-20 add-then-remove). Every EU visitor has no
// separate EU store/eBay market, so UK (GBP, real UK stores) is the closest
// match: nearer currency, nearer postage than the US default. That visitor
// browses the same real UK store inventory as a genuine UK visitor, but SEES
// prices displayed in EUR by default (see get-country.ts's getDisplayCurrency
// and CountryProvider's `currency`/`fmt`) — GBP is the real, buyable currency;
// EUR is a display conversion of it, never a second market.
const EU_ISO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "FI", "FR", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

// True for a raw ISO geo/cookie value that's an EU market (never GB/UK itself,
// which has its own code and is never in EU_ISO). Exported so get-country.ts and
// /api/geo can derive "should this UK-market visitor see EUR?" from the same set.
export function isEuIso(v: string | undefined | null): boolean {
  return EU_ISO.has((v ?? "").toUpperCase());
}

// Coerce any cookie/geo/query value to a supported Country. Accepts ISO country
// codes from the geo header too (e.g. "AU", "GB"). AU/UK/SG/CA geo hits
// pass straight through; any EU country (including Germany) defaults to UK (see
// EU_ISO above); everything else (incl. the US and undetectable) falls through to US.
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
  | "lowestPriceCentsUs"
  | "lowestPriceCentsUk"
  | "lowestPriceCentsSg"
  | "lowestPriceCentsCa";
export function priceField(country: Country): PriceField {
  return country === "US"
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
    lowestPriceCentsUs?: number | null;
    lowestPriceCentsUk?: number | null;
    lowestPriceCentsSg?: number | null;
    lowestPriceCentsCa?: number | null;
  },
  country: Country
): number | null {
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  if (country === "UK") return card.lowestPriceCentsUk ?? null;
  if (country === "SG") return card.lowestPriceCentsSg ?? null;
  if (country === "CA") return card.lowestPriceCentsCa ?? null;
  return card.lowestPriceCents;
}

// TOTAL BY DESIGN — never index COUNTRIES bare here. The `Country` union is a
// COMPILE-time guarantee only, and this function's real callers include values
// cast from RUNTIME strings that TypeScript never checked: PriceHistory.country
// is a plain text column holding whatever market the importer wrote on the day
// the row was created, and a market can later be REMOVED from the union.
//
// That is not hypothetical. New Zealand was removed on 2026-08-20 (see the note
// at the top of this file), which deleted COUNTRIES.NZ — but left ~120 days of
// `country = 'NZ'` rows in the history database, because the removal purged no
// data. lib/rise-predictor.ts read those rows back, cast the string to Country,
// and called currencyOf("NZ"); `COUNTRIES["NZ"]` was undefined, `.currency`
// threw a TypeError, and /tools/rising returned a hard 500 on its default
// GLOBAL view for every visitor. Falling back to the default market renders a
// slightly wrong currency label in that rare case; throwing takes the page down.
export function currencyOf(country: Country): string {
  return (COUNTRIES[country] ?? COUNTRIES[DEFAULT_COUNTRY]).currency;
}
