// What one market shows for one product: the comparison (rows you can buy),
// the reference figures beneath it, the headline price and an eBay search.
// Pure and client-safe; the server calls it with every market's stored rows.
//
// The rules are the Riftbound site's, applied unchanged (docs/CURRENT-STATE.md):
//  • Rows are ranked cheapest first by ITEM price. No comparison is re-ranked:
//    a tracked eBay listing keeps its price position (and wears eBay blue in
//    the UI); an eBay SEARCH, which claims no price, sits beside the list.
//  • Offer states come from lib/sealed-offers.ts: open, sold out, or unknown
//    once a row is 72h old. Only an open row sets the headline.
//  • Reference prices (TCGplayer market, Cardmarket trend) sit below the
//    comparison, never in it. Outside their own market they are converted with
//    lib/fx.ts and marked "≈": a reference, never a quote.

import { COUNTRIES, COUNTRY_LIST, type Country } from "../country";
import { convertCents } from "../fx";
import { affiliateUrl, ebayLabel, ebaySearchUrl } from "../affiliate";
import { headlineOffer, offerStock, rankOffers } from "../sealed-offers";
import { pokemonEbayQuery } from "./ebay-query";
import type { PkBoard, PkListing, PkOfferRow, PkReference, PkTile } from "./types";

/** Where each source's own rows live. */
const HOME_MARKET = { tcgplayer: "US", tcgplayer_market: "US", cardmarket: "EU", cardmarket_trend: "EU" } as const;

export function listingLabel(source: PkListing["source"], market: Country): string {
  if (source === "tcgplayer") return "TCGplayer";
  if (source === "cardmarket") return "Cardmarket";
  return ebayLabel(market);
}

function listingBasis(source: PkListing["source"]): string {
  if (source === "tcgplayer") return "Cheapest listing, item price";
  if (source === "cardmarket") return "Lowest listing, any language";
  return "Cheapest matching listing we found";
}

/**
 * `page` is the path the links render on: it reaches EPN's customid and
 * TCGplayer's sharedid through affiliateUrl, so the networks' own reports can
 * split Pokémon revenue by page. `surface` names the placement for eBay searches.
 */
export function buildBoard(
  productName: string,
  rows: readonly PkOfferRow[],
  market: Country,
  opts: { page: string; surface: string; now?: number },
): PkBoard {
  const currency = COUNTRIES[market].currency;
  const now = opts.now ?? Date.now();

  const listings: PkListing[] = rows
    .filter((r) => r.market === market && (r.source === "tcgplayer" || r.source === "ebay" || r.source === "cardmarket"))
    .map((r) => {
      const source = r.source as PkListing["source"];
      return {
        source,
        retailer: `pkmn_${source === "ebay" ? `ebay_${market.toLowerCase()}` : source}`,
        label: listingLabel(source, market),
        basis: listingBasis(source),
        priceCents: r.priceCents,
        currency: r.currency,
        shippingCents: source === "ebay" ? r.shippingCents : null,
        href: affiliateUrl(r.url, `pkmn_${source}`, opts.page),
        title: r.title,
        inStock: r.inStock,
        lastSeen: r.checkedAt,
      };
    })
    // A row whose stored currency is not the market's is refused, as
    // lib/offer-currency.ts refuses a store's.
    .filter((l) => l.currency === currency);

  const ranked = rankOffers(listings, now);
  const references: PkReference[] = [];

  const tcgMarket = rows.find((r) => r.source === "tcgplayer_market" && r.market === HOME_MARKET.tcgplayer_market);
  if (tcgMarket) {
    const converted = market !== "US";
    references.push({
      source: "tcgplayer_market",
      label: "TCGplayer market price",
      basis: converted ? "US market price, converted" : "Based on recent TCGplayer sales",
      priceCents: converted ? convertCents(tcgMarket.priceCents, tcgMarket.currency, currency) : tcgMarket.priceCents,
      currency,
      converted,
      href: affiliateUrl(tcgMarket.url, "pkmn_tcgplayer_ref", opts.page),
      checkedAt: tcgMarket.checkedAt,
    });
  }
  // Cardmarket's trend is a reference for the two European markets only; a
  // converted euro trend means little to a buyer in Sydney or Toronto.
  const cmTrend = rows.find((r) => r.source === "cardmarket_trend" && r.market === HOME_MARKET.cardmarket_trend);
  if (cmTrend && (market === "EU" || market === "UK")) {
    const converted = market !== "EU";
    references.push({
      source: "cardmarket_trend",
      label: "Cardmarket trend price",
      basis: converted ? "EU trend price, converted" : "Cardmarket's own trend figure",
      priceCents: converted ? convertCents(cmTrend.priceCents, cmTrend.currency, currency) : cmTrend.priceCents,
      currency,
      converted,
      href: affiliateUrl(cmTrend.url, "pkmn_cardmarket_ref", opts.page),
      checkedAt: cmTrend.checkedAt,
    });
  }

  return {
    market,
    currency,
    listings: ranked,
    references,
    headline: headlineOffer(ranked, now),
    ebaySearch: {
      label: `Search ${ebayLabel(market)}`,
      href: ebaySearchUrl(market, pokemonEbayQuery(productName), `pkmn-${opts.surface}`),
    },
  };
}

/**
 * A grid tile's figures for one market, from the same stored rows. No hrefs:
 * a tile links to the product, and the quick view fetches its board.
 */
export function tileFigures(
  rows: readonly PkOfferRow[],
  market: Country,
  now: number = Date.now(),
): Pick<PkTile, "lowCents" | "lowSource" | "refCents" | "openCount"> {
  const currency = COUNTRIES[market].currency;
  const own = rows
    .filter((r) => r.market === market && (r.source === "tcgplayer" || r.source === "ebay" || r.source === "cardmarket"))
    .filter((r) => r.currency === currency)
    .map((r) => ({ source: r.source as PkListing["source"], priceCents: r.priceCents, inStock: r.inStock, lastSeen: r.checkedAt }));
  const best = headlineOffer(own, now);
  const tcgMarket = rows.find((r) => r.source === "tcgplayer_market" && r.market === "US");
  return {
    lowCents: best?.priceCents ?? null,
    lowSource: best?.source ?? null,
    refCents: tcgMarket ? convertCents(tcgMarket.priceCents, tcgMarket.currency, currency) : null,
    openCount: own.filter((o) => offerStock(o, now) === "open").length,
  };
}

/** Every market's board, keyed by market — what the product page and the quick view ship. */
export function allBoards(
  productName: string,
  rows: readonly PkOfferRow[],
  opts: { page: string; surface: string; now?: number },
): Record<Country, PkBoard> {
  const out = {} as Record<Country, PkBoard>;
  for (const c of COUNTRY_LIST) out[c.code] = buildBoard(productName, rows, c.code, opts);
  return out;
}
