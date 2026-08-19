// Arbitrage finder, Pricempire-style: pick which sources count as the BUY side and
// which count as the SELL side, then see the cards with the biggest gap. By default
// you buy from the cheapest tracked store and sell on eBay, but either side can be
// any combination of stores and/or eBay. eBay's ~final-value fee is only netted off
// when the winning SELL source is eBay (selling to a store has no marketplace fee).
//
// Egress-bounded: a few groupBy aggregates rank everything; per-listing detail
// (urls/names) is fetched only for the page being shown. The two exceptions
// (all of one market's eBay rows, all of TCGplayer's US rows — needed to rank by
// delivered cost, which the DB can't compute in a groupBy) are memoized in
// process memory below, same pattern as lib/sealed-import.ts's getSealedGroups —
// a per-request unbounded pull is exactly what has burned through this project's
// Neon free-tier transfer allowance before.
import { prisma } from "./db";
import { COUNTRY_LIST, currencyOf, pickPrice, type Country } from "./country";
import { RETAILERS } from "./retailers";
import { affiliateUrl } from "./affiliate";
import { cardTileSelect } from "./cards";
import { TCG_US } from "./tcgplayer";
import { usdCentsToCountry, convertCents } from "./fx";
import { MARKETPLACE_RETAILER, MARKETPLACE_PUBLIC } from "./marketplace";
import { MARKETPLACE_FEE_BPS } from "./marketplace-policy";
import { TCGPLAYER_SG_RETAILER, TCGPLAYER_UK_RETAILER } from "./constants";
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

// One in-memory pull per (country, eBay retailer) per TTL, not per request —
// see the file header comment. Same globalThis pattern as getSealedGroups so it
// survives hot-module-reload in dev and is shared across warm lambda invocations.
const ARB_MEMO_TTL_MS = 15 * 60_000;
type EbayRow = { cardId: string; priceCents: number; shippingCents: number | null; url: string };
type EbayRowsMemo = Map<string, { at: number; data: EbayRow[] }>;
const ebayRowsMemo: EbayRowsMemo = ((globalThis as unknown as { __arbEbayRows?: EbayRowsMemo }).__arbEbayRows ??= new Map());

async function getEbayRowsMemoized(country: Country, ebayKey: string): Promise<EbayRow[]> {
  const cacheKey = `${country}:${ebayKey}`;
  const hit = ebayRowsMemo.get(cacheKey);
  if (hit && Date.now() - hit.at < ARB_MEMO_TTL_MS) return hit.data;
  const rows = await prisma.retailerPrice.findMany({
    where: { country, inStock: true, retailer: ebayKey },
    select: { cardId: true, priceCents: true, shippingCents: true, url: true },
  });
  ebayRowsMemo.set(cacheKey, { at: Date.now(), data: rows });
  return rows;
}

// TCGplayer's US reference rows are market-neutral (one price per card regardless
// of the viewer's country), so this is a single global slot, not keyed by country.
type TcgRow = { cardId: string; priceCents: number; url: string };
type TcgRowsMemo = { at: number; data: TcgRow[] } | undefined;
async function getTcgUsRowsMemoized(): Promise<TcgRow[]> {
  const slot = globalThis as unknown as { __arbTcgRows?: TcgRowsMemo };
  const hit = slot.__arbTcgRows;
  if (hit && Date.now() - hit.at < ARB_MEMO_TTL_MS) return hit.data;
  const rows = await prisma.retailerPrice.findMany({
    where: { retailer: TCG_US.retailer, inStock: true },
    select: { cardId: true, priceCents: true, url: true },
  });
  slot.__arbTcgRows = { at: Date.now(), data: rows };
  return rows;
}

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
const EBAY_KEY: Record<Country, string | null> = { AU: "ebay", NZ: null, US: "ebay_us", UK: "ebay_uk", SG: "ebay_sg", CA: "ebay_ca" };
// TCGplayer retailer key per market — the same converted-reference rows used as a
// fallback in the main price comparison (see UK_FALLBACK_RETAILERS / SG_FALLBACK_RETAILERS)
// double as a real, always-available BUY source here. Excluded for AU on purpose:
// unlike UK/SG (where it fills a genuine coverage gap), AU already has plenty of
// real tracked stores, so a converted reference price would just add noise rather
// than a real opportunity. NZ has no TCGplayer row at all, so it has none either.
export const TCGPLAYER_KEY: Record<Country, string | null> = {
  AU: null,
  NZ: null,
  US: TCG_US.retailer,
  UK: TCGPLAYER_UK_RETAILER,
  SG: TCGPLAYER_SG_RETAILER,
  // CA's arbitrage uses real CA store rows + eBay CA only. NOT because the row is
  // missing — tcgplayer_ca exists and refreshTcgplayerPrices() writes it (that
  // claim was stale here and had already caused a real bug: price-import.ts
  // believed it too and let the converted row set lowestPriceCentsCa) — but
  // because switching it on changes what the Deal Finder recommends to Canadian
  // users, which is a product call rather than a correctness one. Flip this to
  // TCGPLAYER_CA_RETAILER when that call is made; nothing else stands in the way.
  CA: null,
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
// listing, compare a buy price against TCGplayer's own US MARKET price
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

    // eBay gives a REAL per-listing shipping figure (see effectiveShippingCents in
    // lib/retailers.ts), so when eBay is among the buy sources it's ranked by
    // DELIVERED cost (item + actual shipping, 0 if the seller states free post) —
    // otherwise a cheap item price hiding expensive postage would look like a
    // bigger "underpriced" gap than it really is. Stores stay item-price-only:
    // their shipping is usually unknown until checkout, and we never fabricate a
    // number for them (same reasoning as effectiveShippingCents itself). This means
    // buyMin can't be one simple groupBy — eBay needs its own per-listing pass.
    const ebayKey = EBAY_KEY[country];
    const buyEbayKey = ebayKey && buyKeys.includes(ebayKey) ? ebayKey : null;
    const storeKeys = buyKeys.filter((k) => k !== buyEbayKey);

    const [storeMin, ebayRows, tcgRows] = await Promise.all([
      minByCard(country, storeKeys),
      buyEbayKey ? getEbayRowsMemoized(country, buyEbayKey) : Promise.resolve([]),
      getTcgUsRowsMemoized(),
    ]);
    const tcgByCard = new Map(tcgRows.map((r) => [r.cardId, r]));

    // Cheapest DELIVERED eBay listing per card, and which listing achieved it — we
    // can't ask the DB to rank by a computed item+shipping sum, so this is a small
    // in-memory reduction over one market's eBay rows.
    const ebayDeliveredMin = new Map<string, { cents: number; url: string }>();
    for (const r of ebayRows) {
      const delivered = r.priceCents + (r.shippingCents ?? 0);
      const prev = ebayDeliveredMin.get(r.cardId);
      if (!prev || delivered < prev.cents) ebayDeliveredMin.set(r.cardId, { cents: delivered, url: r.url });
    }

    type Row = { cardId: string; buy: number; buyIsEbay: boolean; sellGross: number; net: number; margin: number };
    const rows: Row[] = [];
    const cardIds = new Set([...storeMin.keys(), ...ebayDeliveredMin.keys()]);
    for (const cardId of cardIds) {
      const storeBuy = storeMin.get(cardId);
      const ebayBuy = ebayDeliveredMin.get(cardId)?.cents;
      let buy: number;
      let buyIsEbay: boolean;
      if (storeBuy != null && (ebayBuy == null || storeBuy <= ebayBuy)) {
        buy = storeBuy;
        buyIsEbay = false;
      } else if (ebayBuy != null) {
        buy = ebayBuy;
        buyIsEbay = true;
      } else {
        continue;
      }
      if (buy < MIN_BUY_CENTS) continue;
      const tcg = tcgByCard.get(cardId);
      if (!tcg) continue;
      const sellGross = usdCentsToCountry(tcg.priceCents, country);
      const net = sellGross - buy; // reference price — no marketplace fee modelled
      if (net < MIN_NET_CENTS) continue;
      const margin = Math.round((net / buy) * 1000) / 10;
      if (margin > MAX_MARGIN_PCT) continue; // absurd flip margin = buy/sell mismatch, drop it
      rows.push({ cardId, buy, buyIsEbay, sellGross, net, margin });
    }
    rows.sort((a, b) => (opts.sort === "margin" ? b.margin - a.margin || b.net - a.net : b.net - a.net || b.margin - a.margin));

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);
    if (!slice.length) return { items: [], total, page: p, pageSize, pageCount };

    const ids = slice.map((r) => r.cardId);
    const storeWinnerIds = slice.filter((r) => !r.buyIsEbay).map((r) => r.cardId);
    const [cards, storeListings] = await Promise.all([
      prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) }),
      storeWinnerIds.length
        ? prisma.retailerPrice.findMany({
            where: { cardId: { in: storeWinnerIds }, country, inStock: true, retailer: { in: storeKeys } },
            select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
            orderBy: { priceCents: "asc" },
          })
        : Promise.resolve([]),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));
    const bestStore = new Map<string, (typeof storeListings)[number]>();
    for (const l of storeListings) if (!bestStore.has(l.cardId)) bestStore.set(l.cardId, l);

    const items = slice
      .map((r): ArbItem | null => {
        const c = cardMap.get(r.cardId);
        const tcg = tcgByCard.get(r.cardId);
        if (!c || !tcg) return null;
        let buyStore: string, buyStoreName: string, buyUrl: string;
        if (r.buyIsEbay) {
          const e = ebayDeliveredMin.get(r.cardId);
          if (!e || !buyEbayKey) return null;
          buyStore = buyEbayKey;
          buyStoreName = "eBay (delivered)";
          buyUrl = affiliateUrl(e.url, buyEbayKey);
        } else {
          const b = bestStore.get(r.cardId);
          if (!b) return null;
          buyStore = b.retailer;
          buyStoreName = b.retailerName;
          buyUrl = affiliateUrl(b.url, b.retailer);
        }
        return {
          card: c,
          buyCents: r.buy, buyStore, buyStoreName, buyUrl,
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

// ── Cross-region price gaps ──────────────────────────────────────────────────
// Where the SAME card is priced meaningfully cheaper in another tracked market
// than the viewer's own. Deliberately INFORMATIONAL, not a buy/sell execution
// flow like the arbitrage functions above — acting on it means actually
// shipping cross-border, and this models none of that (international postage
// cost/time, customs, and whether the away market's stores will even ship
// overseas are all real, unmodelled costs; see the disclaimer in the page
// copy). Reuses the per-country lowestPriceCents* columns already sitting on
// every Card row, so unlike getArbitrage above this needs no RetailerPrice
// scan and no memoization — one Card query, one in-memory pass.
export interface CrossRegionGap {
  card: CardTileData;
  homeCents: number;
  homeCurrency: string;
  homeCountry: Country;
  awayCountry: Country;
  awayCurrency: string; // the away market's OWN currency
  awayCentsNative: number; // in awayCurrency — what it's actually listed at
  awayCentsConverted: number; // converted into homeCurrency, for the gap math
  gapPct: number;
}

export interface CrossRegionPage {
  items: CrossRegionGap[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const XREGION_MIN_HOME_CENTS = 300; // same floor as MIN_BUY_CENTS — ignore near-zero prices
const XREGION_MIN_GAP_PCT = 20; // has to be a meaningful gap to be worth surfacing at all
const XREGION_MAX_GAP_PCT = 300; // same outlier-guard reasoning as MAX_MARGIN_PCT — a huge gap is
// almost always a converted reference price or a thin/stale market, not a real 300%+ difference.

export async function getCrossRegionGaps(homeCountry: Country, page = 1, pageSize = 25): Promise<CrossRegionPage> {
  try {
    const homeCurrency = currencyOf(homeCountry);
    const cards = await prisma.card.findMany({
      where: { variant: null, isPromo: false },
      select: cardTileSelect(homeCountry),
    });

    type Row = { card: CardTileData; homeCents: number; away: Country; awayNative: number; awayConverted: number; pct: number };
    const rows: Row[] = [];
    for (const c of cards as unknown as CardTileData[]) {
      const homeCents = pickPrice(c, homeCountry);
      if (homeCents == null || homeCents < XREGION_MIN_HOME_CENTS) continue;

      let best: { native: number; converted: number; country: Country; pct: number } | null = null;
      for (const info of COUNTRY_LIST) {
        if (info.code === homeCountry) continue;
        const awayNative = pickPrice(c, info.code);
        if (awayNative == null) continue;
        const awayConverted = convertCents(awayNative, info.currency, homeCurrency);
        if (awayConverted >= homeCents) continue;
        const pct = Math.round(((homeCents - awayConverted) / homeCents) * 1000) / 10;
        if (pct < XREGION_MIN_GAP_PCT || pct > XREGION_MAX_GAP_PCT) continue;
        if (!best || pct > best.pct) best = { native: awayNative, converted: awayConverted, country: info.code, pct };
      }
      if (!best) continue;
      rows.push({ card: c, homeCents, away: best.country, awayNative: best.native, awayConverted: best.converted, pct: best.pct });
    }
    rows.sort((a, b) => b.pct - a.pct);

    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const slice = rows.slice((p - 1) * pageSize, p * pageSize);

    return {
      items: slice.map((r) => ({
        card: r.card,
        homeCents: r.homeCents,
        homeCurrency,
        homeCountry,
        awayCountry: r.away,
        awayCurrency: currencyOf(r.away),
        awayCentsNative: r.awayNative,
        awayCentsConverted: r.awayConverted,
        gapPct: r.pct,
      })),
      total,
      page: p,
      pageSize,
      pageCount,
    };
  } catch {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
}
