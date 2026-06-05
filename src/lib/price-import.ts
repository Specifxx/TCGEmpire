// Reusable price-import engine. Pulls Riftbound singles from AU Shopify stores'
// public products.json feeds, matches them to cards, and writes RetailerPrice
// rows + Card.lowestPriceCents. Called by scripts/import-prices.ts (CLI) and the
// scheduled /api/cron/refresh-prices route.

import { prisma } from "./db";
import { RETAILER_LIST, RetailerInfo } from "./retailers";

interface ShopifyVariant { title: string; price: string; available: boolean }
interface ShopifyProduct { title: string; handle: string; variants: ShopifyVariant[] }

export interface ImportSummary {
  stores: { name: string; products: number; priced: number; matched: number; unmatched: number }[];
  totalMatched: number;
  totalUnmatched: number;
  cardsPriced: number;
}

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving grounds|\bOGS\b/i, "OGS"],
  [/spirit forged|\bSFD\b/i, "SFD"],
  [/unleashed|\bUNL\b/i, "UNL"],
  [/vengeance|\bVEN\b/i, "VEN"],
  [/origins|\bOGN\b/i, "OGN"],
];

// Set/condition/qualifier tokens to strip when isolating the card name.
const STOP =
  /\b(riftbound|proving grounds|spirit forged|unleashed|vengeance|origins|showcase|signature|overnumbered|foil|holo(foil)?|near mint|lightly played|moderately played|heavily played|damaged|main set|the game|tcg|single)\b/gi;

function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  return m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
}
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function cleanProductName(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(STOP, " ");
}
// Parse a collector number from any of: "(299*/298)", "(199/298)", "OGN-128/298".
function parseNumber(title: string): { setCode: string | null; key: string } | null {
  const pref = title.match(/\b([A-Z]{2,4})-(\d+)([a-z*]*)\s*\/\s*\d+/i);
  if (pref) return { setCode: pref[1].toUpperCase(), key: pref[2] + pref[3].replace(/\*/g, "").toLowerCase() };
  const bare = title.match(/\(?\s*(\d+)([a-z*]*)\s*\/\s*\d+\s*\)?/);
  if (bare) return { setCode: null, key: bare[1] + bare[2].replace(/\*/g, "").toLowerCase() };
  return null;
}

async function fetchCollection(store: RetailerInfo, handle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 RiftEmpireBot" } });
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = (await res.json()) as { products: ShopifyProduct[] };
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

export async function importPrices(): Promise<ImportSummary> {
  const cards = await prisma.card.findMany({
    select: { id: true, name: true, setCode: true, collectorNumber: true, rarity: true, variant: true },
  });

  const byNum = new Map<string, string[]>();
  const byNumAny = new Map<string, string[]>();
  const byName = new Map<string, typeof cards>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const c of cards) {
    const nk = numKey(c.collectorNumber.split("/")[0]);
    push(byNum, `${c.setCode}|${nk}`, c.id);
    push(byNumAny, nk, c.id);
    push(byName, nameKey(c.name), c);
  }

  function resolveCardId(p: ShopifyProduct): string | null {
    const t = p.title;
    const num = parseNumber(t);
    const setCode = num?.setCode ?? SET_FROM_TITLE.find(([re]) => re.test(t))?.[1] ?? "OGN";
    const isAlt = /showcase|signature|foil|overnumbered/i.test(t) || /\d+[a-z]\b/.test(num?.key ?? "");

    // 1) name match, disambiguated by number then variant.
    const cand = byName.get(nameKey(cleanProductName(t)));
    if (cand && cand.length) {
      if (cand.length === 1) return cand[0].id;
      if (num) {
        const exact = cand.find((c) => numKey(c.collectorNumber.split("/")[0]) === num.key);
        if (exact) return exact.id;
      }
      const v = cand.find((c) => (isAlt ? c.variant || c.rarity === "Showcase" : !c.variant && c.rarity !== "Showcase"));
      if (v) return v.id;
      return cand[0].id;
    }

    // 2) number-only match.
    if (num) {
      const setHit = byNum.get(`${setCode}|${num.key}`);
      if (setHit?.length === 1) return setHit[0];
      const anyHit = byNumAny.get(num.key);
      if (anyHit?.length === 1) return anyHit[0];
      if (setHit?.length) return setHit[0];
    }
    return null;
  }

  const summary: ImportSummary = { stores: [], totalMatched: 0, totalUnmatched: 0, cardsPriced: 0 };

  for (const store of RETAILER_LIST) {
    const products: ShopifyProduct[] = [];
    for (const handle of store.collections) {
      products.push(...(await fetchCollection(store, handle)));
    }
    if (!products.length) {
      summary.stores.push({ name: store.name, products: 0, priced: 0, matched: 0, unmatched: 0 });
      continue;
    }

    await prisma.retailerPrice.deleteMany({ where: { retailer: store.key } });

    const rows = new Map<string, any>();
    let matched = 0;
    let unmatched = 0;
    for (const p of products) {
      const cardId = resolveCardId(p);
      if (!cardId) { unmatched++; continue; }
      matched++;
      const variants = p.variants.filter((v) => parseFloat(v.price) > 0);
      if (!variants.length) continue;
      const avail = variants.filter((v) => v.available);
      const pool = avail.length ? avail : variants;
      const best = pool.reduce((a, b) => (parseFloat(a.price) <= parseFloat(b.price) ? a : b));
      const priceCents = Math.round(parseFloat(best.price) * 100);
      const prev = rows.get(cardId);
      if (prev && prev.priceCents <= priceCents) continue;
      rows.set(cardId, {
        cardId,
        retailer: store.key,
        retailerName: store.name,
        title: p.title,
        url: `${store.base}/products/${p.handle}`,
        condition: best.title && best.title !== "Default Title" ? best.title : null,
        isFoil: /foil/i.test(p.title),
        priceCents,
        currency: "AUD",
        inStock: avail.length > 0,
      });
    }
    await prisma.retailerPrice.createMany({ data: Array.from(rows.values()) });
    summary.stores.push({ name: store.name, products: products.length, priced: rows.size, matched, unmatched });
    summary.totalMatched += matched;
    summary.totalUnmatched += unmatched;
  }

  // Recompute each card's lowest live price (prefer in-stock).
  const priced = await prisma.retailerPrice.groupBy({ by: ["cardId"], _min: { priceCents: true } });
  await prisma.card.updateMany({ data: { lowestPriceCents: null } });
  for (const row of priced) {
    const inStockMin = await prisma.retailerPrice.aggregate({
      where: { cardId: row.cardId, inStock: true },
      _min: { priceCents: true },
    });
    const lowest = inStockMin._min.priceCents ?? row._min.priceCents ?? null;
    await prisma.card.update({ where: { id: row.cardId }, data: { lowestPriceCents: lowest } });
  }
  summary.cardsPriced = priced.length;
  return summary;
}
