// Best-Basket optimiser: the cheapest way to actually BUY a list of cards across
// the stores we track — minimising the grand total INCLUDING per-store postage and
// each store's free-shipping threshold. Buying every card from its individually
// cheapest store usually spreads the order over many stores and racks up postage;
// consolidating onto fewer stores (or pushing one store over its free-shipping
// threshold) often wins overall. That trade-off is exactly what this solves.
//
// Exact minimisation is NP-hard with the free-shipping thresholds, so we use a
// greedy start + single-move hill-climb, which gets within a couple of % of optimal
// at deck/wishlist sizes and is fully deterministic.

export interface BasketListing {
  retailer: string; // store key
  retailerName: string;
  priceCents: number; // cheapest in-stock unit price at this store
  url: string;
}

export interface BasketCard {
  cardId: string;
  name: string;
  slug: string | null;
  qty: number;
  listings: BasketListing[]; // one (cheapest) listing per store that stocks it
}

export interface StoreShip {
  shippingFlatCents: number;
  freeOverCents: number; // 0 = no free-shipping threshold
}

export interface BasketStoreGroup {
  key: string;
  name: string;
  lines: { name: string; slug: string | null; qty: number; unitCents: number; url: string }[];
  subtotalCents: number;
  shippingCents: number;
  freeShipping: boolean;
}

export interface BasketPlan {
  stores: BasketStoreGroup[]; // dearest subtotal first
  itemsCents: number;
  shippingCents: number;
  totalCents: number;
  storeCount: number;
  // Buying each card from its individually-cheapest store (no consolidation).
  naiveTotalCents: number;
  naiveStoreCount: number;
  savedCents: number; // naiveTotal − total (≥ 0)
  unbuyable: { name: string; qty: number }[]; // no in-stock store listing found
  matchedCards: number;
}

type Stores = Record<string, { name: string; ship: StoreShip }>;

// Total landed cost of an assignment (cardIndex → store key), incl. postage.
function cost(
  assign: (string | null)[],
  buyable: BasketCard[],
  priceAt: Map<string, number>[],
  stores: Stores
): { total: number; items: number; subtotals: Map<string, number> } {
  const subtotals = new Map<string, number>();
  let items = 0;
  buyable.forEach((c, i) => {
    const s = assign[i];
    if (!s) return;
    const unit = priceAt[i].get(s)!;
    const line = unit * c.qty;
    items += line;
    subtotals.set(s, (subtotals.get(s) ?? 0) + line);
  });
  let shipping = 0;
  for (const [key, sub] of subtotals) {
    const st = stores[key]?.ship;
    if (!st) continue;
    if (sub > 0 && (st.freeOverCents <= 0 || sub < st.freeOverCents)) shipping += st.shippingFlatCents;
  }
  return { total: items + shipping, items, subtotals };
}

export function optimizeBasket(cards: BasketCard[], stores: Stores): BasketPlan {
  const unbuyable = cards.filter((c) => c.listings.length === 0).map((c) => ({ name: c.name, qty: c.qty }));
  const buyable = cards.filter((c) => c.listings.length > 0);

  // Per-card price lookup by store + the card's cheapest store (greedy start).
  const priceAt: Map<string, number>[] = buyable.map((c) => {
    const m = new Map<string, number>();
    for (const l of c.listings) {
      const prev = m.get(l.retailer);
      if (prev == null || l.priceCents < prev) m.set(l.retailer, l.priceCents);
    }
    return m;
  });
  const cheapestStore = (i: number): string => {
    let best: string | null = null;
    let bestP = Infinity;
    for (const [s, p] of priceAt[i]) if (p < bestP) { bestP = p; best = s; }
    return best!;
  };

  const naive = buyable.map((_, i) => cheapestStore(i));
  const naiveCost = cost(naive, buyable, priceAt, stores);
  const naiveStoreCount = new Set(naive).size;

  // Hill-climb from the greedy start: repeatedly take the single best card→store
  // reassignment that lowers the landed total, until no move helps.
  const assign = [...naive];
  let current = naiveCost.total;
  for (let iter = 0; iter < 60; iter++) {
    let bestDelta = 0;
    let bestI = -1;
    let bestS: string | null = null;
    for (let i = 0; i < buyable.length; i++) {
      const from = assign[i];
      for (const s of priceAt[i].keys()) {
        if (s === from) continue;
        assign[i] = s;
        const t = cost(assign, buyable, priceAt, stores).total;
        assign[i] = from;
        if (t - current < bestDelta - 1) { // strictly better (>$0.01) to avoid cycling
          bestDelta = t - current;
          bestI = i;
          bestS = s;
        }
      }
    }
    if (bestI < 0 || bestS == null) break;
    assign[bestI] = bestS;
    current += bestDelta;
  }

  const final = cost(assign, buyable, priceAt, stores);

  // Group by store.
  const groups = new Map<string, BasketStoreGroup>();
  buyable.forEach((c, i) => {
    const key = assign[i]!;
    const unit = priceAt[i].get(key)!;
    const listing = c.listings.find((l) => l.retailer === key)!;
    const g =
      groups.get(key) ??
      groups.set(key, { key, name: stores[key]?.name ?? key, lines: [], subtotalCents: 0, shippingCents: 0, freeShipping: false }).get(key)!;
    g.lines.push({ name: c.name, slug: c.slug, qty: c.qty, unitCents: unit, url: listing.url });
    g.subtotalCents += unit * c.qty;
  });
  for (const g of groups.values()) {
    const st = stores[g.key]?.ship;
    const free = !!st && st.freeOverCents > 0 && g.subtotalCents >= st.freeOverCents;
    g.freeShipping = free;
    g.shippingCents = st && !free ? st.shippingFlatCents : 0;
  }
  const storeGroups = [...groups.values()].sort((a, b) => b.subtotalCents - a.subtotalCents);
  const shippingCents = storeGroups.reduce((s, g) => s + g.shippingCents, 0);

  return {
    stores: storeGroups,
    itemsCents: final.items,
    shippingCents,
    totalCents: final.items + shippingCents,
    storeCount: storeGroups.length,
    naiveTotalCents: naiveCost.total,
    naiveStoreCount,
    savedCents: Math.max(0, naiveCost.total - (final.items + shippingCents)),
    unbuyable,
    matchedCards: buyable.length,
  };
}
