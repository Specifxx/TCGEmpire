// Cross-currency comparison of one card's price across every market we track.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// The card page already listed each market's cheapest price in that market's own
// currency — A$14.00, £6.50, US$8.20, S$12.90 — which shows the multi-currency
// data without doing anything with it. Nobody can compare four currencies by
// eye, so the one genuinely differentiated thing on the page (six markets, each
// priced natively by stores that really bill in that currency) read as a list of
// unrelated numbers.
//
// This module puts them on one scale: convert every market's cheapest into a
// single comparison currency, rank, and say plainly which market is dearest and
// by how much. The conversion is for COMPARISON ONLY and every surface built on
// this must say so — see the honesty rules below.
//
// It costs nothing to compute. The card page already serialises all six markets'
// rows (no country filter server-side — that is what makes the client's instant
// market switch possible), so this is arithmetic over data that is already on
// the page.
//
// ── THE HONESTY RULES, which are not optional ────────────────────────────────
//
//  1. NATIVE FIGURES ARE THE REAL ONES. Every `nativeCents` here is a live local
//     listing from a store that bills in that market's currency. That is the
//     number a visitor can act on.
//
//  2. CONVERTED FIGURES ARE INDICATIVE, NEVER QUOTES. lib/fx.ts is a hand-set
//     rate table, deliberately crude, and no job refreshes it. A converted
//     figure exists so two markets can be ranked against each other — it is not
//     a price anyone will be charged, and no surface may present it as one.
//
//  3. A CHEAPER MARKET IS NOT A BUYING INSTRUCTION. Tracked stores ship within
//     their own market (see lib/delivery-estimate.ts, which models domestic
//     transit only), and this module models no international postage, no import
//     duty and no GST/VAT threshold. "Cheaper in the UK" is a fact about
//     listings, not advice to import — callers must not phrase it as advice.
//
//  4. ONLY REAL LOCAL STORES COUNT. computeMarket() already drops converted
//     reference retailers (TCGplayer-UK/AU/SG, Cardmarket — see market-rows.ts),
//     so a market only appears here when it has a genuine local listing. Without
//     that filter this would compare a real price against a converted one and
//     call the difference a market spread.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRIES, COUNTRY_LIST, type Country } from "./country";
import { convertCents } from "./fx";
import { computeMarket, type MarketRow } from "./market-rows";
import { formatMoney } from "./format";

/** One market's cheapest real local listing, plus what that is worth for ranking. */
export interface MarketQuote {
  country: Country;
  /** Display name — "United States". For a table cell or a chip. */
  label: string;
  /**
   * Prepositional form with its article — "the United States". For prose only:
   * "cheapest in the United States" reads right, a table cell reading "the
   * United States" does not.
   */
  place: string;
  flag: string;
  /** The market's own currency — what the store actually bills in. */
  currency: string;
  /** Cheapest in-stock item price, in `currency`. The real, actionable figure. */
  nativeCents: number;
  /** Known postage on that listing, in `currency`. null = quoted at checkout. */
  shippingCents: number | null;
  /**
   * `nativeCents` expressed in the comparison currency. INDICATIVE ONLY — this
   * exists to rank markets against each other and must never be shown as a price
   * to pay. See honesty rule 2.
   */
  comparableCents: number;
  /** Distinct in-stock stores in this market. */
  storeCount: number;
}

export interface MarketComparison {
  /** Cheapest first, by `comparableCents`. Only markets with a real local listing. */
  quotes: MarketQuote[];
  /** The currency every `comparableCents` is expressed in. */
  compareCurrency: string;
  cheapest: MarketQuote | null;
  dearest: MarketQuote | null;
  /**
   * How much dearer the priciest market is than the cheapest, as a percentage of
   * the cheapest. null when fewer than two markets have a listing, or when the
   * cheapest is zero. Rounded to whole percent — the underlying rates are
   * indicative, so decimals would imply precision that isn't there.
   */
  spreadPct: number | null;
}

/**
 * Rank every market's cheapest local listing in one currency.
 *
 * Ranking is by ITEM price, not delivered cost — the same rule computeMarket()
 * documents and the whole site follows, because postage is known for some
 * retailers and "at checkout" for others, so including it would penalise the
 * stores that are honest about it. Postage travels alongside each quote so a
 * caller can show it.
 */
export function compareMarkets(rows: MarketRow[], compareCurrency: string): MarketComparison {
  const quotes: MarketQuote[] = [];

  for (const info of COUNTRY_LIST) {
    const view = computeMarket(rows, info.code);
    const best = view.prices[0];
    // storeCount > 0 is implied by prices[0] existing, but both are asserted:
    // a market with a price and no store would be a bug worth not rendering.
    if (!best || view.lowest == null || view.storeCount === 0) continue;
    quotes.push({
      country: info.code,
      label: info.label,
      place: info.place,
      flag: info.flag,
      currency: view.currency,
      nativeCents: view.lowest,
      shippingCents: best.ship,
      comparableCents: convertCents(view.lowest, view.currency, compareCurrency),
      storeCount: view.storeCount,
    });
  }

  quotes.sort((a, b) => a.comparableCents - b.comparableCents || a.country.localeCompare(b.country));

  const cheapest = quotes[0] ?? null;
  const dearest = quotes.length > 1 ? quotes[quotes.length - 1] : null;
  const spreadPct =
    cheapest && dearest && cheapest.comparableCents > 0
      ? Math.round(((dearest.comparableCents - cheapest.comparableCents) / cheapest.comparableCents) * 100)
      : null;

  return { quotes, compareCurrency, cheapest, dearest, spreadPct };
}

/**
 * The comparison as one plain-English sentence, for the server-rendered HTML.
 *
 * This is the part a crawler and an AI answer engine can actually use: it states
 * the card's price in several named currencies in prose, which is what "how much
 * is <card> in AUD" is really asking. It is generated from live data, so it is
 * factual on every card and stays correct as prices move.
 *
 * Returns null when there is nothing to compare — one market, or none. Callers
 * must render nothing in that case rather than a degenerate sentence.
 */
export function marketSpreadSentence(cmp: MarketComparison, cardName: string): string | null {
  const { cheapest, dearest, spreadPct, compareCurrency } = cmp;
  if (!cheapest || !dearest || spreadPct == null) return null;

  const native = (q: MarketQuote) => formatMoney(q.nativeCents, q.currency);
  // The converted figure is only worth printing when it is in a DIFFERENT
  // currency from the native one — "£6.50 (≈ £6.50)" is noise.
  const converted = (q: MarketQuote) =>
    q.currency === compareCurrency ? "" : ` (≈ ${formatMoney(q.comparableCents, compareCurrency)})`;

  return (
    `${cardName} is cheapest in ${cheapest.place} at ${native(cheapest)}${converted(cheapest)} ` +
    `and dearest in ${dearest.place} at ${native(dearest)}${converted(dearest)} — ` +
    `a ${spreadPct}% spread across the ${cmp.quotes.length} markets stocking it. ` +
    `Each store bills in its own currency; converted figures are indicative only.`
  );
}

/**
 * Every market's real local price, as prose — "A$14.00 in Australia, £6.50 in
 * the United Kingdom and US$8.20 in the United States".
 *
 * The point of writing this out rather than only tabulating it: a table is for a
 * reader, prose is what a crawler and an AI answer engine can quote back when
 * someone asks "how much is <card> in GBP". Every figure in it is a real local
 * listing in the currency a store actually bills — no converted numbers here at
 * all, so there is nothing in this sentence that needs a disclaimer.
 */
export function marketPriceListSentence(cmp: MarketComparison): string | null {
  if (!cmp.quotes.length) return null;
  const parts = cmp.quotes.map((q) => `${formatMoney(q.nativeCents, q.currency)} in ${q.place}`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "in AUD, GBP and USD" — the currencies this card is really priced in. */
export function quotedCurrencyList(cmp: MarketComparison): string {
  const seen = [...new Set(cmp.quotes.map((q) => q.currency))];
  if (seen.length <= 1) return seen[0] ?? "";
  return `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}`;
}

/** Every market we track, for copy that names them whether or not they have stock. */
export const TRACKED_MARKET_COUNT = COUNTRY_LIST.length;

/** "Australia, the United States, the United Kingdom, Singapore, Canada and the EU". */
export function trackedMarketPlaces(): string {
  const places = COUNTRY_LIST.map((c) => COUNTRIES[c.code].place);
  return `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
}
