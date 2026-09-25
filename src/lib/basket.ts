// Best-Basket optimiser: the cheapest way to actually BUY a list of cards across
// the stores we track — minimising the grand total INCLUDING each store's postage
// for the order it would actually receive. Buying every card from its
// individually cheapest store usually spreads the order over many stores and
// racks up postage; consolidating onto fewer stores (or pushing one store over
// its free-shipping threshold) often wins overall. That trade-off is exactly
// what this solves.
//
// POSTAGE IS MEASURED, PER ORDER (2026-09-25). Each store supplies a `postage`
// function — lib/shipping.ts's shippingFor, bound to the buyer's region and
// tracked-only choice — that prices an order by its subtotal AND its card
// count, from what the store's own checkout quoted. It replaced one flat guess
// per store: an Adelaide customer was shown "+ $2.00 post" here for a store
// whose only rate is $20.00, and a guessed "free over $50" zeroed postage the
// store never waives. A cheap letter rate now applies only to orders no bigger
// than the ones it was measured on, and a store that does not post to the
// buyer is left out rather than priced.
//
// Exact minimisation is NP-hard with thresholds, so this is a greedy start plus a
// hill-climb over two kinds of move: moving one card to another store, and
// draining a whole store onto the others (the move a single-card climb cannot
// make: taking one card off a store saves no postage until the last one goes).
// Fully deterministic: stores and cards are visited in input order, and a move
// must improve the total by more than a cent.

import { affiliateUrl } from "./affiliate";
import type { PostageCart, PostageQuote } from "./shipping";

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

export interface BasketStore {
  name: string;
  /** What this store charges to post an order of this size (lib/shipping.ts shippingFor). */
  postage: (cart: PostageCart) => PostageQuote;
  /** Set when the store does not post to this buyer at all: its listings are left out. */
  unavailable?: string;
}

export interface BasketStoreGroup {
  key: string;
  name: string;
  lines: { name: string; slug: string | null; qty: number; unitCents: number; url: string }[];
  subtotalCents: number;
  items: number; // physical cards in this store's order
  shippingCents: number;
  freeShipping: boolean;
  postage: PostageQuote; // the rate behind shippingCents: the store's own name, tracked or not, measured or estimate
  topUpCents: number; // spend needed to reach a minimum order the store posts nothing below (normally 0)
}

export interface BasketPlan {
  stores: BasketStoreGroup[]; // dearest subtotal first
  itemsCents: number;
  shippingCents: number;
  topUpCents: number;
  totalCents: number; // items + shipping + top-up
  storeCount: number;
  // Buying each card from its individually-cheapest store (no consolidation),
  // priced with the same postage model.
  naiveTotalCents: number;
  naiveStoreCount: number;
  savedCents: number; // naiveTotal − total (≥ 0)
  unbuyable: { name: string; qty: number }[]; // no in-stock listing at a store that posts here
  excludedStores: { key: string; name: string; reason: string }[]; // stocked a card but does not post here
  matchedCards: number;
}

type Stores = Record<string, BasketStore>;

export function optimizeBasket(cards: BasketCard[], stores: Stores): BasketPlan {
  // Stores that cannot deliver drop out before anything is priced.
  const excluded = new Map<string, { key: string; name: string; reason: string }>();
  const usable = (key: string): boolean => {
    const st = stores[key];
    if (!st) return false;
    if (st.unavailable) {
      if (!excluded.has(key)) excluded.set(key, { key, name: st.name, reason: st.unavailable });
      return false;
    }
    return true;
  };
  const withStores = cards.map((c) => ({ ...c, listings: c.listings.filter((l) => usable(l.retailer)) }));
  const unbuyable = withStores.filter((c) => c.listings.length === 0).map((c) => ({ name: c.name, qty: c.qty }));
  const buyable = withStores.filter((c) => c.listings.length > 0);

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
  const lineAt = (i: number, s: string) => priceAt[i].get(s)! * buyable[i].qty;

  // Postage is a pure function of (store, subtotal, cards), asked for many
  // times by the climb — memoised for this run.
  const memo = new Map<string, PostageQuote>();
  const quote = (key: string, sub: number, items: number): PostageQuote => {
    const k = `${key}|${sub}|${items}`;
    let q = memo.get(k);
    if (!q) {
      q = stores[key].postage({ subtotalCents: sub, items });
      memo.set(k, q);
    }
    return q;
  };
  const topUp = (q: PostageQuote, sub: number) => (q.minOrderCents && sub < q.minOrderCents ? q.minOrderCents - sub : 0);
  // What an order at one store adds on top of its items, as the SEARCH weighs
  // it: past the biggest order a store was measured on, postage that was rising
  // with card count is assumed to keep rising (riskCents), so consolidating a
  // deck onto that store is not free. The totals the plan REPORTS use the quote
  // alone (reportCost) — the shown "from $12" is what was measured.
  const storeCost = (key: string, sub: number, items: number): number => {
    if (items <= 0) return 0;
    const q = quote(key, sub, items);
    return q.cents + topUp(q, sub) + (q.riskCents ?? 0);
  };
  const reportCost = (key: string, sub: number, items: number): number => {
    if (items <= 0) return 0;
    const q = quote(key, sub, items);
    return q.cents + topUp(q, sub);
  };

  interface State { sub: Map<string, number>; cnt: Map<string, number>; items: number }
  const stateOf = (assign: string[]): State => {
    const sub = new Map<string, number>();
    const cnt = new Map<string, number>();
    let items = 0;
    assign.forEach((s, i) => {
      const line = lineAt(i, s);
      items += line;
      sub.set(s, (sub.get(s) ?? 0) + line);
      cnt.set(s, (cnt.get(s) ?? 0) + buyable[i].qty);
    });
    return { sub, cnt, items };
  };
  const totalOf = (st: State, cost = storeCost): number => {
    let t = st.items;
    for (const [k, s] of st.sub) t += cost(k, s, st.cnt.get(k)!);
    return t;
  };

  const naive = buyable.map((_, i) => cheapestStore(i));
  const naiveTotal = totalOf(stateOf(naive), reportCost);
  const naiveStoreCount = new Set(naive).size;

  const assign = [...naive];
  let state = stateOf(assign);
  let current = totalOf(state);

  const moveDelta = (i: number, to: string): number => {
    const from = assign[i];
    const qty = buyable[i].qty;
    const lf = lineAt(i, from);
    const lt = lineAt(i, to);
    const sf = state.sub.get(from)!;
    const nf = state.cnt.get(from)!;
    const st = state.sub.get(to) ?? 0;
    const nt = state.cnt.get(to) ?? 0;
    return (
      lt - lf +
      storeCost(from, sf - lf, nf - qty) - storeCost(from, sf, nf) +
      storeCost(to, st + lt, nt + qty) - storeCost(to, st, nt)
    );
  };

  // Move every card off store `x`, each to whichever other store it adds least
  // to (cards in input order). Returns the resulting assignment and total.
  const drain = (x: string): { next: string[]; total: number } | null => {
    const next = [...assign];
    const sim = { sub: new Map(state.sub), cnt: new Map(state.cnt) };
    for (let i = 0; i < buyable.length; i++) {
      if (next[i] !== x) continue;
      let best: string | null = null;
      let bestD = Infinity;
      for (const s of priceAt[i].keys()) {
        if (s === x) continue;
        const st = sim.sub.get(s) ?? 0;
        const nt = sim.cnt.get(s) ?? 0;
        const d = lineAt(i, s) + storeCost(s, st + lineAt(i, s), nt + buyable[i].qty) - storeCost(s, st, nt);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best == null) return null; // a card only this store stocks
      next[i] = best;
      sim.sub.set(best, (sim.sub.get(best) ?? 0) + lineAt(i, best));
      sim.cnt.set(best, (sim.cnt.get(best) ?? 0) + buyable[i].qty);
    }
    return { next, total: totalOf(stateOf(next)) };
  };

  for (let iter = 0; iter < 500; iter++) {
    let bestDelta = 0;
    let bestI = -1;
    let bestS: string | null = null;
    for (let i = 0; i < buyable.length; i++) {
      for (const s of priceAt[i].keys()) {
        if (s === assign[i]) continue;
        const d = moveDelta(i, s);
        if (d < bestDelta - 1) { // strictly better (>$0.01) to avoid cycling
          bestDelta = d;
          bestI = i;
          bestS = s;
        }
      }
    }
    if (bestI >= 0 && bestS != null) {
      assign[bestI] = bestS;
      state = stateOf(assign);
      current += bestDelta;
      continue;
    }
    let bestDrain: { next: string[]; total: number } | null = null;
    for (const x of [...state.sub.keys()]) {
      const r = drain(x);
      if (r && r.total < (bestDrain?.total ?? current) - 1) bestDrain = r;
    }
    if (!bestDrain) break;
    bestDrain.next.forEach((s, i) => (assign[i] = s));
    state = stateOf(assign);
    current = bestDrain.total;
  }

  // Group by store.
  const groups = new Map<string, BasketStoreGroup>();
  buyable.forEach((c, i) => {
    const key = assign[i];
    const unit = priceAt[i].get(key)!;
    const listing = c.listings.find((l) => l.retailer === key)!;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: stores[key]?.name ?? key,
        lines: [],
        subtotalCents: 0,
        items: 0,
        shippingCents: 0,
        freeShipping: false,
        postage: undefined as unknown as PostageQuote,
        topUpCents: 0,
      };
      groups.set(key, g);
    }
    // Affiliate-tag the outbound line (eBay EPN / TCGplayer Impact / per-store) — the
    // basket bypassed the wrapper the card page uses, leaving these clicks unpaid.
    g.lines.push({ name: c.name, slug: c.slug, qty: c.qty, unitCents: unit, url: affiliateUrl(listing.url, key) });
    g.subtotalCents += unit * c.qty;
    g.items += c.qty;
  });
  for (const g of groups.values()) {
    const q = quote(g.key, g.subtotalCents, g.items);
    g.postage = q;
    g.shippingCents = q.cents;
    g.freeShipping = q.cents === 0;
    g.topUpCents = topUp(q, g.subtotalCents);
  }
  const storeGroups = [...groups.values()].sort((a, b) => b.subtotalCents - a.subtotalCents);
  const itemsCents = storeGroups.reduce((s, g) => s + g.subtotalCents, 0);
  const shippingCents = storeGroups.reduce((s, g) => s + g.shippingCents, 0);
  const topUpCents = storeGroups.reduce((s, g) => s + g.topUpCents, 0);
  const totalCents = itemsCents + shippingCents + topUpCents;

  return {
    stores: storeGroups,
    itemsCents,
    shippingCents,
    topUpCents,
    totalCents,
    storeCount: storeGroups.length,
    naiveTotalCents: naiveTotal,
    naiveStoreCount,
    savedCents: Math.max(0, naiveTotal - totalCents),
    unbuyable,
    excludedStores: [...excluded.values()],
    matchedCards: buyable.length,
  };
}
