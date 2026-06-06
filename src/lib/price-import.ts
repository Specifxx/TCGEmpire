// Reusable price-import engine. Pulls Riftbound singles from AU Shopify stores'
// public products.json feeds, matches them to cards, and writes RetailerPrice
// rows + Card.lowestPriceCents. Called by scripts/import-prices.ts (CLI) and the
// scheduled /api/cron/refresh-prices route.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { RETAILER_LIST, RetailerInfo } from "./retailers";
import { isEbayEnabled, isEbayRateLimited, searchEbayLowest } from "./ebay";

interface ShopifyVariant { title: string; price: string; available: boolean }
interface ShopifyProduct { title: string; handle: string; variants: ShopifyVariant[] }

export interface ImportSummary {
  stores: { name: string; products: number; priced: number; matched: number; unmatched: number }[];
  totalMatched: number;
  totalUnmatched: number;
  cardsPriced: number;
}

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving\s*grounds|\bOGS\b/i, "OGS"],
  [/spirit\s*forged|\bSFD\b/i, "SFD"],
  [/unleashed|\bUNL\b/i, "UNL"],
  [/vendetta|vengeance|\bVEN\b/i, "VEN"],
  [/origins|\bOGN\b/i, "OGN"],
];

// Set/condition/qualifier tokens to strip when isolating the card name.
const STOP =
  /\b(riftbound|proving\s*grounds|spirit\s*forged|unleashed|vengeance|origins|showcase|signature|overnumbered|alternate\s*art|alt\s*art|foil|holo(foil)?|near mint|lightly played|moderately played|heavily played|damaged|main set|the game|tcg|single)\b/gi;

function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  // A "*" marks a Signature print (e.g. "223*/221"), a DIFFERENT card from the
  // plain overnumbered "223/221" — keep their keys distinct so listings don't mix.
  return seg.includes("*") ? `${base}s` : base;
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
// Parse a collector number from any store title format, e.g.:
//   "(299*/298)", "(053/219)", "OGN-128/298", "[OGN - 213/298]", "239*/221"
// Keys are normalised via numKey so "039" and "39" compare equal (the leading-zero
// bug that previously mis-assigned base cards to their alt-art printings).
function parseNumber(title: string): { setCode: string | null; key: string; total: string } | null {
  const pref = title.match(/\b([A-Za-z]{2,4})\s*-\s*(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (pref) return { setCode: pref[1].toUpperCase(), key: numKey(pref[2] + pref[3]), total: pref[4] };
  const bare = title.match(/(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (bare) return { setCode: null, key: numKey(bare[1] + bare[2]), total: bare[3] };
  return null;
}

// Multi-card listings (playsets, lots, bundles) carry a SET price, not a per-card
// price — matching them to a single card would record a wildly wrong number. Stores
// like Cherry Collectables list "PLAYSET (3) 3x Watchful Sentry - 096/298". Mirror
// the bundle/lot guard the eBay matcher uses (EXCLUDE in src/lib/ebay.ts), scoped to
// the multi-quantity signals that actually appear in store titles.
export const MULTI_CARD =
  /\b(playset|lot|lots|bundle|joblot|job lot|x\s*\d+|\d+\s*x|set of|complete set|full set|bulk)\b/i;

// Many TCG stores list a card with condition variants (Near Mint, Lightly Played,
// …). Picking the absolute cheapest variant records a played/damaged copy's price,
// which is LOWER than the Near-Mint price shoppers see on the product page (a card
// showed $33 when the store's NM price was $45). Rank by condition so we record the
// best available condition — matching the headline price on the listing.
function conditionRank(variantTitle: string): number {
  const t = (variantTitle || "").toLowerCase();
  if (/near\s*mint|\bnm\b|mint/.test(t)) return 0;
  if (/light(ly)?\s*play|\blp\b/.test(t)) return 1;
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return 2;
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return 3;
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return 4;
  return 0; // no condition in the title (e.g. "Default Title") → treat as standard/NM
}

const UA = { "User-Agent": "Mozilla/5.0 RiftCompareAUBot" };

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Collection handles that are clearly NOT singles (sealed, accessories, etc.).
const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

// Auto-discover a store's Riftbound singles collections from its Shopify sitemap,
// so we only need the store's domain (handles vary wildly between stores). This is
// how an aggregator like Google captures every store without hard-coding URLs.
async function discoverRiftboundCollections(base: string): Promise<string[]> {
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
      // Require "riftbound" (not just "rift" — avoids Pokémon "Paradox Rift"),
      // and skip sealed/accessory collections and image URLs.
      if (/riftbound/i.test(h) && !NON_SINGLE.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) {
        handles.add(h);
      }
    }
  }
  return Array.from(handles);
}

async function fetchCollection(store: RetailerInfo, handle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    // Cache-bust: Shopify serves products.json from an aggressive edge cache, so
    // different fetchers can get different stale snapshots (this caused a card to
    // show $26 when the live store price was $35). A unique param + no-store forces
    // a fresh response so the prices we record match what shoppers actually see.
    const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}&_=${Date.now()}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { ...UA, "Cache-Control": "no-cache", Pragma: "no-cache" }, cache: "no-store" });
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
  // Skip promos: they share the base card's number, so matching would steal the
  // base card's prices. Promos stay unpriced until promo-aware matching exists.
  const cards = await prisma.card.findMany({
    where: { isPromo: false },
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
  // Track which card ids are Signature ("*") or Overnumbered so number-only
  // matches can be constrained to the right print type.
  const starIds = new Set<string>();
  const overIds = new Set<string>();
  for (const c of cards) {
    const nk = numKey(c.collectorNumber.split("/")[0]);
    push(byNum, `${c.setCode}|${nk}`, c.id);
    push(byNumAny, nk, c.id);
    push(byName, nameKey(c.name), c);
    const [d, tt] = c.collectorNumber.split("/");
    if (c.collectorNumber.includes("*")) starIds.add(c.id);
    else if (parseInt(d, 10) > parseInt(tt ?? "0", 10)) overIds.add(c.id);
  }

  // The collector-number TOTAL uniquely identifies the set, so a title like
  // "Existential Dread - 134/219" (no set code) is unambiguously UNL — never the
  // OGN card numbered 134/298. This is authoritative and prevents cross-set bleed.
  const setFromTotal = (total?: string): string | null => {
    switch (parseInt(total ?? "", 10)) {
      case 298: return "OGN";
      case 221: return "SFD";
      case 219: return "UNL";
      case 24: return "OGS";
      default: return null;
    }
  };

  function resolveCardId(p: ShopifyProduct): string | null {
    const t = p.title;
    // Never match a multi-card listing (playset/lot/bundle) to a single card — its
    // price is for the whole group, not one card.
    if (MULTI_CARD.test(t)) return null;
    const num = parseNumber(t);
    const setCode =
      num?.setCode ?? setFromTotal(num?.total) ?? SET_FROM_TITLE.find(([re]) => re.test(t))?.[1] ?? "OGN";
    // NOTE: "Foil" is NOT an alt-art signal — nearly every listing (incl. base
    // cards) says Foil. Only these markers (or a lettered number like 039a) mean
    // an alt-art/special printing.
    const isAlt =
      /showcase|signature|overnumbered|alternate\s*art|alt\s*art/i.test(t) ||
      /\d+[a-z]/.test(num?.key ?? "");

    // Special-print signals in the title. Signature ("*"/signed) and Overnumbered
    // (number beyond the set count) are SEPARATE cards from the base/alt printings
    // and must never be mixed with them — nor with each other.
    const titleSig = /\bsignature\b|\bsigned\b/i.test(t) || /\d\s*\*/.test(t);
    const titleOver = !titleSig && /\bovernumber\w*/i.test(t);
    const isStar = (c: (typeof cards)[number]) => c.collectorNumber.includes("*");
    const isOverCard = (c: (typeof cards)[number]) => {
      if (isStar(c)) return false;
      const [d, tt] = c.collectorNumber.split("/");
      return parseInt(d, 10) > parseInt(tt ?? "0", 10);
    };
    const pickByNum = <T extends { collectorNumber: string }>(arr: T[]): T | undefined =>
      num ? arr.find((c) => numKey(c.collectorNumber.split("/")[0]) === num.key) : undefined;

    // 1) name match, disambiguated by special-print → number → variant.
    const cand = byName.get(nameKey(cleanProductName(t)));
    if (cand && cand.length) {
      // A Signature listing belongs ONLY to a "*" card of that name. If we don't
      // have one, leave it unmatched rather than mis-attaching to a sibling.
      if (titleSig) {
        const sigs = cand.filter(isStar);
        if (!sigs.length) return null;
        return (pickByNum(sigs) ?? sigs[0]).id;
      }
      // Likewise an Overnumbered listing belongs only to an overnumbered card.
      if (titleOver) {
        const overs = cand.filter(isOverCard);
        if (!overs.length) return null;
        return (pickByNum(overs) ?? overs[0]).id;
      }
      if (cand.length === 1) return cand[0].id;
      const exact = pickByNum(cand);
      if (exact) return exact.id;
      // A plain (non-special) listing must never resolve to a "*" Signature or an
      // overnumbered chase card — those only match explicit special-print titles.
      const pool = cand.filter((c) => !isStar(c) && !isOverCard(c));
      const search = pool.length ? pool : cand;
      const v = search.find((c) => (isAlt ? c.variant || c.rarity === "Showcase" : !c.variant && c.rarity !== "Showcase"));
      if (v) return v.id;
      return search[0].id;
    }

    // 2) number-only match (name didn't resolve — e.g. store titles like
    // "Vayne - Hunter — Signature - 223*/221" where the number/keywords pollute the
    // name). The number key is print-aware: numKey("223*") = "223s" maps only to the
    // signature card, so a starred number routes correctly. For special prints we
    // CONSTRAIN the hit to the matching print type, so a signature title whose number
    // is written WITHOUT the star (e.g. "225/221 (Signature)") won't wrongly grab the
    // plain overnumbered sibling — it stays unmatched instead.
    if (num) {
      const setHit = byNum.get(`${setCode}|${num.key}`) ?? [];
      const anyHit = byNumAny.get(num.key) ?? [];
      const hits = setHit.length ? setHit : anyHit;
      if (titleSig) {
        return hits.find((id) => starIds.has(id)) ?? null;
      }
      if (titleOver) {
        return hits.find((id) => overIds.has(id)) ?? null;
      }
      // Plain listing: prefer a plain (non-special) card of that number.
      const plainSet = setHit.filter((id) => !starIds.has(id) && !overIds.has(id));
      if (plainSet.length) return plainSet[0];
      const plainAny = anyHit.filter((id) => !starIds.has(id) && !overIds.has(id));
      if (plainAny.length === 1) return plainAny[0];
      if (setHit.length) return setHit[0];
    }
    return null;
  }

  const summary: ImportSummary = { stores: [], totalMatched: 0, totalUnmatched: 0, cardsPriced: 0 };

  for (const store of RETAILER_LIST) {
    // Auto-discover the store's Riftbound collections; fall back to any handles
    // configured explicitly in retailers.ts.
    let handles = await discoverRiftboundCollections(store.base);
    if (!handles.length) handles = store.collections ?? [];
    handles = Array.from(new Set([...handles, ...(store.collections ?? [])]));

    const products: ShopifyProduct[] = [];
    const seen = new Set<string>();
    for (const handle of handles) {
      for (const p of await fetchCollection(store, handle)) {
        if (seen.has(p.handle)) continue; // de-dup across overlapping collections
        seen.add(p.handle);
        products.push(p);
      }
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
      // Prefer in-stock variants. If none are available but the store still LISTS
      // the card with a price, record it as out-of-stock so the card page can show
      // "Store had it — currently sold out" (useful demand/availability signal).
      const priced = p.variants.filter((v) => parseFloat(v.price) > 0);
      if (!priced.length) continue;
      const avail = priced.filter((v) => v.available);
      const inStock = avail.length > 0;
      const pool = inStock ? avail : priced;
      // Best available CONDITION first (NM over LP over …), then cheapest within that
      // condition — so the price matches the listing's headline, not a played copy.
      const best = pool.reduce((a, b) => {
        const ra = conditionRank(a.title);
        const rb = conditionRank(b.title);
        if (ra !== rb) return ra < rb ? a : b;
        return parseFloat(a.price) <= parseFloat(b.price) ? a : b;
      });
      const priceCents = Math.round(parseFloat(best.price) * 100);
      const prev = rows.get(cardId);
      // Keep the best listing per store+card: in-stock beats out-of-stock, then
      // cheaper beats dearer.
      if (prev) {
        if (prev.inStock && !inStock) continue;
        if (prev.inStock === inStock && prev.priceCents <= priceCents) continue;
      }
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
        inStock,
      });
    }
    await prisma.retailerPrice.createMany({ data: Array.from(rows.values()) });
    summary.stores.push({ name: store.name, products: products.length, priced: rows.size, matched, unmatched });
    summary.totalMatched += matched;
    summary.totalUnmatched += unmatched;
  }

  // ---- eBay AU (optional; only runs when EBAY_CLIENT_ID/SECRET are set) --------
  if (isEbayEnabled()) {
    const allCards = await prisma.card.findMany({
      where: { isPromo: false },
      select: { id: true, name: true, setCode: true, collectorNumber: true },
    });
    // Buffer results, then replace in one shot. CRUCIAL: if the run produced no
    // results (e.g. the eBay API is rate-limited / 429), we DON'T delete the
    // existing eBay prices — a throttled refresh must never wipe live data to zero.
    const ebayRows: Prisma.RetailerPriceCreateManyInput[] = [];
    for (const c of allCards) {
      if (isEbayRateLimited()) break; // quota hit — stop firing doomed requests
      const [rawNum, total] = c.collectorNumber.split("/");
      const r = await searchEbayLowest({
        name: c.name,
        setCode: c.setCode,
        number: rawNum.replace(/\*/g, ""),
        total: total ?? "",
        isSignature: c.collectorNumber.includes("*"),
      });
      if (!r) continue;
      ebayRows.push({
        cardId: c.id,
        retailer: "ebay",
        retailerName: "eBay",
        title: r.title,
        url: r.url,
        condition: r.condition ?? null,
        isFoil: /foil/i.test(r.title),
        priceCents: r.priceCents,
        shippingCents: r.shippingCents,
        currency: "AUD",
        inStock: true,
      });
    }
    if (ebayRows.length > 0) {
      await prisma.retailerPrice.deleteMany({ where: { retailer: "ebay" } });
      await prisma.retailerPrice.createMany({ data: ebayRows });
    } else {
      console.warn("eBay returned 0 results (rate-limited?) — keeping existing eBay prices.");
    }
    summary.stores.push({ name: "eBay", products: allCards.length, priced: ebayRows.length, matched: ebayRows.length, unmatched: 0 });
  }

  // Recompute each card's lowest live price from IN-STOCK listings only, so the
  // catalogue "from" price never reflects a sold-out listing. (Out-of-stock rows
  // still exist and are shown on the card page, just not used for the headline price.)
  const priced = await prisma.retailerPrice.groupBy({
    by: ["cardId"],
    where: { inStock: true },
    _min: { priceCents: true },
  });
  await prisma.card.updateMany({ data: { lowestPriceCents: null } });
  for (const row of priced) {
    await prisma.card.update({
      where: { id: row.cardId },
      data: { lowestPriceCents: row._min.priceCents ?? null },
    });
  }
  summary.cardsPriced = priced.length;
  return summary;
}
