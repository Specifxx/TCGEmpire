import type { Country } from "@/lib/country";

// Recommended retail price (MSRP) per Riftbound sealed product type, per market.
// Riftbound has had sellout launches with heavily-scalped boxes (£250+), so the
// question buyers actually ask is "where can I still buy this AT retail?" — not
// just "what's the cheapest listing." MSRP is a small, stable, PUBLIC set of
// numbers (Riot / distributor pricing), so it lives here as config rather than
// something to scrape. Values are integer cents in each market's currency and
// are approximate launch RRPs — update as official pricing firms up.
//
// Keyed by productType (the same strings the sealed importer writes). A product
// with no MSRP here simply has no "at MSRP" signal (we never guess).

type MsrpByMarket = Partial<Record<Country, number>>;

const MSRP: Record<string, MsrpByMarket> = {
  "Booster Box": { AU: 22900, NZ: 24900, US: 14400, UK: 12900 },
  "Booster Case": { AU: 275000, NZ: 299000, US: 172800, UK: 154800 },
  "Proving Grounds": { AU: 4500, NZ: 4900, US: 2900, UK: 2500 },
  "Starter Set": { AU: 3500, NZ: 3900, US: 2200, UK: 1900 },
  "Box Set": { AU: 6500, NZ: 6900, US: 3900, UK: 3500 },
  "Bundle": { AU: 5500, NZ: 5900, US: 3500, UK: 2900 },
};

// The MSRP for a product type in a market, or null if we don't publish one.
export function msrpCents(productType: string, market: Country): number | null {
  return MSRP[productType]?.[market] ?? null;
}

// Is a live price at or below MSRP? A small tolerance (2%) absorbs FX / rounding
// so a box a few cents over RRP still reads as "at MSRP".
export function isAtMsrp(priceCents: number, productType: string, market: Country): boolean {
  const rrp = msrpCents(productType, market);
  return rrp != null && priceCents <= Math.round(rrp * 1.02);
}

// How far over MSRP a price is, as a percentage (positive = above RRP), or null.
export function overMsrpPct(priceCents: number, productType: string, market: Country): number | null {
  const rrp = msrpCents(productType, market);
  if (rrp == null || rrp <= 0) return null;
  return ((priceCents - rrp) / rrp) * 100;
}
