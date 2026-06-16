// Arbitrage finder: cards you can BUY cheap from a tracked store and SELL on eBay
// for a profit. For each card in a market we take the cheapest in-stock STORE price
// (the buy) and the cheapest eBay price (the achievable sell — you'd undercut it),
// then net off eBay's ~final-value fee. A free flipper tool.
//
// Egress-bounded: two groupBy aggregates (one row per card) rank everything;
// per-listing detail (urls/store name) is only fetched for the page being shown.
import { prisma } from "./db";
import type { Country } from "./country";

// Approximate eBay final-value fee (managed payments). Varies by category/market;
// ~13% is a fair single-number estimate, surfaced as such in the UI.
export const EBAY_FEE = 0.13;
const MIN_BUY_CENTS = 300; // ignore sub-$3 buys (bulk / noise)
const MIN_NET_CENTS = 100; // need ≥ $1 net profit to be worth listing

export type ArbSort = "profit" | "margin";

export interface ArbItem {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  buyCents: number;
  buyStore: string;
  buyStoreName: string;
  buyUrl: string;
  sellCents: number; // cheapest current eBay price
  sellUrl: string;
  grossCents: number; // sell − buy (before fees)
  netCents: number; // sell×(1−fee) − buy
  marginPct: number; // net ÷ buy
}

export interface ArbPage {
  items: ArbItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const isEbay = { retailer: { startsWith: "ebay" } };

export async function getArbitrage(country: Country, sort: ArbSort, page = 1, pageSize = 25): Promise<ArbPage> {
  try {
    const [storeLows, ebayLows] = await Promise.all([
      prisma.retailerPrice.groupBy({ by: ["cardId"], where: { country, inStock: true, NOT: isEbay }, _min: { priceCents: true } }),
      prisma.retailerPrice.groupBy({ by: ["cardId"], where: { country, inStock: true, ...isEbay }, _min: { priceCents: true } }),
    ]);
    const ebayMap = new Map(ebayLows.map((r) => [r.cardId, r._min.priceCents ?? null]));

    type Row = { cardId: string; buy: number; sell: number; gross: number; net: number; margin: number };
    const rows: Row[] = [];
    for (const s of storeLows) {
      const buy = s._min.priceCents;
      const sell = ebayMap.get(s.cardId) ?? null;
      if (buy == null || sell == null || buy < MIN_BUY_CENTS) continue;
      const net = Math.round(sell * (1 - EBAY_FEE)) - buy;
      if (net < MIN_NET_CENTS) continue;
      rows.push({ cardId: s.cardId, buy, sell, gross: sell - buy, net, margin: Math.round((net / buy) * 1000) / 10 });
    }
    rows.sort((a, b) => (sort === "margin" ? b.margin - a.margin || b.net - a.net : b.net - a.net || b.margin - a.margin));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
    const [cards, storeListings, ebayListings] = await Promise.all([
      prisma.card.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true },
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, NOT: isEbay },
        select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, ...isEbay },
        select: { cardId: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const bestStore = new Map<string, (typeof storeListings)[number]>();
    for (const l of storeListings) if (!bestStore.has(l.cardId)) bestStore.set(l.cardId, l); // first = cheapest
    const bestEbay = new Map<string, (typeof ebayListings)[number]>();
    for (const l of ebayListings) if (!bestEbay.has(l.cardId)) bestEbay.set(l.cardId, l);

    const items = slice
      .map((r): ArbItem | null => {
        const c = cardMap.get(r.cardId);
        const st = bestStore.get(r.cardId);
        const eb = bestEbay.get(r.cardId);
        if (!c || !st || !eb) return null;
        return {
          id: c.id, name: c.name, slug: c.slug, setCode: c.setCode, collectorNumber: c.collectorNumber, imageThumbUrl: c.imageThumbUrl,
          buyCents: r.buy, buyStore: st.retailer, buyStoreName: st.retailerName, buyUrl: st.url,
          sellCents: r.sell, sellUrl: eb.url,
          grossCents: r.gross, netCents: r.net, marginPct: r.margin,
        };
      })
      .filter((x): x is ArbItem => x !== null);

    return { items, total, page: p, pageSize, pageCount };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}
