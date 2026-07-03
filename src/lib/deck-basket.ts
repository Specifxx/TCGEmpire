import { prisma } from "@/lib/db";
import { RETAILERS } from "@/lib/retailers";
import { optimizeBasket, type BasketCard, type BasketPlan } from "@/lib/basket";
import type { Country } from "@/lib/country";

// "Cost to build this deck — cheapest whole cart." Takes a resolved deck's
// {cardId, qty} lines, pulls every in-stock STORE listing in the market, and
// runs the same landed-cost optimiser Best Basket uses — but FREE and public
// (it's a buy list: the more we help players check out, the more affiliate
// clicks). eBay is excluded (its per-item postage isn't comparable to a
// consolidated store cart).
export interface DeckCartLine {
  cardId: string;
  name: string;
  slug: string | null;
  qty: number;
}

export async function buildDeckCart(lines: DeckCartLine[], country: Country): Promise<BasketPlan | null> {
  const wanted = lines.filter((l) => l.cardId && l.qty > 0);
  if (wanted.length === 0) return null;

  // Stores serving this market (eBay isn't in RETAILERS, so it's excluded).
  const marketStores = Object.values(RETAILERS).filter((r) => (r.country ?? "AU") === country);
  const allowed = new Set(marketStores.map((r) => r.key));
  const storesMap = Object.fromEntries(
    marketStores.map((r) => [
      r.key,
      { name: r.name, ship: { shippingFlatCents: r.shippingFlatCents, freeOverCents: r.freeOverCents } },
    ])
  );

  const cardIds = wanted.map((w) => w.cardId);
  const listings = await prisma.retailerPrice
    .findMany({
      where: { cardId: { in: cardIds }, country, inStock: true, retailer: { in: [...allowed] } },
      select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
    })
    .catch(() => []);

  // Cheapest listing per (card, store).
  const byCardStore = new Map<string, { retailer: string; retailerName: string; priceCents: number; url: string }>();
  for (const l of listings) {
    const k = `${l.cardId}|${l.retailer}`;
    const prev = byCardStore.get(k);
    if (!prev || l.priceCents < prev.priceCents) byCardStore.set(k, l);
  }
  const listingsByCard = new Map<string, BasketCard["listings"]>();
  for (const [k, l] of byCardStore) {
    const cardId = k.split("|")[0];
    const arr = listingsByCard.get(cardId) ?? [];
    arr.push({ retailer: l.retailer, retailerName: l.retailerName, priceCents: l.priceCents, url: l.url });
    listingsByCard.set(cardId, arr);
  }

  const basketCards: BasketCard[] = wanted.map((w) => ({
    cardId: w.cardId,
    name: w.name,
    slug: w.slug,
    qty: w.qty,
    listings: listingsByCard.get(w.cardId) ?? [],
  }));

  return optimizeBasket(basketCards, storesMap);
}
