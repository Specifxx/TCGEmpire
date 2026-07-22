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
import { affiliateUrl } from "./affiliate";
import { cardTileSelect } from "./cards";
import { TCG_US } from "./tcgplayer";
import { usdCentsToCountry } from "./fx";
import { MARKETPLACE_RETAILER, MARKETPLACE_PUBLIC } from "./marketplace";
import { MARKETPLACE_FEE_BPS } from "./marketplace-policy";
import { TCGPLAYER_AU_RETAILER, TCGPLAYER_SG_RETAILER, TCGPLAYER_UK_RETAILER } from "./constants";
import type { CardTileData } from "@/components/CardTile";

export const EBAY_FEE = 0.13; // approx eBay final-value fee
const MIN_BUY_CENTS = 300;
const MIN_NET_CENTS = 100;
// Outlier guards. A flip margin this large means the buy and sell aren't the same
// product (e.g. a $9 Spindown die vs a $1,986 mispriced eBay listing) — bad data,
// not an 18,000% opportunity. Likewise a ≥80% "cheaper on eBay" saving is almost
// always a wrong/mismatched listing, not a real deal.
const MAX_MARGIN_PCT = 300;
const MAX_DEAL_PCT = 80;

export type ArbSort = "profit" | "margin";

export interface ArbSource {
  key: string;
  name: string;
  isEbay: boolean;
  // Cut taken when SELLING through this source (0 for a plain store — you sell
  // at face; eBay's final-value fee; RiftCompare Marketplace's platform fee).
  // Buying is always fee-free, so this only affects sell-side net calculations.
  feePct: number;
}

// eBay retailer key per market (NZ has no eBay coverage).
const EBAY_KEY: Record<Country, string | null> = { AU: "ebay", NZ: null, US: "ebay_us", UK: "ebay_uk", SG: "ebay_sg" };
// TCGplayer retailer key per market — the same converted-reference rows used as a
// fallback in the main price comparison (see AU_FALLBACK_RETAILERS / UK_FALLBACK_RETAILERS
// / SG_FALLBACK_RETAILERS) double as a real, always-available BUY source here. NZ has
// no TCGplayer row at all, so it's the only market without one.
export const TCGPLAYER_KEY: Record<Country, string | null> = {
  AU: TCGPLAYER_AU_RETAILER,
  NZ: null,
  US: TCG_US.retailer,
  UK: TCGPLAYER_UK_RETAILER,
  SG: TCGPLAYER_SG_RETAILER,
};
const MARKETPLACE_FEE_PCT = MARKETPLACE_FEE_BPS / 10000;

// All selectable sources for a market: its tracked stores + eBay + TCGplayer +
// (once launched) the RiftCompare Marketplace — the marketplace's own listings
// already feed into RetailerPrice (see importMarketplaceListings), so it's
// priced alongside every other store. Stores, the Marketplace, and TCGplayer are
// all BUY-side sources (bucketed in together via storeKeys in the page); eBay is
// the only one ever used as a resale/sell destination (TCGplayer's own flip view
// treats it as a fixed reference instead — see getArbitrageVsTcgplayer).
export function getArbSources(country: Country): ArbSource[] {
  const stores = Object.values(RETAILERS)
    .filter((r) => (r.country ?? "AU") === country)
    .map((r) => ({ key: r.key, name: r.name, isEbay: false, feePct: 0 }));
  const ek = EBAY_KEY[country];
  const sources = ek ? [{ key: ek, name: "eBay", isEbay: true, feePct: EBAY_FEE }, ...stores] : stores;
  const mpKey = MARKETPLACE_PUBLIC ? MARKETPLACE_RETAILER[country] : undefined;
  if (mpKey) sources.unshift({ key: mpKey, name: "RiftCompare Marketplace", isEbay: false, feePct: MARKETPLACE_FEE_PCT });
  const tcgKey = TCGPLAYER_KEY[country];
  if (tcgKey) sources.push({ key: tcgKey, name: "TCGplayer", isEbay: false, feePct: 0 });
  return sources;
}

export interface ArbItem {
  card: CardTileData; // full tile data so the row can open the QuickView popup
  buyCents: number;
  buyStore: string;
  buyStoreName: string;
  buyUrl: string;
  sellCents: number; // gross sell price (cheapest NET on the sell side)
  sellName: string;
  sellUrl: string;
  sellRetailer: string; // the winning sell source's retailer key (for click-tracking + labeling)
  netCents: number; // sell (less that source's fee) − buy
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

// Cheapest price PER (card, retailer) — used on the sell side, where different
// sources can carry different fees (store 0%, eBay ~13%, marketplace fee), so
// picking the best NET means comparing every source individually rather than
// just the single cheapest gross price across all of them combined.
async function minByCardAndRetailer(country: Country, keys: string[]) {
  const map = new Map<string, Map<string, number>>();
  if (!keys.length) return map;
  const rows = await prisma.retailerPrice.groupBy({
    by: ["cardId", "retailer"],
    where: { country, inStock: true, retailer: { in: keys } },
    _min: { priceCents: true },
  });
  for (const r of rows) {
    if (r._min.priceCents == null) continue;
    const inner = map.get(r.cardId) ?? new Map<string, number>();
    inner.set(r.retailer, r._min.priceCents);
    map.set(r.cardId, inner);
  }
  return map;
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
      const pct = Math.round((saving / store) * 1000) / 10;
      if (pct >= MAX_DEAL_PCT) continue; // ≥80% cheaper = mismatched/junk listing, not a deal
      rows.push({ cardId, ebay, store, saving, pct });
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
    const feeByKey = new Map(sources.map((s) => [s.key, s.feePct]));

    const buyKeys = opts.buy.filter((k) => valid.has(k));
    const sellKeys = opts.sell.filter((k) => valid.has(k));
    if (!buyKeys.length || !sellKeys.length) return { items: [], total: 0, page, pageSize, pageCount: 1 };

    const [buyMin, sellMinByRetailer] = await Promise.all([
      minByCard(country, buyKeys),
      minByCardAndRetailer(country, sellKeys),
    ]);

    type Row = { cardId: string; buy: number; sellGross: number; sellRetailer: string; net: number; margin: number };
    const rows: Row[] = [];
    for (const [cardId, buy] of buyMin) {
      if (buy < MIN_BUY_CENTS) continue;
      const perRetailer = sellMinByRetailer.get(cardId);
      if (!perRetailer) continue;
      // Best sell by NET across every selected sell source individually —
      // each can carry a different cut (store 0%, eBay ~13%, marketplace fee).
      let sellGross = -1;
      let sellNet = -Infinity;
      let sellRetailer = "";
      for (const [retailer, gross] of perRetailer) {
        const net = Math.round(gross * (1 - (feeByKey.get(retailer) ?? 0)));
        if (net > sellNet) {
          sellGross = gross;
          sellNet = net;
          sellRetailer = retailer;
        }
      }
      if (!sellRetailer) continue;
      const net = sellNet - buy;
      if (net < MIN_NET_CENTS) continue;
      const margin = Math.round((net / buy) * 1000) / 10;
      if (margin > MAX_MARGIN_PCT) continue; // absurd flip margin = buy/sell mismatch, drop it
      rows.push({ cardId, buy, sellGross, sellRetailer, net, margin });
    }
    rows.sort((a, b) => (opts.sort === "margin" ? b.margin - a.margin || b.net - a.net : b.net - a.net || b.margin - a.margin));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
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
    // The listing on the WINNING sell source (per card) — matched by retailer
    // key, not by a bucket, so any number of fee-bearing sources works.
    const bestSell = new Map<string, (typeof sellListings)[number]>();
    const winnerRetailer = new Map(slice.map((r) => [r.cardId, r.sellRetailer]));
    for (const l of sellListings) {
      if (winnerRetailer.get(l.cardId) !== l.retailer) continue;
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
          // Affiliate-tag both outbound links (eBay EPN / store network / n/a
          // for an internal marketplace URL, which affiliateUrl passes through
          // untouched) — rows can hold untagged URLs from before import-time
          // tagging existed.
          buyCents: r.buy, buyStore: b.retailer, buyStoreName: b.retailerName, buyUrl: affiliateUrl(b.url, b.retailer),
          sellCents: r.sellGross, sellName: s.retailerName, sellUrl: affiliateUrl(s.url, r.sellRetailer), sellRetailer: r.sellRetailer,
          netCents: r.net, marginPct: r.margin,
        };
      })
      .filter((x): x is ArbItem => x !== null);

    return { items, total, page: p, pageSize, pageCount };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}

// ── Worth more on TCGplayer (US market price, converted) ────────────────────────
// A second flip benchmark alongside eBay: instead of the cheapest current eBay
// listing, compare a store's buy price against TCGplayer's own US MARKET price
// (the algorithmic fair-value figure it headlines — see lib/tcgplayer.ts), converted
// from USD into the viewer's local currency via the shared fx table. This is a
// REFERENCE comparison, not a specific listing — TCGplayer only has one retailer row
// per card (US, in USD), so there's no "cheapest" to pick and no marketplace fee to
// net off (unlike eBay's ~13% final-value fee). Available in every market, including
// ones with no eBay coverage (e.g. NZ).
export async function getArbitrageVsTcgplayer(
  country: Country,
  opts: { buy: string[]; sort: ArbSort; page?: number; pageSize?: number }
): Promise<ArbPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  try {
    const sources = getArbSources(country);
    const valid = new Set(sources.map((s) => s.key));
    const buyKeys = opts.buy.filter((k) => valid.has(k));
    if (!buyKeys.length) return { items: [], total: 0, page, pageSize, pageCount: 1 };

    const [buyMin, tcgRows] = await Promise.all([
      minByCard(country, buyKeys),
      prisma.retailerPrice.findMany({
        where: { retailer: TCG_US.retailer, inStock: true },
        select: { cardId: true, priceCents: true, url: true },
      }),
    ]);
    const tcgByCard = new Map(tcgRows.map((r) => [r.cardId, r]));

    type Row = { cardId: string; buy: number; sellGross: number; net: number; margin: number };
    const rows: Row[] = [];
    for (const [cardId, buy] of buyMin) {
      if (buy < MIN_BUY_CENTS) continue;
      const tcg = tcgByCard.get(cardId);
      if (!tcg) continue;
      const sellGross = usdCentsToCountry(tcg.priceCents, country);
      const net = sellGross - buy; // reference price — no marketplace fee modelled
      if (net < MIN_NET_CENTS) continue;
      const margin = Math.round((net / buy) * 1000) / 10;
      if (margin > MAX_MARGIN_PCT) continue; // absurd flip margin = buy/sell mismatch, drop it
      rows.push({ cardId, buy, sellGross, net, margin });
    }
    rows.sort((a, b) => (opts.sort === "margin" ? b.margin - a.margin || b.net - a.net : b.net - a.net || b.margin - a.margin));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
    const [cards, buyListings] = await Promise.all([
      prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, country, inStock: true, retailer: { in: buyKeys } },
        select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
        orderBy: { priceCents: "asc" },
      }),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));
    const bestBuy = new Map<string, (typeof buyListings)[number]>();
    for (const l of buyListings) if (!bestBuy.has(l.cardId)) bestBuy.set(l.cardId, l);

    const items = slice
      .map((r): ArbItem | null => {
        const c = cardMap.get(r.cardId);
        const b = bestBuy.get(r.cardId);
        const tcg = tcgByCard.get(r.cardId);
        if (!c || !b || !tcg) return null;
        return {
          card: c,
          buyCents: r.buy, buyStore: b.retailer, buyStoreName: b.retailerName, buyUrl: affiliateUrl(b.url, b.retailer),
          sellCents: r.sellGross, sellName: "TCGplayer (US market, converted)", sellUrl: affiliateUrl(tcg.url, TCG_US.retailer), sellRetailer: TCG_US.retailer,
          netCents: r.net, marginPct: r.margin,
        };
      })
      .filter((x): x is ArbItem => x !== null);

    return { items, total, page: p, pageSize, pageCount };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}
