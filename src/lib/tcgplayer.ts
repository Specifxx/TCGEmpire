// TCGplayer as a US price source.
//
// TCGplayer is the dominant US marketplace, so its prices belong in the US
// comparison. We deliberately use each product's MARKET PRICE (the algorithmic
// fair-market value for English/NM), NOT the lowest listing — the cheapest
// listing is frequently a different-language card and badly misrepresents the
// real price. Market price is the number TCGplayer itself headlines.
//
// Data comes from TCGplayer's public search API (the same endpoint the website
// uses). Products are matched to our cards by collector number + set, reusing
// the importer's exact numKey/setFromTotal logic so a Signature/alt-art print is
// never collapsed onto its base card.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";
const PRODUCT_LINE = "riftbound-league-of-legends-trading-card-game";
const PAGE_SIZE = 50;

// Mirror of price-import.ts numKey: strip leading zeros, lowercase any letter
// suffix, and mark a Signature print ("*") with a trailing "s" so 223*/221 and
// 223/221 stay distinct.
function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  return seg.includes("*") ? `${base}s` : base;
}

// Set code from the "/NNN" denominator (authoritative, prevents cross-set bleed).
function setFromTotal(total?: string): string | null {
  switch (parseInt(total ?? "", 10)) {
    case 298: return "OGN";
    case 221: return "SFD";
    case 219: return "UNL";
    case 24: return "OGS";
    default: return null;
  }
}

export type TcgProduct = {
  productId: number;
  productName: string;
  productUrlName: string;
  setUrlName: string;
  productLineUrlName: string;
  setName: string;
  marketPrice: number | null;
  lowestPrice: number | null;
  foilOnly: boolean;
  sealed: boolean;
  customAttributes?: { number?: string };
};

function searchBody(from: number, productTypeName?: string[]) {
  const term: Record<string, string[]> = { productLineName: [PRODUCT_LINE] };
  if (productTypeName) term.productTypeName = productTypeName;
  return {
    algorithm: "sales_synonym_v2",
    from,
    size: PAGE_SIZE,
    filters: { term, range: {}, match: {} },
    listingSearch: {
      context: { cart: {} },
      filters: { term: { sellerStatus: "Live", channelId: 0 }, range: { quantity: { gte: 1 } }, exclude: { channelExclusion: 0 } },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
    settings: { useFuzzySearch: true, didYouMean: {} },
    sort: {},
  };
}

async function fetchPage(from: number, productTypeName?: string[]): Promise<{ items: TcgProduct[]; total: number }> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.tcgplayer.com",
      Referer: "https://www.tcgplayer.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
    body: JSON.stringify(searchBody(from, productTypeName)),
  });
  if (!res.ok) throw new Error(`TCGplayer search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const r = data?.results?.[0];
  return { items: (r?.results ?? []) as TcgProduct[], total: r?.totalResults ?? 0 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch every Riftbound card product (paginated), excluding sealed products.
export async function fetchTcgplayerProducts(): Promise<TcgProduct[]> {
  const first = await fetchPage(0);
  const out: TcgProduct[] = [...first.items];
  for (let from = PAGE_SIZE; from < first.total; from += PAGE_SIZE) {
    await sleep(250);
    try {
      const pg = await fetchPage(from);
      if (pg.items.length === 0) break;
      out.push(...pg.items);
    } catch (e) {
      console.warn(`TCGplayer page from=${from} failed:`, (e as Error).message);
      break;
    }
  }
  return out.filter((p) => !p.sealed);
}

// Fetch the SEALED product catalogue (booster boxes/cases, packs, Champion Decks,
// Nexus Night promo packs, Pre-Rift kits, …) — a separate product type from cards.
export async function fetchTcgplayerSealed(): Promise<TcgProduct[]> {
  const PT = ["Sealed Products"];
  const first = await fetchPage(0, PT);
  const out: TcgProduct[] = [...first.items];
  for (let from = PAGE_SIZE; from < first.total; from += PAGE_SIZE) {
    await sleep(250);
    try {
      const pg = await fetchPage(from, PT);
      if (pg.items.length === 0) break;
      out.push(...pg.items);
    } catch (e) {
      console.warn(`TCGplayer sealed page from=${from} failed:`, (e as Error).message);
      break;
    }
  }
  return out;
}

export function tcgProductUrl(p: TcgProduct): string {
  const slug = `${p.productLineUrlName ?? "riftbound-league-of-legends-trading-card-game"}-${p.setUrlName ?? ""}-${p.productUrlName ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.tcgplayer.com/product/${p.productId}/${slug}`;
}

// TCGplayer product image CDN.
export function tcgImageUrl(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
}

export type TcgMatchResult = {
  total: number;
  matched: number;
  rows: Prisma.RetailerPriceCreateManyInput[];
  unmatchedSamples: string[];
};

// TCGplayer is a US marketplace priced in USD. We surface it as a source in both the
// US market (as-is) and the UK market (converted to GBP — the user explicitly wants
// TCGplayer there). UK rows use a separate retailer key so they never collide with US
// rows on the unique [cardId, retailer, condition, isFoil] key.
export interface TcgMarket {
  retailer: string;
  country: string;
  currency: string;
  fx: number; // multiplier applied to the USD market price
}
// Approximate USD→GBP rate for the UK conversion. Refreshed periodically by hand;
// exact FX isn't critical for a "reference price" comparison.
export const USD_TO_GBP = 0.79;
export const TCG_US: TcgMarket = { retailer: "tcgplayer", country: "US", currency: "USD", fx: 1 };
export const TCG_UK: TcgMarket = { retailer: "tcgplayer_uk", country: "UK", currency: "GBP", fx: USD_TO_GBP };

// Match products to cards and build RetailerPrice rows (no DB writes — caller
// decides). Exported separately so a dry-run can inspect the match quality.
export async function buildTcgplayerRows(mkt: TcgMarket = TCG_US, products?: TcgProduct[]): Promise<TcgMatchResult> {
  const items = products ?? (await fetchTcgplayerProducts());
  const cards = await prisma.card.findMany({ select: { id: true, collectorNumber: true } });
  const byKey = new Map<string, string>();
  for (const c of cards) {
    const [num, total] = c.collectorNumber.split("/");
    const sc = setFromTotal(total);
    if (!sc) continue;
    byKey.set(`${sc}|${numKey(num)}`, c.id);
  }

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  const seen = new Set<string>();
  const unmatchedSamples: string[] = [];
  let matched = 0;

  for (const p of items) {
    const numStr = p.customAttributes?.number;
    const market = p.marketPrice;
    if (!numStr || market == null || market <= 0) continue;
    const [num, total] = numStr.split("/");
    const sc = setFromTotal(total);
    if (!sc) continue;
    const cardId = byKey.get(`${sc}|${numKey(num)}`);
    if (!cardId) {
      if (unmatchedSamples.length < 25) unmatchedSamples.push(`${p.productName} ${numStr} $${market}`);
      continue;
    }
    matched++;
    // foilOnly products are foil prints; everything else is the base/normal market.
    const isFoil = !!p.foilOnly;
    const dedupe = `${cardId}|${isFoil}`;
    if (seen.has(dedupe)) continue; // one row per card+printing (unique key)
    seen.add(dedupe);
    rows.push({
      cardId,
      retailer: mkt.retailer,
      retailerName: "TCGplayer",
      title: p.productName,
      url: tcgProductUrl(p),
      condition: "NM",
      isFoil,
      priceCents: Math.round(market * 100 * mkt.fx),
      currency: mkt.currency,
      country: mkt.country,
      inStock: true,
    });
  }
  return { total: items.length, matched, rows, unmatchedSamples };
}

// Replace all TCGplayer rows with a fresh pull, for both the US (USD) and UK (GBP)
// markets. Products are fetched ONCE and reused for both. Returns total rows written.
export async function refreshTcgplayerPrices(): Promise<number> {
  const products = await fetchTcgplayerProducts();
  let written = 0;
  for (const mkt of [TCG_US, TCG_UK]) {
    const { total, matched, rows, unmatchedSamples } = await buildTcgplayerRows(mkt, products);
    console.log(`TCGplayer ${mkt.country}: ${total} products, ${matched} matched, ${rows.length} rows.`);
    if (unmatchedSamples.length && mkt === TCG_US) {
      console.log(`TCGplayer unmatched (sample): ${unmatchedSamples.slice(0, 8).join(" | ")}`);
    }
    if (rows.length === 0) {
      console.warn(`TCGplayer ${mkt.country}: 0 rows built — keeping existing rows.`);
      continue;
    }
    await prisma.retailerPrice.deleteMany({ where: { retailer: mkt.retailer } });
    await prisma.retailerPrice.createMany({ data: rows });
    written += rows.length;
  }
  return written;
}
