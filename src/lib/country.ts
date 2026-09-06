// Country / market selection. The UNITED STATES is the global default; a visitor is
// auto-switched to AU, UK, SG, CA or EU only when IP geo detects one of those
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
//
// ── EU (2026-08-23): THE EUROZONE AS ONE MARKET, NOT A SIXTH COUNTRY ─────────
// The EU market is the direct answer to why DE failed. DE was one country, and
// one country's worth of Riftbound stores was too thin to price a catalogue
// from. The eurozone shares a currency AND a customs union, so a shopper in
// Madrid can buy from a store in Rotterdam at the listed EUR price with no
// conversion and no import duty — which makes "cheapest EUR listing across the
// eurozone" a real, buyable number in a way "cheapest listing in Germany" was
// only marginally. One market pooling ~20 countries' stores clears the coverage
// bar that one country could not.
//
// It is therefore NOT a country code, and three places have to translate it to
// one: isoCountry() (Shopify Markets' ?country= param), the eBay marketplace
// (see EBAY_ROTATING_MARKETS in price-import.ts) and hreflang (see seo.ts).
// All three resolve to SPAIN — the market's lead country, and the one the
// request that created this market named. Each of those is a single documented
// line, deliberately, so the anchor country can be moved without a sweep.
//
// NON-EURO EU STATES (PL/CZ/SE/DK/HU/RO/BG) resolve here too. Their visitors do
// not pay in EUR, so the price they see is a foreign-currency figure — but it
// is a REAL figure from a store that ships to them inside the single market,
// which is strictly better than what they had before this market existed (a UK
// GBP price converted to EUR for display, from stores now outside the customs
// union). Currency-accurate markets for them are a later pass, not a blocker.

export type Country = "AU" | "US" | "UK" | "SG" | "CA" | "EU";

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
  // The one entry whose `code` is not an ISO 3166 country — see the header note.
  // `locale` is "en-IE", not "es-ES": it is only ever used for og:locale:alternate
  // (see app/decks/page.tsx), and every page on this site is written in ENGLISH.
  // Claiming a Spanish locale for an English page is the same lie seo.ts's
  // hreflang note refuses to tell. en-IE is English in a eurozone country, which
  // is exactly what these pages are. hreflang, which DOES need a country, anchors
  // to ES instead (see seo.ts) — a different question with a different answer.
  EU: { code: "EU", label: "Europe (EU)", adjective: "European", place: "the EU", flag: "🇪🇺", currency: "EUR", locale: "en-IE" },
};

// Order shown in the switcher. US leads — it is the primary market and the site
// default (DEFAULT_COUNTRY below), so it is also the first column and the fallback
// for anything that reads COUNTRY_LIST[0]. UK is live, priced in GBP (TCGplayer
// now; eBay UK joins on the next daily import, CardTrader once its API token is set).
export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.US, COUNTRIES.AU, COUNTRIES.UK, COUNTRIES.SG, COUNTRIES.CA, COUNTRIES.EU];
// US is the default market (the ISR baseline + the fallback when geo can't place a
// visitor in AU/UK). Geo auto-switches AU/UK visitors client-side.
export const DEFAULT_COUNTRY: Country = "US";
export const COUNTRY_COOKIE = "country";

// The multi-country selector is live. (Kept as a switch so it can be disabled
// quickly if a market's data needs work, without code surgery.)
export const INTL_ENABLED = process.env.NEXT_PUBLIC_INTL_DISABLED !== "true";

const VALID = new Set<Country>(["AU", "US", "UK", "SG", "CA", "EU"]);

// EU member states (+ EEA/Schengen-adjacent neighbours). Since 2026-08-23 these
// resolve to the EU market itself (see the header note), which has its own real
// EUR store inventory and its own eBay rotation slot — so this is no longer the
// "closest available match" fallback it was, it is the market's own membership
// list. Germany is in it, as it has been since DE was retired.
//
// THE SET STILL HAS A SECOND, SEPARATE JOB, and deleting it would break that:
// isEuIso() below reads it to answer "is this raw geo value European?", which is
// what get-country.ts uses to decide whether a visitor who DELIBERATELY switched
// to the UK market should see its real GBP prices converted to EUR (see
// getDisplayCurrency + CountryProvider's `currency`/`fmt`). That path is now
// only reachable by an explicit switcher pick rather than by geo — an EU visitor
// no longer lands on UK by default — but it is still the right behaviour for the
// visitor who makes that pick, so it stays.
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
// codes from the geo header too (e.g. "AU", "GB", "ES"). AU/UK/SG/CA geo hits
// pass straight through; any EU/EEA country (including Germany) resolves to the
// EU market (see EU_ISO above); everything else (incl. the US and undetectable)
// falls through to US.
//
// ORDER MATTERS on the GB line. "GB" is rewritten to "UK" BEFORE the EU_ISO
// check, and GB is not in EU_ISO anyway — so a British visitor can never be
// swept into the EU market by either route.
export function normalizeCountry(v: string | undefined | null): Country {
  let up = (v ?? "").toUpperCase();
  // The geo header / Shopify use the ISO code "GB" for the United Kingdom; we use "UK".
  if (up === "GB") up = "UK";
  if (VALID.has(up as Country)) return up as Country;
  if (EU_ISO.has(up)) return "EU";
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
//
// "EU" IS NOT AN ISO 3166 COUNTRY, and this is the line that makes that safe.
// Shopify Markets prices a request by the ?country= it is given and silently
// serves its DEFAULT currency for a value it doesn't recognise — so passing "EU"
// through would not error, it would quietly file some other currency's numbers
// as EUR, which is the exact failure the ?country= param exists to prevent (see
// fetchCollection in price-import.ts). Spain is the anchor: the EU market's lead
// country, in the eurozone, and the same country its eBay marketplace and
// hreflang resolve to. Change it in one place if the anchor ever moves.
export const EU_ANCHOR_ISO = "ES";
export function isoCountry(country: Country): string {
  if (country === "UK") return "GB";
  if (country === "EU") return EU_ANCHOR_ISO;
  return country;
}

// The Card column holding the lowest price for this market.
export type PriceField =
  | "lowestPriceCents"
  | "lowestPriceCentsUs"
  | "lowestPriceCentsUk"
  | "lowestPriceCentsSg"
  | "lowestPriceCentsCa"
  | "lowestPriceCentsEu";
export function priceField(country: Country): PriceField {
  return country === "US"
    ? "lowestPriceCentsUs"
    : country === "UK"
    ? "lowestPriceCentsUk"
    : country === "SG"
    ? "lowestPriceCentsSg"
    : country === "CA"
    ? "lowestPriceCentsCa"
    : country === "EU"
    ? "lowestPriceCentsEu"
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
    lowestPriceCentsEu?: number | null;
  },
  country: Country
): number | null {
  if (country === "US") return card.lowestPriceCentsUs ?? null;
  if (country === "UK") return card.lowestPriceCentsUk ?? null;
  if (country === "SG") return card.lowestPriceCentsSg ?? null;
  if (country === "CA") return card.lowestPriceCentsCa ?? null;
  if (country === "EU") return card.lowestPriceCentsEu ?? null;
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
