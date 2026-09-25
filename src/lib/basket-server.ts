// The database half of Best Basket, shared by /api/basket and the portfolio's
// /api/portfolio/replacement. lib/basket.ts is the pure optimiser; this file is
// every read that feeds it, each scoped the way the egress rules at the top of
// lib/db.ts require: per user or per card-id list, an explicit select, a cap.
//
// Nothing here is cached, on purpose. Every answer is per user (their list,
// their watchlist, their binder, what they own), so an unstable_cache entry
// would be one more entry per request that nothing else could ever hit.
//
// Nothing here swallows an error either. A failed listing read used to come
// back as `[]` (`.catch(() => [])`), which the optimiser priced as "nothing in
// stock": a $0.00 plan across 0 stores, with every card sent to eBay. The
// callers answer 503 instead.

import { prisma } from "./db";
import { pickPrice, type Country } from "./country";
import { CONDITION_MULTIPLIER } from "./constants";
import type { BasketCard } from "./basket";

// The stores themselves — which serve this market, and what each charges to
// post an order — are not a read: lib/shipping.ts basketStoresFor() builds
// them from RETAILERS and the measured postage snapshot, bound to the buyer's
// region and tracked-only choice. eBay (and TCGplayer) are not in RETAILERS and
// are excluded on purpose — their postage is quoted per listing and isn't
// comparable with a store's per-order rate. Both routes pass that map's keys
// as `allowed` below, stores that do not post to the buyer included, so the
// optimiser can say which of them stocked a card and why it left them out.

// In-stock listings for these cards at this market's stores, reduced to the
// cheapest per (card, store) — the optimiser wants one row per store, not
// every copy a store has. retailerName is not selected (names come from
// RETAILERS); condition is, so every plan line can show it. Throws on failure.
export async function loadStoreListings(
  cardIds: string[],
  country: Country,
  allowed: string[]
): Promise<Map<string, BasketCard["listings"]>> {
  const byCard = new Map<string, BasketCard["listings"]>();
  if (!cardIds.length || !allowed.length) return byCard;
  const rows = await prisma.retailerPrice.findMany({
    where: { cardId: { in: cardIds }, country, inStock: true, retailer: { in: allowed } },
    select: { cardId: true, retailer: true, priceCents: true, url: true, condition: true },
  });
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.cardId}|${r.retailer}`;
    const prev = best.get(k);
    if (!prev || r.priceCents < prev.priceCents) best.set(k, r);
  }
  for (const r of best.values()) {
    const arr = byCard.get(r.cardId) ?? [];
    arr.push({ retailer: r.retailer, priceCents: r.priceCents, url: r.url, condition: r.condition });
    byCard.set(r.cardId, arr);
  }
  return byCard;
}

// The cards this account watches in this market, one copy each.
export const WATCHLIST_BASKET_CAP = 200;
export async function loadWatchlistCardIds(userId: string, country: Country): Promise<string[]> {
  const rows = await prisma.priceAlert.findMany({
    where: { userId, market: country },
    select: { cardId: true },
    orderBy: { createdAt: "desc" },
    take: WATCHLIST_BASKET_CAP,
  });
  return [...new Set(rows.map((r) => r.cardId))];
}

// How many copies of each of these cards the account already holds, for "Skip
// copies I already own". Several rows per card are normal (one per condition
// and foil), hence the sum; 400 rows covers two per card at the 200-card cap.
export async function loadOwnedQty(userId: string, cardIds: string[]): Promise<Map<string, number>> {
  const owned = new Map<string, number>();
  if (!cardIds.length) return owned;
  const rows = await prisma.collectionCard.findMany({
    where: { userId, cardId: { in: cardIds } },
    select: { cardId: true, quantity: true },
    take: 400,
  });
  for (const r of rows) owned.set(r.cardId, (owned.get(r.cardId) ?? 0) + r.quantity);
  return owned;
}

// ── The binder, for replacement cost ─────────────────────────────────────────
//
// The binder has no notion of "missing" cards — a CollectionCard row is a card
// you hold, and there is no want-list or set-completion target to diff against.
// So "price my binder" honestly means replacement: what re-buying the cards you
// hold would cost today, delivered — the same question the portfolio's
// "Replacement cost, delivered" panel answers, from the same reader.

// The optimiser is a local search over cards × stores, and the listing read
// grows with the collection. A collection past this is priced on its dearest
// rows, which is where the money is, and the response says so rather than
// silently pricing part of it.
export const MAX_HOLDINGS = 200;
// A hard stop on the rows read at all; far past any real binder.
const BINDER_ROW_CAP = 3000;

export interface BinderHolding {
  cardId: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  qty: number;
  valueCents: number; // what the collection says these copies are worth
}

export async function loadBinderHoldings(
  userId: string,
  country: Country
): Promise<{ wanted: BinderHolding[]; skipped: number; empty: boolean }> {
  const rows = await prisma.collectionCard.findMany({
    where: { userId },
    select: {
      cardId: true,
      quantity: true,
      condition: true,
      card: {
        select: {
          name: true,
          slug: true,
          setCode: true,
          collectorNumber: true,
          lowestPriceCents: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
          lowestPriceCentsSg: true,
          lowestPriceCentsCa: true,
          lowestPriceCentsEu: true,
        },
      },
    },
    take: BINDER_ROW_CAP,
  });
  // Same defensive filter getPortfolio() carries: a stale cardId left by a
  // database restore comes back with a null `card` despite the non-null type,
  // and one bad row must not fail the whole request.
  const valid = rows.filter((r) => r.card != null);

  // Merge duplicate rows (the same printing in two conditions is two rows, but
  // one card to re-buy) and rank by what the collection says each is worth, so a
  // capped run prices the dearest holdings rather than an arbitrary 200.
  const merged = new Map<string, BinderHolding>();
  for (const r of valid) {
    const market = pickPrice(r.card, country);
    const unit = market != null ? Math.round(market * (CONDITION_MULTIPLIER[r.condition] ?? 1)) : 0;
    const ex = merged.get(r.cardId);
    if (ex) {
      ex.qty += r.quantity;
      ex.valueCents += unit * r.quantity;
    } else {
      merged.set(r.cardId, {
        cardId: r.cardId,
        name: r.card.name,
        slug: r.card.slug,
        setCode: r.card.setCode,
        collectorNumber: r.card.collectorNumber,
        qty: r.quantity,
        valueCents: unit * r.quantity,
      });
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.valueCents - a.valueCents);
  const wanted = ranked.slice(0, MAX_HOLDINGS);
  return { wanted, skipped: ranked.length - wanted.length, empty: valid.length === 0 };
}
