// Imports SEALED / non-single Riftbound products (booster boxes, packs, Proving
// Grounds, bundles, …) from the same AU Shopify stores, into SealedListing. The
// singles importer (price-import.ts) deliberately skips these; this complements it.
import { prisma } from "./db";
import { RETAILER_LIST } from "./retailers";
import { isEbayEnabled, isEbayRateLimited, searchEbaySealed } from "./ebay";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

interface ShopifyImg { src?: string }
interface ShopifyVar { price: string; available: boolean }
interface ShopifyProd { title: string; handle: string; variants: ShopifyVar[]; images?: ShopifyImg[] }

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving\s*grounds|\bOGS\b/i, "OGS"],
  [/spirit\s*forged|\bSFD\b/i, "SFD"],
  [/unleashed|\bUNL\b/i, "UNL"],
  [/vendetta|\bVEN\b/i, "VEN"],
  [/origins|\bOGN\b/i, "OGN"],
];
const SET_NAMES: Record<string, string> = {
  OGN: "Origins", OGS: "Proving Grounds", SFD: "Spirit Forged", UNL: "Unleashed", VEN: "Vendetta",
};

// A sealed product title looks like one of these.
const SEALED_TITLE =
  /booster\s*box|booster\s*pack|booster\s*display|display\s*box|booster\s*bundle|\bbundle\b|elite|collector|gift\s*box|blister|proving\s*grounds|nexus|two[-\s]?player|starter\s*(deck|set)|precon|\bcase\b|mega\s*box|\btin\b|sealed/i;
// …but never these (singles / accessories / non-English slip through otherwise).
const SEALED_EXCLUDE =
  /\bsingle\b|playmat|sleeve|deck\s*box|binder|toploader|top\s*loader|dice|counter|token|card\s*\d|\/\d{2,3}\b|chinese|japanese|korean|simplified|traditional/i;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { ...UA, "Cache-Control": "no-cache" }, cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Discover ALL riftbound collections (including sealed-only ones, which the singles
// importer skips) so we can find boxes/packs wherever the store files them.
async function discoverCollections(base: string): Promise<string[]> {
  const handles = new Set<string>();
  const index = await fetchText(`${base}/sitemap.xml`);
  let sitemaps = index
    ? Array.from(index.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];
  for (const sm of sitemaps.slice(0, 8)) {
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (/riftbound/i.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) handles.add(h);
    }
  }
  return Array.from(handles);
}

async function fetchProducts(base: string, handle: string): Promise<ShopifyProd[]> {
  const all: ShopifyProd[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await fetchJson(`${base}/collections/${handle}/products.json?limit=250&page=${page}&_=${Date.now()}`);
    const products: ShopifyProd[] = data?.products ?? [];
    if (!products.length) break;
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}

function detectSet(title: string): string | null {
  return SET_FROM_TITLE.find(([re]) => re.test(title))?.[1] ?? null;
}

function sealedType(title: string): string {
  const t = title.toLowerCase();
  if (/proving\s*grounds/.test(t)) return "Proving Grounds";
  if (/nexus/.test(t)) return "Nexus Knights";
  if (/booster\s*box|display\s*box|booster\s*display|\bdisplay\b/.test(t)) return "Booster Box";
  if (/\bcase\b/.test(t)) return "Booster Case";
  if (/booster\s*bundle|\bbundle\b|gift/.test(t)) return "Bundle";
  if (/two[-\s]?player|starter|precon/.test(t)) return "Starter Set";
  if (/\btin\b/.test(t)) return "Tin";
  if (/booster\s*pack|\bpack\b|blister/.test(t)) return "Booster Pack";
  return "Sealed";
}

export async function importSealed(): Promise<number> {
  let count = 0;
  for (const store of RETAILER_LIST) {
    const handles = await discoverCollections(store.base);
    if (!handles.length) continue;

    const seen = new Set<string>();
    const rows = new Map<string, any>(); // groupKey+store -> row (cheapest per store/product)
    for (const handle of handles) {
      for (const p of await fetchProducts(store.base, handle)) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        const title = p.title ?? "";
        if (!SEALED_TITLE.test(title) || SEALED_EXCLUDE.test(title)) continue;
        const priced = p.variants.filter((v) => parseFloat(v.price) > 0);
        if (!priced.length) continue;
        const avail = priced.filter((v) => v.available);
        const inStock = avail.length > 0;
        const pool = inStock ? avail : priced;
        const priceCents = Math.round(Math.min(...pool.map((v) => parseFloat(v.price))) * 100);
        const setCode = detectSet(title);
        const type = sealedType(title);
        const groupKey = setCode ? `${setCode}|${type}` : title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
        const key = `${groupKey}|${store.key}`;
        const prev = rows.get(key);
        if (prev && (prev.inStock || !inStock) && prev.priceCents <= priceCents) continue;
        rows.set(key, {
          groupKey,
          title,
          productType: type,
          setCode,
          retailer: store.key,
          retailerName: store.name,
          priceCents,
          url: `${store.base}/products/${p.handle}`,
          imageUrl: p.images?.[0]?.src ?? null,
          inStock,
        });
      }
    }
    if (rows.size) {
      await prisma.sealedListing.deleteMany({ where: { retailer: store.key } });
      await prisma.sealedListing.createMany({ data: Array.from(rows.values()) });
      count += rows.size;
    }
  }

  // eBay AU prices for each sealed product (best-effort; skips when rate-limited).
  if (isEbayEnabled()) {
    const groups = await getSealedGroups();
    const ebayRows: any[] = [];
    for (const g of groups) {
      if (isEbayRateLimited()) break;
      const r = await searchEbaySealed(g.name, g.productType, g.setCode);
      if (!r) continue;
      ebayRows.push({
        groupKey: g.groupKey,
        title: r.title,
        productType: g.productType,
        setCode: g.setCode,
        retailer: "ebay",
        retailerName: "eBay",
        priceCents: r.priceCents,
        url: r.url,
        imageUrl: g.imageUrl,
        inStock: true,
      });
    }
    if (ebayRows.length > 0) {
      await prisma.sealedListing.deleteMany({ where: { retailer: "ebay" } });
      await prisma.sealedListing.createMany({ data: ebayRows });
      count += ebayRows.length;
    }
  }

  return count;
}

export interface SealedGroup {
  groupKey: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  storeCount: number;
  listings: {
    retailerName: string;
    priceCents: number;
    url: string;
    inStock: boolean;
  }[];
}

// Group all sealed listings by product for the /sealed page.
export async function getSealedGroups(): Promise<SealedGroup[]> {
  const rows = await prisma.sealedListing.findMany({ orderBy: { priceCents: "asc" } });
  const groups = new Map<string, SealedGroup>();
  for (const r of rows) {
    let g = groups.get(r.groupKey);
    if (!g) {
      const setName = r.setCode ? SET_NAMES[r.setCode] ?? r.setCode : null;
      const name = !setName
        ? r.title
        : setName === r.productType
        ? setName
        : `${setName} ${r.productType}`;
      g = {
        groupKey: r.groupKey,
        name,
        productType: r.productType,
        setCode: r.setCode,
        imageUrl: r.imageUrl,
        lowestPriceCents: null,
        storeCount: 0,
        listings: [],
      };
      groups.set(r.groupKey, g);
    }
    if (!g.imageUrl && r.imageUrl) g.imageUrl = r.imageUrl;
    g.listings.push({ retailerName: r.retailerName, priceCents: r.priceCents, url: r.url, inStock: r.inStock });
  }
  const out = Array.from(groups.values()).map((g) => {
    g.listings.sort((a, b) => a.priceCents - b.priceCents);
    const inStock = g.listings.filter((l) => l.inStock);
    // Headline price comes from IN-STOCK listings only (null = sold out everywhere).
    g.lowestPriceCents = inStock[0]?.priceCents ?? null;
    g.storeCount = new Set(inStock.map((l) => l.retailerName)).size;
    return g;
  });
  // Boxes/cases first, then by price.
  const order = ["Booster Box", "Booster Case", "Proving Grounds", "Starter Set", "Bundle", "Nexus Knights", "Booster Pack", "Tin", "Sealed"];
  out.sort((a, b) => {
    const oa = order.indexOf(a.productType);
    const ob = order.indexOf(b.productType);
    if (oa !== ob) return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob);
    return (a.lowestPriceCents ?? 9e9) - (b.lowestPriceCents ?? 9e9);
  });
  return out;
}
