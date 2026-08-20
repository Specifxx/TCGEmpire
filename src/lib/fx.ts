// Canonical approximate foreign-exchange rates — the single source of truth for the
// site's reference-price currency conversions. These are indicative ONLY: real
// checkout is always billed in the store's own currency, and any figure converted
// through here is a reference/market price, never a quote. Kept deliberately crude
// and hand-refreshed (exact FX doesn't matter for a comparison anchor).
//
// USD is the base. Override any rate WITHOUT a deploy via the matching env var.
// The vars are NEXT_PUBLIC_ so client components (which show converted TCGplayer
// market prices) get the same values the server/import code uses — one rate table,
// no drift. NOTE: Next only inlines statically-referenced process.env.NEXT_PUBLIC_*
// for the browser bundle, so each var is read by its literal name below (not via a
// computed key).

import { currencyOf, type Country } from "./country";

const rate = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// USD → {ISO currency} multipliers. USD is 1 by definition.
export const USD_TO: Record<string, number> = {
  USD: 1,
  AUD: rate(process.env.NEXT_PUBLIC_USD_TO_AUD, 1.5),
  GBP: rate(process.env.NEXT_PUBLIC_USD_TO_GBP, 0.79),
  SGD: rate(process.env.NEXT_PUBLIC_USD_TO_SGD, 1.35),
  CAD: rate(process.env.NEXT_PUBLIC_USD_TO_CAD, 1.37),
  // Germany's REAL market currency (DE stores + eBay DE price natively in EUR —
  // see country.ts's COUNTRIES.DE) — not just the UK-EUR display conversion below
  // anymore. Still doubles as that: gbpCentsToEur converts a real GBP price into
  // an approximate EUR figure for the (non-DE) EU visitors who still land on UK.
  EUR: rate(process.env.NEXT_PUBLIC_USD_TO_EUR, 0.92),
};

// Convert integer USD cents into integer cents of `currency` (ISO 4217). Unknown
// currencies pass through unchanged (multiplier 1).
export function convertUsdCents(usdCents: number, currency: string): number {
  return Math.round(usdCents * (USD_TO[currency] ?? 1));
}

// Convert integer USD cents into the given market's native currency cents.
export function usdCentsToCountry(usdCents: number, country: Country): number {
  return convertUsdCents(usdCents, currencyOf(country));
}

// Convert integer cents between any two currencies in USD_TO, via USD as the
// common base (e.g. GBP -> EUR). Reference-only, like every other rate here.
export function convertCents(cents: number, from: string, to: string): number {
  if (from === to) return cents;
  const usdCents = cents / (USD_TO[from] ?? 1);
  return Math.round(usdCents * (USD_TO[to] ?? 1));
}

// A GBP price shown as an approximate Euro equivalent — for European shoppers
// browsing the UK market (there's no separate EU store/eBay market; this is
// purely a reference conversion of the real GBP price, not a live quote).
export function gbpCentsToEur(gbpCents: number): number {
  return convertCents(gbpCents, "GBP", "EUR");
}
