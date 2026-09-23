import { isFallbackRetailer, TCGPLAYER_MARKET_RETAILER } from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
// "Should this surface show the TCGplayer reference price, and from which row?"
// ─────────────────────────────────────────────────────────────────────────────
// TCGplayer publishes ONE USD market price per card. Its AU/UK/SG/CA rows are
// that figure run through an FX rate, so constants.ts's "THE RULE" block bars
// them from every price comparison: they are a reference value, not a buyable
// local listing. What survives is a clearly-labelled reference block, and until
// now only the full card page had one — the QuickView popup, which is where most
// visitors actually compare prices, showed no TCGplayer figure at all.
//
// WHY THIS IS A SHARED FUNCTION AND NOT COPIED INTO THE SECOND CALLER. The
// predicate below has already been wrong once in this codebase, in exactly the
// way a second copy would make it wrong again. CardMarketSection's test was a
// hand-listed `tcgplayer | tcgplayer_uk | tcgplayer_sg`, which suppressed the
// block for UK and SG visitors even though their converted row is never
// rendered — so those two markets saw no TCGplayer price anywhere. tcgplayer.ts
// has its own scar from the same class of bug (tests/tcgplayer.test.ts: "The
// cause was DRIFT between two copies of one rule"). One function, two callers.
//
// THE QUESTION IT ASKS is deliberately "is TCGplayer already a buyable row in
// THIS market?" rather than any list of retailer keys. That answers correctly
// for every market that exists and every market that will be added: in the US
// the native USD row is in the comparison table, so a reference block would
// duplicate it; everywhere else the local TCGplayer row is a fallback that the
// table strips, so the block is purely additive.

/** The fields both callers' row types share. `MarketRow` and the QuickView's
 *  `RetailerPrice` are different shapes; this is their overlap. */
export interface TcgRefRow {
  retailer: string;
  country: string;
  priceCents: number;
  isFoil: boolean;
}

/**
 * The standard and foil rows to quote as a TCGplayer reference, or null when
 * this surface must not show one.
 *
 * Returns the ROWS rather than a rendered figure because the two callers build
 * their outbound link differently — the card page's `MarketRow` arrives with a
 * `buyHref` already affiliate-wrapped, while the QuickView holds a raw `url` and
 * wraps it itself. Everything upstream of that difference is shared.
 *
 * Null in three cases, all of them correct:
 *   • TCGplayer is already a buyable row in this market (the US) — the block
 *     would restate a price the comparison table is showing.
 *   • There is no `tcgplayer` USD row for the card at all.
 *   • Intl is disabled, so the API hard-filtered the response to one country and
 *     the USD row never reached the client. Falls out of the case above for
 *     free, and is the reason this takes rows rather than fetching anything.
 */
export function tcgReferenceRows<T extends TcgRefRow>(
  rows: readonly T[],
  country: string,
): { std: T | null; foil: T | null } | null {
  const shownNatively = rows.some(
    (r) => r.retailer.startsWith("tcgplayer") && r.country === country && !isFallbackRetailer(r.retailer),
  );
  if (shownNatively) return null;
  // The single USD market price. Since 2026-09-23 that is the US reference row
  // TCGPLAYER_MARKET_RETAILER — the "tcgplayer" row became the cheapest English
  // listing, and this block is labelled "TCGplayer market price". Falls back to
  // the "tcgplayer" row per printing when no market row is present (see
  // lib/tcg-market-rows.ts). The converted per-market variants (tcgplayer_au,
  // _uk, _sg, _ca) are the SAME market number after an FX hop, so quoting one of
  // those instead would double-convert: TcgMarketPrice converts from USD.
  const pick = (foil: boolean) =>
    rows.find((r) => r.retailer === TCGPLAYER_MARKET_RETAILER && r.isFoil === foil) ??
    rows.find((r) => r.retailer === "tcgplayer" && r.isFoil === foil) ??
    null;
  const std = pick(false);
  const foil = pick(true);
  if (!std && !foil) return null;
  return { std, foil };
}
