import type { SealedGroup } from "./sealed-import";
import { offerStock } from "./sealed-offers";
import type { Mover } from "./price-history";
import type { AuctionRow } from "./ebay-auctions";
import { gradeLabel } from "./graded-history";

// The Black Friday / Cyber Monday PRICE WATCH (2026-11-06; DECISIONS.md, "Black
// Friday and Cyber Monday price watch pages"). The owner's numbers for October:
// the US made 73% of affiliate earnings at a US$108 average order, one US$6.4k
// order earned as much as twelve ordinary days, and eBay only credits a purchase
// made within 24 hours of the click. So the two sale pages carry, beside the
// sealed deals table, four sections that each end in a LIVE eBay listing a
// buyer can open now:
//
//   1. Sealed boxes: every in-stock booster box and big sealed product, the
//      cheapest store beside the cheapest eBay listing, dearest first.
//   2. Biggest price drops: the week's steepest falls (getPriceMovers
//      `plummeting`), each with the cheapest tracked eBay copy when there is one.
//   3. Graded cards: the dearest PSA/BGS/CGC slab live on eBay for each card,
//      one row per card, from the same EbayGradedListing rows the card pages
//      and /graded read.
//   4. Chase auctions: the biggest live bids closing today (/auctions' rows).
//
// Everything here is PURE and tested in tests/price-watch.test.ts; the page
// reads the loaders that already cache themselves (getSealedGroups,
// getPriceMovers, getLiveAuctions, getCheapestOnEbayFor) and getGradedWatch
// below, one bounded, six-hour read. The rules the rest of the site keeps
// hold: an eBay row is never a store, never a deal and never "the cheapest";
// no "was" price, countdown or "ends soon"; asking prices, not sales.

/** Rows each section shows. */
export const SEALED_WATCH_ROWS = 12;
export const DROP_WATCH_ROWS = 8;
export const GRADED_WATCH_ROWS = 12;
export const AUCTION_WATCH_ROWS = 6;

/** A graded asking price above this (US cents) is a joke or a typo, not a market: left out. */
export const GRADED_WATCH_MAX_CENTS = 500_000;
/** Graded rows older than this are not shown (the daily eBay pass sweeps at 72 h too). */
export const GRADED_WATCH_MAX_AGE_HOURS = 72;

export interface SealedWatchRow {
  group: SealedGroup;
  /** Cheapest open store offer, or null when no store has it in stock. */
  store: { priceCents: number; retailer: string; retailerName: string; url: string } | null;
  /** Cheapest in-stock eBay listing the sealed import captured, or null. */
  ebay: { priceCents: number; retailer: string; url: string } | null;
}

/** Product types that belong on the sealed shelf, in the order they lead. */
const SEALED_WATCH_TYPES = ["Booster Box", "Case", "Bundle", "Collector Set", "Starter Set", "Champion Deck", "Display"];

function typeRank(productType: string): number {
  const i = SEALED_WATCH_TYPES.findIndex((t) => productType.toLowerCase().includes(t.toLowerCase()));
  return i === -1 ? SEALED_WATCH_TYPES.length : i;
}

/**
 * In-stock sealed products with a store or eBay price, booster boxes first, then
 * dearest first within a type: the high-end shelf, not a deals list (the deals
 * table above it has those). A product with neither an open store nor an eBay
 * row is left out.
 */
export function sealedWatch(groups: readonly SealedGroup[], now: number = Date.now(), limit = SEALED_WATCH_ROWS): SealedWatchRow[] {
  const out: SealedWatchRow[] = [];
  for (const g of groups) {
    let store: SealedWatchRow["store"] = null;
    let ebay: SealedWatchRow["ebay"] = null;
    for (const l of g.listings) {
      if (l.retailer.startsWith("ebay")) {
        if (l.inStock && (!ebay || l.priceCents < ebay.priceCents)) ebay = { priceCents: l.priceCents, retailer: l.retailer, url: l.url };
      } else if (offerStock(l, now) === "open" && (!store || l.priceCents < store.priceCents)) {
        store = { priceCents: l.priceCents, retailer: l.retailer, retailerName: l.retailerName, url: l.url };
      }
    }
    if (!store && !ebay) continue;
    out.push({ group: g, store, ebay });
  }
  const headline = (r: SealedWatchRow) => r.store?.priceCents ?? r.ebay!.priceCents;
  return out.sort((a, b) => typeRank(a.group.productType) - typeRank(b.group.productType) || headline(b) - headline(a)).slice(0, limit);
}

export interface DropWatchRow {
  mover: Mover;
  /** The cheapest tracked eBay copy of the card, affiliate-tagged by the caller, or null. */
  ebay: { priceCents: number; postageKnown: boolean; url: string; retailer: string } | null;
}

/**
 * The week's steepest falls, as /movers ranks them, each joined with the
 * cheapest eBay copy getCheapestOnEbayFor knows. `tag` turns the listing's own
 * URL into the tracked one (ebayAffiliateUrl with this page's source).
 */
export function dropsWatch(
  plummeting: readonly Mover[],
  ebayByCard: ReadonlyMap<string, { ebayCents: number; postageKnown: boolean; url: string; ebayKey: string }>,
  tag: (url: string) => string,
  limit = DROP_WATCH_ROWS,
): DropWatchRow[] {
  return plummeting.slice(0, limit).map((mover) => {
    const e = ebayByCard.get(mover.card.id);
    return { mover, ebay: e ? { priceCents: e.ebayCents, postageKnown: e.postageKnown, url: tag(e.url), retailer: e.ebayKey } : null };
  });
}

export interface GradedListingRow {
  cardId: string;
  itemId: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  title: string;
  imageUrl: string | null;
  grader: string | null;
  grade: number | null;
  updatedAt: Date | string;
}

export interface GradedWatchCard {
  id: string;
  slug: string | null;
  name: string;
  setName: string;
  collectorNumber: string;
}

export interface GradedWatchRow {
  card: GradedWatchCard;
  /** "PSA 10", "BGS 9.5", or "Graded" when the slab names no number. */
  grade: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  /** The listing's own URL; the caller tags it. */
  url: string;
  title: string;
  imageUrl: string | null;
}

const gradeScore = (r: GradedListingRow): number => (r.grade ?? 0) + (r.grader?.toUpperCase() === "PSA" ? 0.01 : 0);

/**
 * One row per card: its best-graded live slab (highest grade, PSA first on a
 * tie, cheapest listing of that grade), the dearest cards first. Stale rows and
 * asking prices above GRADED_WATCH_MAX_CENTS are left out.
 */
export function gradedWatch(
  listings: readonly GradedListingRow[],
  cards: ReadonlyMap<string, GradedWatchCard>,
  now: number = Date.now(),
  limit = GRADED_WATCH_ROWS,
): GradedWatchRow[] {
  const cutoff = now - GRADED_WATCH_MAX_AGE_HOURS * 3_600_000;
  const best = new Map<string, GradedListingRow>();
  for (const l of listings) {
    if (!Number.isInteger(l.priceCents) || l.priceCents <= 0 || l.priceCents > GRADED_WATCH_MAX_CENTS) continue;
    if (new Date(l.updatedAt).getTime() < cutoff) continue;
    if (!cards.has(l.cardId)) continue;
    const cur = best.get(l.cardId);
    if (!cur || gradeScore(l) > gradeScore(cur) || (gradeScore(l) === gradeScore(cur) && l.priceCents < cur.priceCents)) best.set(l.cardId, l);
  }
  return [...best.values()]
    .map((l) => ({
      card: cards.get(l.cardId)!,
      grade: gradeLabel(l.grader, l.grade),
      priceCents: l.priceCents,
      shippingCents: l.shippingCents,
      currency: l.currency,
      url: l.url,
      title: l.title,
      imageUrl: l.imageUrl,
    }))
    .sort((a, b) => b.priceCents - a.priceCents || a.card.name.localeCompare(b.card.name))
    .slice(0, limit);
}

/** The biggest live bids closing today, biggest first. */
export function auctionWatch(rows: readonly AuctionRow[], limit = AUCTION_WATCH_ROWS): AuctionRow[] {
  return [...rows].sort((a, b) => b.currentBidCents - a.currentBidCents || Date.parse(a.endsAt) - Date.parse(b.endsAt)).slice(0, limit);
}
