// Arbitrage finder, Pricempire-style: pick which sources count as the BUY side and
// which count as the SELL side, then see the cards with the biggest gap. By default
// you buy from the cheapest tracked store and sell on eBay, but either side can be
// any combination of stores and/or eBay. eBay's ~final-value fee is only netted off
// when the winning SELL source is eBay (selling to a store has no marketplace fee).
//
// Egress-bounded: a few groupBy aggregates rank everything; per-listing detail
// (urls/names) is fetched only for the page being shown.
import { prisma } from "./db";
import type { Country } from "./country";
import { RETAILERS } from "./retailers";
import { cardTileSelect } from "./cards";
import type { CardTileData } from "@/components/CardTile";

export const EBAY_FEE = 0.13; // approx eBay final-value fee
const MIN_BUY_CENTS = 300;
const MIN_NET_CENTS = 100;

export type ArbSort = "profit" | "margin";

export interface ArbSource {
  key: string;
  name: string;
  isEbay: boolean;
}

// eBay retailer key per market (NZ has no eBay coverage).
const EBAY_KEY: Record<Country, string | null> = { AU: "ebay", NZ: null, US: "ebay_us", UK: "ebay_uk" };

// All selectable sources for a market: its tracked stores + eBay.
export function getArbSources(country: Country): ArbSource[] {
  const stores = Object.values(RETAILERS)
    .filter((r) => (r.country ?? "AU") === country)
    .map((r) => ({ key: r.key, name: r.name, isEbay: false }));
  const ek = EBAY_KEY[country];
  return ek ? [{ key: ek, name: "eBay", isEbay: true }, ...stores] : stores;
}

export interface ArbItem {
  card: CardTileData; // full tile data so the row can open the QuickView popup
  buyCents: number;
  buyStore: string;
  buyStoreName: string;
  buyUrl: string;
  sellCents: number; // gross sell price (cheapest on the sell side)
  sellName: string;
  sellUrl: string;
  sellIsEbay: boolean;
  netCents: number; // sell (less eBay fee if eBay) − buy
  marginPct: number;
}

export interface ArbPage {
  items: ArbItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

async function minByCard(country: Country, keys: string[]) {
  if (!keys.length) return new Map<string, number>();
  const rows = await prisma.retailerPrice.groupBy({
    by: ["cardId"],
    where: { country, inStock: true, retailer: { in: keys } },
    _min: { priceCents: true },
  });
  return new Map(rows.filter((r) => r._min.priceCents != null).map((r) => [r.cardId, r._min.priceCents!]));
}

// ── Cheapest-on-eBay deals ───────────────────────────────────────────────────────
// Cards where eBay is the cheapest place to BUY — its price beats every tracked
// store. A buyer's view (the inverse of the flipper arbitrage): grab it on eBay.
export type DealSort = "saving" | "pct";

export interface EbayDeal {
  card: CardTileData; // full tile data so the row can open the QuickView popup
  ebayCents: number;
  ebayUrl: string;
  storeCents: number; // cheapest store price (what you'd otherwise pay)
  storeName: string;
  savingCents: number; // storeCents − ebayCents
  savingPct: number;
}

export interface EbayDealPage {
  items: EbayDeal[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const DEAL_MIN_SAVING_CENTS = 50;
const DEAL_MIN_PRICE_CENTS = 100;

export async function getEbayCheapest(country: Country, sort: DealSort, page = 1, pageSize = 25): Promise<EbayDealPage> {
  try {
    const sources = getArbSources(country);
    const ebayKeys = sources.filter((s) => s.isEbay).map((s) => s.key);
    const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
    if (!ebayKeys.length) return { items: [], total: 0, page, pageSize, pageCount: 1 };

    const [ebayMin, storeMin] = await Promise.all([minByCard(country, ebayKeys), minByCard(country, storeKeys)]);

    type Row = { cardId: string; ebay: number; store: number; saving: number; pct: number };
    const rows: Row[] = [];
    for (const [cardId, ebay] of ebayMin) {
      const store = storeMin.get(cardId);
      if (store == null || ebay >= store) continue; // eBay must actually be cheapest
      if (ebay < DEAL_MIN_PRICE_CENTS) continue;
      const saving = store - ebay;
      if (saving < DEAL_MIN_SAVING_CENTS) continue;
      rows.push({ cardId, ebay, store, saving, pct: Math.round((saving / store) * 1000) / 10 });
    }
    rows.sort((a, b) => (sort === "pct" ? b.pct - a.pct || b.saving - a.saving : b.saving - a.saving || b.pct - a.pct));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
    const [cards, ebayListings, storeListings] = await Promise.all([
      prisma.card.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true },
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, retailer: { in: ebayKeys } },
        select: { cardId: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, retailer: { in: storeKeys } },
        select: { cardId: true, retailerName: true, priceCents: true },
        orderBy: { priceCents: "asc" },
      }),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));
    const bestEbay = new Map<string, (typeof ebayListings)[number]>();
    for (const l of ebayListings) if (!bestEbay.has(l.cardId)) bestEbay.set(l.cardId, l);
    const bestStore = new Map<string, (typeof storeListings)[number]>();
    for (const l of storeListings) if (!bestStore.has(l.cardId)) bestStore.set(l.cardId, l);

    const items = slice
      .map((r): EbayDeal | null => {
        const c = cardMap.get(r.cardId);
        const e = bestEbay.get(r.cardId);
        const s = bestStore.get(r.cardId);
        if (!c || !e || !s) return null;
        return {
          card: c,
          ebayCents: r.ebay, ebayUrl: e.url, storeCents: r.store, storeName: s.retailerName,
          savingCents: r.saving, savingPct: r.pct,
        };
      })
      .filter((x): x is EbayDeal => x !== null);

    return { items, total, page: p, pageSize, pageCount };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}

export async function getArbitrage(
  country: Country,
  opts: { buy: string[]; sell: string[]; sort: ArbSort; page?: number; pageSize?: number }
): Promise<ArbPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  try {
    const sources = getArbSources(country);
    const valid = new Set(sources.map((s) => s.key));
    const ebayKeys = new Set(sources.filter((s) => s.isEbay).map((s) => s.key));

    const buyKeys = opts.buy.filter((k) => valid.has(k));
    const sellKeys = opts.sell.filter((k) => valid.has(k));
    if (!buyKeys.length || !sellKeys.length) return { items: [], total: 0, page, pageSize, pageCount: 1 };

    const sellEbayKeys = sellKeys.filter((k) => ebayKeys.has(k));
    const sellStoreKeys = sellKeys.filter((k) => !ebayKeys.has(k));

    const [buyMin, sellEbayMin, sellStoreMin] = await Promise.all([
      minByCard(country, buyKeys),
      minByCard(country, sellEbayKeys),
      minByCard(country, sellStoreKeys),
    ]);

    type Row = { cardId: string; buy: number; sellGross: number; sellIsEbay: boolean; net: number; margin: number };
    const rows: Row[] = [];
    for (const [cardId, buy] of buyMin) {
      if (buy < MIN_BUY_CENTS) continue;
      const eg = sellEbayMin.get(cardId);
      const sg = sellStoreMin.get(cardId);
      // Best sell by NET (eBay nets less the fee; a store sells at face).
      let sellGross: number | null = null;
      let sellNet: number | null = null;
      let sellIsEbay = false;
      if (eg != null) {
        const net = Math.round(eg * (1 - EBAY_FEE));
        sellGross = eg;
        sellNet = net;
        sellIsEbay = true;
      }
      if (sg != null && (sellNet == null || sg > sellNet)) {
        sellGross = sg;
        sellNet = sg;
        sellIsEbay = false;
      }
      if (sellGross == null || sellNet == null) continue;
      const net = sellNet - buy;
      if (net < MIN_NET_CENTS) continue;
      rows.push({ cardId, buy, sellGross, sellIsEbay, net, margin: Math.round((net / buy) * 1000) / 10 });
    }
    rows.sort((a, b) => (opts.sort === "margin" ? b.margin - a.margin || b.net - a.net : b.net - a.net || b.margin - a.margin));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
    const sellKeysFor = (isEbay: boolean) => (isEbay ? sellEbayKeys : sellStoreKeys);
    const [cards, buyListings, sellListings] = await Promise.all([
      prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, retailer: { in: buyKeys } },
        select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, retailer: { in: sellKeys } },
        select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));
    const bestBuy = new Map<string, (typeof buyListings)[number]>();
    for (const l of buyListings) if (!bestBuy.has(l.cardId)) bestBuy.set(l.cardId, l);
    // Cheapest sell listing on the WINNING side (eBay vs store) per card.
    const bestSell = new Map<string, (typeof sellListings)[number]>();
    const winnerSide = new Map(slice.map((r) => [r.cardId, r.sellIsEbay]));
    for (const l of sellListings) {
      const wantEbay = winnerSide.get(l.cardId);
      const isEbayRow = ebayKeys.has(l.retailer);
      if (wantEbay !== isEbayRow) continue;
      if (!sellKeysFor(!!wantEbay).includes(l.retailer)) continue;
      if (!bestSell.has(l.cardId)) bestSell.set(l.cardId, l);
    }

    const items = slice
      .map((r): ArbItem | null => {
        const c = cardMap.get(r.cardId);
        const b = bestBuy.get(r.cardId);
        const s = bestSell.get(r.cardId);
        if (!c || !b || !s) return null;
        return {
          card: c,
          buyCents: r.buy, buyStore: b.retailer, buyStoreName: b.retailerName, buyUrl: b.url,
          sellCents: r.sellGross, sellName: s.retailerName, sellUrl: s.url, sellIsEbay: r.sellIsEbay,
          netCents: r.net, marginPct: r.margin,
        };
      })
      .filter((x): x is ArbItem => x !== null);

    return { items, total, page: p, pageSize, pageCount };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}
