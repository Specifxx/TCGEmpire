// "Too cheap to be true" guard for store singles (owner, 2026-11-02; docs/store-vetting.md).
//
// A store price far under the card's market price is, in order of likelihood: a
// wrong match (another printing, a proxy, a Japanese copy), a typo, or a shop that
// does not intend to ship. None of those is a deal a buyer should be sent to, so
// the importer drops it rather than headline it as "cheapest". The engine sites
// (Gundam, Lorcana, YGO, Cyberpunk) use the same quarter-of-TCGplayer rule.
//
// Only above a US$2 reference: under it a bulk card's TCGplayer figure is noise
// and a store's 10c price is real. Damaged and heavily played copies are exempt:
// a fair price for one can sit under a quarter of the Near Mint market.
import { USD_TO } from "./fx";

export const TOO_CHEAP_SHARE = 0.25;
export const TOO_CHEAP_MIN_REF_USD_CENTS = 200;

/** True when a store price (in `currency` cents) is under a quarter of the TCGplayer US market price. Pure. */
export function implausiblyCheap(priceCents: number, currency: string, tcgUsdCents: number | null | undefined, condition?: string | null): boolean {
  if (!tcgUsdCents || tcgUsdCents < TOO_CHEAP_MIN_REF_USD_CENTS) return false;
  if (condition && /damag|heav|\bhp\b|poor/i.test(condition)) return false;
  const rate = USD_TO[currency];
  if (!rate) return false;
  const usd = priceCents / rate;
  return usd < tcgUsdCents * TOO_CHEAP_SHARE;
}
