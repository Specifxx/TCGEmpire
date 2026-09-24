// The currency guard: a price is shown in a market only when the store that
// quoted it charges in that market's currency. DECISIONS.md, "Sold-out
// pre-orders ranked as the cheapest", 2026-09-24.
//
// Sky Fox Games is a CAD storefront. Registered as a US store, its C$224.99
// Radiance box rendered as US$224.99 for ten days, because a SealedListing /
// RetailerPrice row has no currency column: the market IS the currency. Moving
// the store to CA fixed that one store; this makes the next one impossible to
// publish silently. We refuse rather than convert: a store that ignores
// Shopify Markets also ignores its own checkout currency rules, so a converted
// figure would be a price nobody is actually offered.
import { RETAILERS } from "./retailers";
import { SEALED_ONLY_STORES } from "./sealed-stores";
import { currencyOf, type Country } from "./country";

/**
 * The currency a tracked store charges in, or null for a source that is not a
 * single store (eBay, TCGplayer, Amazon): those importers query each market's
 * own site and write prices already denominated in it.
 */
export function storeCurrency(retailerKey: string): string | null {
  const r = RETAILERS[retailerKey];
  if (r) return r.currency ?? currencyOf(r.country ?? "AU");
  const s = SEALED_ONLY_STORES.find((x) => x.key === retailerKey);
  return s ? s.currency : null;
}

/** May this store's price be rendered in `market`? */
export function offerCurrencyOk(retailerKey: string, market: Country): boolean {
  const c = storeCurrency(retailerKey);
  return c == null || c === currencyOf(market);
}
