// Which prices a /card share image prints, and in which currency. PURE (no
// Prisma, no next/og) so the rules can be tested without a database or a render.
//
// The share image used to print `lowestPriceCents` — the AU column — through
// formatMoney's default AUD, so every pasted /card link in Discord, Reddit or X
// read "from A$…" to everyone, while the page it unfurls, its title and its
// JSON-LD are all pinned to DEFAULT_COUNTRY (US). The image is one static PNG
// per card with no visitor behind it, so it leads with the default market and
// lists the other priced markets beside it rather than guessing one.
import { COUNTRY_LIST, DEFAULT_COUNTRY, currencyOf, pickPrice, type Country } from "./country";
import { formatMoney } from "./format";

export type OgPriceCard = {
  lowestPriceCents: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
  lowestPriceCentsSg: number | null;
  lowestPriceCentsCa: number | null;
  lowestPriceCentsEu: number | null;
};

export type OgPriceLine = { market: Country; text: string };

// When the default market has no live price the headline falls back in this
// order: the biggest audiences first, then the thinnest coverage. Fixed, so the
// same card always unfurls the same way.
export const OG_FALLBACK_ORDER: Country[] = ["US", "EU", "UK", "CA", "AU", "SG"];

// Each market is formatted in its OWN currency, and only ever through
// currencyOf(market) — never another market's. Printing the AU column under a
// US$ sign would be the old bug in a new place.
function line(card: OgPriceCard, market: Country): OgPriceLine | null {
  const cents = pickPrice(card, market);
  return cents != null ? { market, text: formatMoney(cents, currencyOf(market)) } : null;
}

export function ogPriceLines(card: OgPriceCard | null): { headline: OgPriceLine | null; others: OgPriceLine[] } {
  if (!card) return { headline: null, others: [] };
  const order = [DEFAULT_COUNTRY, ...OG_FALLBACK_ORDER.filter((m) => m !== DEFAULT_COUNTRY)];
  const priced = order.map((m) => line(card, m)).filter((l): l is OgPriceLine => l != null);
  return { headline: priced[0] ?? null, others: priced.slice(1) };
}

// "US · AU · UK · SG · CA · EU", built from the market list so a market added
// or retired there shows up here. The hand-typed footer this replaces had
// missed EU since the market launched (2026-08-23).
export function ogMarketsFooter(): string {
  return `Compare live prices across ${COUNTRY_LIST.map((c) => c.code).join(" · ")}`;
}
