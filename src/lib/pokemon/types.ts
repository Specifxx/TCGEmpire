// Shapes shared by the Pokémon loaders, pages and client components. Types
// only, client-safe.

import type { Country } from "../country";
import type { PkKind } from "./kinds";

export type PkSource = "tcgplayer" | "tcgplayer_market" | "ebay" | "cardmarket" | "cardmarket_trend";
export type PkListingSource = "tcgplayer" | "ebay" | "cardmarket";

/** One stored offer, as read from the database (dates as ISO strings). */
export interface PkOfferRow {
  market: string;
  source: PkSource;
  priceCents: number;
  currency: string;
  shippingCents: number | null;
  url: string;
  title: string | null;
  inStock: boolean;
  checkedAt: string;
}

/**
 * A row in a market's price comparison. Shaped like lib/sealed-offers.ts's
 * SealedOffer (priceCents, inStock, lastSeen), so the Riftbound sealed
 * offer-state rules apply unchanged: open, sold out, or unknown past 72h.
 */
export interface PkListing {
  source: PkListingSource;
  /** Analytics key for OutboundLink's `retailer` (buy_click). */
  retailer: string;
  label: string;
  /** What the figure is, in a few words: "Cheapest listing, item price". */
  basis: string;
  priceCents: number;
  currency: string;
  /** eBay only: stated postage (0 = free), null = not stated. */
  shippingCents: number | null;
  /** Affiliate-tagged outbound link, built on the server. */
  href: string;
  title: string | null;
  inStock: boolean;
  lastSeen: string;
}

/** A figure shown BELOW the comparison, never in it (CURRENT-STATE, "Reference prices"). */
export interface PkReference {
  source: "tcgplayer_market" | "cardmarket_trend";
  label: string;
  basis: string;
  priceCents: number;
  currency: string;
  /** Converted from another market's currency with lib/fx.ts — shown with "≈". */
  converted: boolean;
  href: string | null;
  checkedAt: string;
}

export interface PkEbaySearch {
  label: string;
  href: string;
}

/** Everything one market shows for one product. */
export interface PkBoard {
  market: Country;
  currency: string;
  listings: PkListing[];
  references: PkReference[];
  /** Cheapest OPEN listing, or null. */
  headline: PkListing | null;
  /** Always present: a search of this market's eBay for the product. */
  ebaySearch: PkEbaySearch;
}

/** A product on a grid: identity plus one market's headline figures. */
export interface PkTile {
  id: number;
  slug: string;
  name: string;
  kind: PkKind;
  setSlug: string | null;
  setName: string | null;
  series: string;
  imageUrl: string | null;
  releasedOn: string | null;
  presale: boolean;
  /** Cheapest open listing in the market (its currency), null when none. */
  lowCents: number | null;
  lowSource: PkListingSource | null;
  /** TCGplayer market price in the market's currency (≈ outside the US). */
  refCents: number | null;
  /** Number of sources with an open listing. */
  openCount: number;
  firstSeenAt: string;
}

export interface PkSetSummary {
  slug: string;
  name: string;
  code: string | null;
  series: string;
  releasedOn: string | null;
  productCount: number;
  /** A representative product image (the booster box, else the first product). */
  imageUrl: string | null;
}

export interface PkCatalog {
  market: Country;
  currency: string;
  tiles: PkTile[];
  sets: PkSetSummary[];
  /** When the newest TCGplayer price was read — the "updated" line. */
  pricesAsOf: string | null;
  /** Which sources hold any row at all, so copy names only sources that exist. */
  sources: PkSource[];
}

export interface PkPricePointView {
  day: string;
  cents: number;
}

/** A product's own page: identity, every market's board, the price series. */
export interface PkProductDetail {
  id: number;
  slug: string;
  name: string;
  kind: PkKind;
  series: string;
  set: { slug: string; name: string; code: string | null; releasedOn: string | null } | null;
  imageUrl: string | null;
  tcgplayerUrl: string;
  releasedOn: string | null;
  presale: boolean;
  contents: string[];
  upc: string | null;
  /** Raw stored rows, every market. Boards are built from these. */
  offers: PkOfferRow[];
  /** TCGplayer market price (USD), oldest first. */
  history: PkPricePointView[];
  siblings: { slug: string; name: string; kind: PkKind; imageUrl: string | null }[];
}
