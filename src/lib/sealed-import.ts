// Imports SEALED / non-single Riftbound products (booster boxes, packs, Proving
// Grounds, bundles, …) from the same AU Shopify stores, into SealedListing. The
// singles importer (price-import.ts) deliberately skips these; this complements it.
import { prisma } from "./db";
import { RETAILER_LIST } from "./retailers";
import { isEbayEnabled, isEbayRateLimited, searchEbaySealed, primeEbayBudget, sealedFloorCents } from "./ebay";
import { fetchTcgplayerSealed, tcgProductUrl, tcgImageUrl, setCodeFromSetName } from "./tcgplayer";

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
  OGN: "Origins", OGS: "Proving Grounds", SFD: "Spiritforged", UNL: "Unleashed", VEN: "Vendetta",
};

// A sealed product must be identifiably RIFTBOUND. Other games slip in when a store
// files them under a shared/mismatched collection — e.g. Gundam "… [Starter Deck 06:
// Clan Unity]" matches "starter deck" — so we require an explicit Riftbound/League
// marker (set name, "Riftbound", "League of Legends", Proving Grounds, Nexus Night).
const RIFTBOUND_HINT =
  /riftbound|league\s*of\s*legends|proving\s*grounds|nexus\s*night|spirit\s*forged|spiritforged|\borigins\b|\bunleashed\b|\bvendetta\b|\b(?:OGN|OGS|SFD|UNL|VEN)\b/i;

// Sets that aren't released yet — never list their (pre-order) sealed products.
// Vendetta sealed IS available now (its singles are still pending — those are kept
// out separately by SEALED_EXCLUDE + the empty Card table), so only Radiance remains.
const UNRELEASED_SET = /\bradiance\b|\bRAD\b/i;

function isRiftboundSealed(title: string): boolean {
  return RIFTBOUND_HINT.test(title) && !UNRELEASED_SET.test(title);
}

// A sealed product title looks like one of these. "nexus night ... pack" (the real
// product is titled e.g. "Origins Nexus Night Promo Pack" — night, then an optional
// number/"promo", then "pack") — not bare "nexus night", which also matches a store
// listing an individual promo card pulled FROM a Nexus Night pack, e.g. "Stalwart
// Poro Promo Nexus Night 1" — that's a single card, not the sealed pack, and must
// never be scraped as sealed.
const SEALED_TITLE =
  /booster\s*box|booster\s*pack|booster\s*display|display\s*box|display\s*case|booster\s*bundle|\bbundle\b|box\s*set|champion\s*deck|pre-?rift|event\s*kit|elite|collector|gift\s*box|blister|proving\s*grounds|nexus\s*night\s*(?:\d+\s*)?(?:promo\s*)?pack|promo\s*pack|two[-\s]?player|starter\s*(deck|set)|precon|\bcase\b|mega\s*box|\btin\b|sealed/i;
// …but never these. Singles / accessories / bulk / break slots / non-English slip
// through otherwise. Condition codes (NM/LP/…) and a set name in parentheses
// (e.g. "(Origins: Proving Grounds)") are tell-tale signs of a single card.
const SEALED_EXCLUDE =
  /\bsingle\b|playmat|deck\s*box|binder|toploader|top\s*loader|dice|counter|\btoken\b|card\s*\d|\/\d{2,3}\b|chinese|japanese|korean|simplified|traditional|\bbulk\s+(?:lot|cards|commons?|singles?)\b|\bopened\b|live\s*break|\bticket\b|protector|acrylic|magnetic|\bempty\b|box\s*only|storage|\bstand\b|\bholder\b|divider|topper|\binsert\b|\b(?:nm|lp|mp|hp|dmg)\b|near\s*mint|lightly\s*played|moderately\s*played|heavily\s*played|\([^)]*\b(?:origins|spirit\s*forged|spiritforged|unleashed|vendetta|proving\s*grounds)\b[^)]*\)/i;

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

async function fetchProducts(base: string, handle: string, country: string): Promise<ShopifyProd[]> {
  const all: ShopifyProd[] = [];
  for (let page = 1; page <= 10; page++) {
    // country=XX forces the store's market price (Shopify Markets serves a different
    // price per country): AUD for AU stores, NZD for NZ stores.
    const data = await fetchJson(`${base}/collections/${handle}/products.json?limit=250&page=${page}&country=${country}&_=${Date.now()}`);
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

// Classify a sealed product into a specific type. Shared by store scraping and the
// TCGplayer catalogue so the same product groups together. Champion Decks keep the
// champion name so each is distinct (e.g. "Champion Deck (Viktor)").
// Champions that have Champion Decks (parens form on TCGplayer; free-form in store
// titles like "… Champion Deck - Vex" or "Jinx Champion Deck"). Longest names first
// so "Viktor"/"Vex" win before the short "Vi".
const CHAMPIONS = /\b(Lee\s*Sin|Viktor|Rumble|Fiora|Garen|Annie|Lux|Master\s*Yi|Jinx|Vex|Vi)\b/i;

export function classifySealed(title: string): string {
  const t = title.toLowerCase();
  const rawChamp = title.match(/champion\s*deck\s*\(([^)]+)\)/i)?.[1]?.trim() || title.match(CHAMPIONS)?.[1];
  const champ = rawChamp ? rawChamp.toLowerCase().replace(/\s+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : null;
  if (/proving\s*grounds/.test(t)) return /\bcase\b/.test(t) ? "Proving Grounds Case" : "Proving Grounds";
  if (/nexus\s*night\s*(?:\d+\s*)?(?:promo\s*)?pack/.test(t)) return "Nexus Night Pack";
  if (/champion\s*deck/.test(t)) { const n = champ ? ` (${champ})` : ""; return /\bdisplay\b/.test(t) ? `Champion Deck${n} Display` : `Champion Deck${n}`; }
  if (/sleeved\s*booster/.test(t)) return /\[set of|art\s*bundle/.test(t) ? "Sleeved Booster (Art Set)" : "Sleeved Booster";
  if (/(?:display|booster\s*box|sealed)\s*case|booster\s*display\s*case/.test(t)) return "Booster Case";
  if (/booster\s*box|booster\s*display|display\s*box|\bdisplay\b/.test(t)) return "Booster Box";
  if (/pre-?rift\s*event\s*kit/.test(t)) return "Pre-Rift Event Kit";
  if (/pre-?rift|event\s*kit|pre-?release\s*kit/.test(t)) return "Pre-Rift Kit";
  if (/bulk\s*runes/.test(t)) return /\bcase\b/.test(t) ? "Bulk Runes Case" : "Bulk Runes";
  if (/arcane\s*box\s*set|box\s*set/.test(t)) return "Box Set";
  if (/vault\s*bundle|worlds\s*bundle|booster\s*bundle|\bbundle\b|gift\s*box/.test(t)) return "Bundle";
  if (/two[-\s]?player|starter|precon/.test(t)) return "Starter Set";
  if (/\btin\b/.test(t)) return "Tin";
  if (/promo\s*pack/.test(t)) return "Promo Pack";
  if (/booster\s*pack|\bblister\b|\bpack\b/.test(t)) return "Booster Pack";
  return "Sealed";
}

// Map a TCGplayer setName to our set code (null for cross-set promo products).
// Canonical implementation lives in lib/tcgplayer.ts — imported, not re-declared,
// so the two can't drift apart when a new set is added.

export async function importSealed(): Promise<number> {
  let count = 0;
  for (const store of RETAILER_LIST) {
    const cc = store.country ?? "AU";
    // Auto-discover from the sitemap, but fall back to the store's configured
    // collections (some stores' sitemaps don't expose their collection handles —
    // this is why NZ sealed stores were being skipped). Mirrors price-import.ts.
    let handles = await discoverCollections(store.base);
    handles = Array.from(new Set([...handles, ...(store.collections ?? [])]));
    if (!handles.length) continue;

    const seen = new Set<string>();
    const rows = new Map<string, any>(); // groupKey+store -> row (cheapest per store/product)
    let scraped = false; // did we actually read products (vs an empty/failed fetch)?
    for (const handle of handles) {
      const products = await fetchProducts(store.base, handle, cc);
      if (products.length) scraped = true;
      for (const p of products) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        const title = p.title ?? "";
        if (!SEALED_TITLE.test(title) || SEALED_EXCLUDE.test(title)) continue;
        if (!isRiftboundSealed(title)) continue; // drop non-Riftbound + unreleased sets
        const priced = p.variants.filter((v) => parseFloat(v.price) > 0);
        if (!priced.length) continue;
        const avail = priced.filter((v) => v.available);
        const inStock = avail.length > 0;
        const pool = inStock ? avail : priced;
        const setCode = detectSet(title);
        const type = classifySealed(title);
        // Price-sanity: ignore variants priced implausibly low for the product type —
        // a $1 "deposit"/sample/add-on variant on a real Booster Case, or an outright
        // mis-listing. Taking the raw MIN across all variants otherwise surfaces e.g. a
        // $1.08 "Booster Case" at the top of the homepage's cheapest-sealed column.
        // If NO variant clears the per-type floor, the product is dropped entirely.
        const floor = sealedFloorCents(type);
        const inFloor = pool.filter((v) => Math.round(parseFloat(v.price) * 100) >= floor);
        if (!inFloor.length) continue;
        const priceCents = Math.round(Math.min(...inFloor.map((v) => parseFloat(v.price))) * 100);
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
          country: cc,
          inStock,
        });
      }
    }
    // Refresh when the scrape succeeded — this also CLEARS stale rows when a
    // previously mis-detected single no longer matches (rows.size can be 0). If
    // the fetch failed entirely (no products at all), keep the existing rows.
    if (scraped) {
      await prisma.sealedListing.deleteMany({ where: { retailer: store.key } });
      if (rows.size) await prisma.sealedListing.createMany({ data: Array.from(rows.values()) });
      count += rows.size;
    }
  }

  // eBay AU prices for each sealed product (best-effort; skips when rate-limited).
  // eBay is AU-only, so we seed/search against the AU groups.
  // Deploys (push) set EBAY_REFRESH=false so they never spend eBay quota; only
  // scheduled / manual runs search eBay (and even then, within the live budget).
  if (isEbayEnabled() && process.env.EBAY_REFRESH !== "false") {
    await primeEbayBudget(); // respect the live daily quota for sealed searches too
    const groups = await getSealedGroups("AU");
    // Always attempt eBay for the per-set promo (Nexus Night) packs — even ones no
    // AU store currently lists (e.g. the Unleashed pack) — so they appear once
    // available, with an image pulled from the eBay listing.
    const NEXUS_SEEDS = [
      { groupKey: "OGN|Nexus Night Pack", setCode: "OGN", name: "Origins Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
      { groupKey: "SFD|Nexus Night Pack", setCode: "SFD", name: "Spiritforged Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
      { groupKey: "UNL|Nexus Night Pack", setCode: "UNL", name: "Unleashed Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
    ];
    const haveKeys = new Set(groups.map((g) => g.groupKey));
    // Trusted reference = cheapest NON-eBay (store/TCGplayer) price for the product, so
    // the eBay search can reject listings priced implausibly below the real product.
    const trustedRef = (g: SealedGroup): number | null => {
      const nonEbay = g.listings.filter((l) => l.retailer !== "ebay").map((l) => l.priceCents);
      return nonEbay.length ? Math.min(...nonEbay) : null;
    };
    const searchList = [
      ...groups.map((g) => ({ groupKey: g.groupKey, setCode: g.setCode, name: g.name, productType: g.productType, imageUrl: g.imageUrl, referenceCents: trustedRef(g) })),
      ...NEXUS_SEEDS.filter((s) => !haveKeys.has(s.groupKey)).map((s) => ({ ...s, referenceCents: null as number | null })),
    ];
    const ebayRows: any[] = [];
    for (const g of searchList) {
      if (isEbayRateLimited()) break;
      const r = await searchEbaySealed(g.name, g.productType, g.setCode, g.referenceCents);
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
        imageUrl: r.imageUrl ?? g.imageUrl,
        country: "AU", // eBay is AU-only
        inStock: true,
      });
    }
    if (ebayRows.length > 0) {
      await prisma.sealedListing.deleteMany({ where: { retailer: "ebay" } });
      await prisma.sealedListing.createMany({ data: ebayRows });
      count += ebayRows.length;
    }
  }

  // TCGplayer's official sealed catalogue (US market prices) — adds products the
  // store scrape misses (Champion Decks, cases, sleeved boosters, Pre-Rift kits,
  // Nexus Night packs). Isolated so a hiccup never fails the rest.
  try {
    count += await refreshTcgplayerSealed();
  } catch (e) {
    console.warn("TCGplayer sealed import failed:", e);
  }

  // Self-heal: drop any stored rows that no longer qualify (e.g. a store that
  // failed to re-scrape this run still holds an old mis-detected single, or rows
  // from before the filters tightened).
  await cleanupStaleSealed();

  return count;
}

// Pull TCGplayer's official sealed catalogue (US market prices) into SealedListing.
// TCGplayer is the dominant US marketplace and lists the full sealed line-up
// (booster displays/cases, Champion Decks, Nexus Night packs, Pre-Rift kits,
// sleeved boosters), so this fills the gaps the store scrape misses for the US.
export async function refreshTcgplayerSealed(): Promise<number> {
  let products;
  try {
    products = await fetchTcgplayerSealed();
  } catch (e) {
    console.warn("TCGplayer sealed fetch failed:", (e as Error).message);
    return 0;
  }
  const rows: any[] = [];
  for (const p of products) {
    const title = (p.productName ?? "").trim();
    const market = p.marketPrice;
    if (!title || market == null || market <= 0) continue;
    if (UNRELEASED_SET.test(title)) continue; // Vendetta / Radiance not released yet
    const setCode = setCodeFromSetName(p.setName ?? "");
    if (setCode && UNRELEASED_SET.test(setCode)) continue;
    const type = classifySealed(title);
    const groupKey = setCode ? `${setCode}|${type}` : title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    rows.push({
      groupKey,
      title,
      productType: type,
      setCode,
      retailer: "tcgplayer",
      retailerName: "TCGplayer",
      priceCents: Math.round(market * 100),
      url: tcgProductUrl(p),
      imageUrl: tcgImageUrl(p.productId),
      country: "US",
      inStock: true,
    });
  }
  await prisma.sealedListing.deleteMany({ where: { retailer: "tcgplayer" } });
  if (rows.length) await prisma.sealedListing.createMany({ data: rows });
  console.log(`TCGplayer sealed: ${rows.length} products.`);
  return rows.length;
}

// Delete stored sealed rows whose title should now be excluded — independent of
// scraping, so stale data gets cleaned even when a store didn't refresh.
export async function cleanupStaleSealed(): Promise<number> {
  const rows = await prisma.sealedListing.findMany({
    select: { id: true, title: true, retailer: true, productType: true, groupKey: true, country: true, priceCents: true },
  });
  // Trusted reference per market+product: the cheapest NON-eBay (store/TCGplayer) price.
  const trusted = new Map<string, number>();
  for (const r of rows) {
    if (r.retailer === "ebay") continue;
    const k = `${r.country}|${r.groupKey}`;
    const cur = trusted.get(k);
    if (cur == null || r.priceCents < cur) trusted.set(k, r.priceCents);
  }
  const ids = rows
    .filter((r) => {
      // Title filters — TCGplayer's official catalogue is trusted, never title-filter it.
      if (r.retailer !== "tcgplayer" && (!SEALED_TITLE.test(r.title) || SEALED_EXCLUDE.test(r.title) || !isRiftboundSealed(r.title))) return true;
      // Price-sanity (every source except TCGplayer's trusted catalogue): drop listings
      // priced implausibly below the trusted price / per-type floor — an accessory, a $1
      // deposit/sample variant, or a mis-listing that escaped the title filter.
      if (r.retailer !== "tcgplayer" && r.priceCents < sealedFloorCents(r.productType, trusted.get(`${r.country}|${r.groupKey}`) ?? null)) return true;
      return false;
    })
    .map((r) => r.id);
  if (ids.length) await prisma.sealedListing.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

import { msrpCents, isAtMsrp, overMsrpPct } from "@/lib/msrp";

export interface SealedGroup {
  groupKey: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  storeCount: number;
  // Availability-at-MSRP (A4): the RRP in the viewer's market (null if none
  // published), whether the cheapest in-stock listing is at/below it, and how
  // far over RRP that price sits (positive = scalped).
  msrpCents: number | null;
  atMsrp: boolean;
  overMsrpPct: number | null;
  listings: {
    retailer: string;
    retailerName: string;
    priceCents: number;
    url: string;
    inStock: boolean;
  }[];
}

// Group sealed listings by product for the /sealed page, for one market (AU/NZ/US).
//
// CACHED IN PROCESS MEMORY: this pulls the market's entire sealed table on
// every call — fetching it from Neon per request is the network-transfer
// pattern that burned through dexcompare's free-tier allowance. unstable_cache
// can't hold large items (2 MB limit fails silently), so it uses the same
// globalThis memo pattern as the games pool: one DB pull per market per warm
// lambda per TTL.
type SealedMemo = Map<string, { at: number; data: SealedGroup[] }>;
const sealedMemo: SealedMemo = ((globalThis as unknown as { __sealedGroups?: SealedMemo }).__sealedGroups ??= new Map());
const SEALED_MEMO_TTL_MS = 15 * 60_000;

// Authoritative product image per groupKey, from TCGplayer's official catalogue.
// Stores frequently reuse the BOOSTER BOX photo on their booster-PACK (and other)
// listings, so the cheapest listing's image is often wrong. TCGplayer publishes a
// correct per-product image, and the art is market-agnostic (a Spiritforged pack looks
// the same in every currency) — so we key it by groupKey and prefer it for all markets.
// Memoized (one small query per warm lambda per TTL) alongside the group memo.
type ImgMemo = { at: number; data: Map<string, string> };
async function getCanonicalSealedImages(): Promise<Map<string, string>> {
  const slot = globalThis as unknown as { __sealedCanonImg?: ImgMemo };
  const cached = slot.__sealedCanonImg;
  if (cached && Date.now() - cached.at < SEALED_MEMO_TTL_MS) return cached.data;
  const map = new Map<string, string>();
  try {
    const rows = await prisma.sealedListing.findMany({
      where: { retailer: "tcgplayer", imageUrl: { not: null } },
      select: { groupKey: true, imageUrl: true },
    });
    for (const r of rows) if (r.imageUrl && !map.has(r.groupKey)) map.set(r.groupKey, r.imageUrl);
  } catch {
    /* best-effort — fall back to per-listing images */
  }
  slot.__sealedCanonImg = { at: Date.now(), data: map };
  return map;
}

// Image-source preference within a market: official catalogue > eBay > store photo.
const imageSourceRank = (retailer: string) => (retailer === "tcgplayer" ? 0 : retailer === "ebay" ? 1 : 2);

// On-brand, type-correct fallback thumbnails (original RiftCompare graphics in
// public/sealed/). Used ONLY when we lack an authoritative photo — see below. Keyed
// by productType; Champion Decks (which carry a name, e.g. "Champion Deck (Vex)") and
// any unmapped type fall through to the sensible defaults in sealedTypeImage().
const SEALED_TYPE_IMAGE: Record<string, string> = {
  "Booster Pack": "/sealed/sealed-pack.png",
  "Nexus Night Pack": "/sealed/sealed-pack.png",
  "Promo Pack": "/sealed/sealed-pack.png",
  "Sleeved Booster": "/sealed/sealed-pack.png",
  "Sleeved Booster (Art Set)": "/sealed/sealed-pack.png",
  "Booster Box": "/sealed/sealed-box.png",
  "Box Set": "/sealed/sealed-box.png",
  "Booster Case": "/sealed/sealed-case.png",
  "Proving Grounds Case": "/sealed/sealed-case.png",
  "Bulk Runes Case": "/sealed/sealed-case.png",
  "Proving Grounds": "/sealed/sealed-deck.png",
  "Starter Set": "/sealed/sealed-deck.png",
};
function sealedTypeImage(productType: string): string {
  if (/^Champion Deck/.test(productType)) return "/sealed/sealed-deck.png";
  return SEALED_TYPE_IMAGE[productType] ?? "/sealed/sealed-generic.png";
}
// Product types where stores routinely reuse the BOOSTER BOX photo on the listing, so
// a store-sourced image is untrustworthy — we replace it with our type-correct graphic
// (box/case/deck store photos are usually the real product, so those we keep).
const DISTRUST_STORE_IMAGE = new Set([
  "Booster Pack", "Nexus Night Pack", "Promo Pack", "Sleeved Booster", "Sleeved Booster (Art Set)",
]);

export async function getSealedGroups(country: "AU" | "NZ" | "US" | "UK" | "SG" = "AU"): Promise<SealedGroup[]> {
  const hit = sealedMemo.get(country);
  if (hit && Date.now() - hit.at < SEALED_MEMO_TTL_MS) return hit.data;
  // Only the fields the grouping uses — no point hauling unused columns.
  const rows = await prisma.sealedListing.findMany({
    where: { country },
    orderBy: { priceCents: "asc" },
    select: {
      groupKey: true, title: true, productType: true, setCode: true, imageUrl: true,
      retailer: true, retailerName: true, priceCents: true, url: true, inStock: true,
    },
  });
  const canonicalImg = await getCanonicalSealedImages();
  const groups = new Map<string, SealedGroup>();
  const imgRank = new Map<string, number>(); // groupKey -> source rank of the chosen image
  for (const r of rows) {
    // Price-sanity guard: drop any listing priced implausibly low for its type (e.g. a
    // $1 "Booster Case"). Defends the live site against mis-priced rows already in the
    // DB — takes effect on the next memo refresh, before the importer re-cleans them.
    if (r.priceCents < sealedFloorCents(r.productType)) continue;
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
        imageUrl: null,
        lowestPriceCents: null,
        storeCount: 0,
        msrpCents: null,
        atMsrp: false,
        overMsrpPct: null,
        listings: [],
      };
      groups.set(r.groupKey, g);
    }
    // Pick the group thumbnail from the most authoritative source (TCGplayer > eBay >
    // store), not just the cheapest listing — stores reuse the box photo on pack
    // listings, so the cheapest image is often the wrong product.
    if (r.imageUrl) {
      const rank = imageSourceRank(r.retailer);
      const cur = imgRank.get(r.groupKey);
      if (cur == null || rank < cur) {
        g.imageUrl = r.imageUrl;
        imgRank.set(r.groupKey, rank);
      }
    }
    g.listings.push({ retailer: r.retailer, retailerName: r.retailerName, priceCents: r.priceCents, url: r.url, inStock: r.inStock });
  }
  // Override with the official TCGplayer catalogue image where we have one — correct
  // per-product art, market-agnostic, so it fixes markets (AU/NZ/UK) whose only
  // listings are store photos of the wrong product.
  for (const g of groups.values()) {
    const canon = canonicalImg.get(g.groupKey);
    if (canon) {
      g.imageUrl = canon;
      imgRank.set(g.groupKey, 0);
    }
  }
  // Type-correct branded fallback: if the only image is a STORE photo of a pack-family
  // product (stores reuse the box photo on pack listings → the reported "pack shows a
  // box" bug), or we have no image at all, use our own on-brand, type-correct graphic
  // instead of a wrong/blank thumbnail. Authoritative photos (TCGplayer/eBay) are kept.
  for (const g of groups.values()) {
    const rank = imgRank.get(g.groupKey);
    const storeOnly = rank == null || rank >= 2;
    if (g.imageUrl == null || (storeOnly && DISTRUST_STORE_IMAGE.has(g.productType))) {
      g.imageUrl = sealedTypeImage(g.productType);
    }
  }
  const out = Array.from(groups.values()).map((g) => {
    g.listings.sort((a, b) => a.priceCents - b.priceCents);
    const inStock = g.listings.filter((l) => l.inStock);
    // Headline price comes from IN-STOCK listings only (null = sold out everywhere).
    g.lowestPriceCents = inStock[0]?.priceCents ?? null;
    g.storeCount = new Set(inStock.map((l) => l.retailerName)).size;
    // Availability-at-MSRP for this market.
    g.msrpCents = msrpCents(g.productType, country);
    g.atMsrp = g.lowestPriceCents != null && isAtMsrp(g.lowestPriceCents, g.productType, country);
    g.overMsrpPct = g.lowestPriceCents != null ? overMsrpPct(g.lowestPriceCents, g.productType, country) : null;
    return g;
  });
  // Boxes/cases first, then by price.
  const order = [
    "Booster Box", "Booster Case", "Proving Grounds", "Proving Grounds Case", "Box Set",
    "Pre-Rift Event Kit", "Pre-Rift Kit", "Bundle", "Starter Set",
    "Nexus Night Pack", "Promo Pack", "Sleeved Booster (Art Set)", "Sleeved Booster",
    "Booster Pack", "Bulk Runes Case", "Bulk Runes", "Tin", "Sealed",
  ];
  // Champion Decks slot between bundles and packs (display boxes before singles).
  const rank = (t: string) => {
    if (/champion deck/i.test(t)) return /display/i.test(t) ? 8.4 : 8.6;
    const i = order.indexOf(t);
    return i < 0 ? 99 : i;
  };
  out.sort((a, b) => {
    const ra = rank(a.productType), rb = rank(b.productType);
    if (ra !== rb) return ra - rb;
    return (a.lowestPriceCents ?? 9e9) - (b.lowestPriceCents ?? 9e9);
  });
  sealedMemo.set(country, { at: Date.now(), data: out });
  return out;
}
