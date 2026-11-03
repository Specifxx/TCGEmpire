// The Card Hive (thecardhive.co.uk) — the one store this importer reads that is
// neither Shopify nor WooCommerce.
//
// ── WHY A STORE OF ITS OWN ───────────────────────────────────────────────────
// A UK Riftbound singles shop, suggested through the suggest-a-store form on
// 2026-10-30 and added on the owner's call. Its site is a custom React app on
// Google Firebase: /products.json and the Woo Store API both return the app's
// home page, so neither existing path can see a single price. The stock lives
// in ONE Firestore collection, `shop`, which the shop page itself reads whole
// and unauthenticated (getDocs(collection(db, "shop")) in its bundle) — every
// visitor's browser downloads exactly what this reads, through Firestore's
// public REST endpoint with the web API key the page ships. Nothing here signs
// in, and nothing reads any other collection.
//
// ── MATCHING: RIOT'S OWN PICTURE, NOT A TITLE ────────────────────────────────
// The shop's own set/number fields are hand-entered and unreliable for exactly
// the printings that matter: alt arts carry the base number ("RAD 138" for
// 138a), runes are "r02" for r02a, K/DA Special Art cards are "RAD 2" for
// SP2/005, and 39 rows have no number at all. What every row DOES carry is its
// card picture, hotlinked from Riot's official gallery
// (cmsassets.rgpub.io/…/game_data_live/<sha1>-744x1039.png). The gallery page
// (playriftbound.com/en-us/card-gallery, one plain GET, the same read
// backfill-card-text.ts makes) states which printing each picture is: its
// publicCode, "UNL-029a/219". So a listing is matched only when
//   1. its picture is one of the gallery's,
//   2. that gallery card's set + collector number name exactly ONE non-promo
//      printing in our catalogue, and
//   3. the shop's own card name agrees with that printing's name.
// Anything else is unmatched — a wrong match is worse than a missing price.
// Probe 2026-10-30: 1,004 singles, 0 name or set disagreements among those the
// picture resolved.
import type { CardLite, ShopifyProduct } from "./price-import";
import { SCRAPE_HEADERS as UA } from "./scrape-http";

export const CARDHIVE_PROJECT = "cardhive-c9eed";
// The Firebase web API key the shop's page ships in its bundle. It is a public
// project identifier, not a secret (Firebase's own docs): access is decided by
// the project's security rules, which let anyone read `shop`.
export const CARDHIVE_API_KEY = "AIzaSyDVHxlVwOVjmwTiZhCq2KwXUyMoOgzuIjg";
export const OFFICIAL_GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/";

/** One `shop` document, the fields this reads. */
export interface HiveItem {
  id: string;
  name: string;
  category: string | null; // "Single", "Booster Box", …
  game: string | null; // "riftbound"
  condition: string | null; // "NM"
  foil: boolean;
  price: number; // GBP, pounds
  stock: number;
  image: string | null;
}

/** A Firestore REST value → plain JS. Only the shapes the `shop` docs use. */
export function firestoreValue(v: any): unknown {
  if (v == null || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return !!v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(firestoreValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue?.fields ?? {}).map(([k, x]) => [k, firestoreValue(x)]));
  return null;
}

export function hiveItemFromDoc(doc: { name: string; fields?: Record<string, unknown> }): HiveItem {
  const f = Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, firestoreValue(v)])) as Record<string, any>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return {
    id: doc.name.split("/").pop() ?? "",
    name: str(f.name) ?? "",
    category: str(f.category),
    game: str(f.game),
    condition: str(f.condition),
    foil: f.foil === true,
    price: typeof f.price === "number" ? f.price : NaN,
    stock: typeof f.stock === "number" ? f.stock : 0,
    image: str(f.image),
  };
}

/** The sha1 that names a picture in Riot's card CMS, or null for any other URL. */
export function riotImageHash(url: string | null | undefined): string | null {
  const m = /cmsassets\.rgpub\.io\/sanity\/images\/[^/]+\/game_data_live\/([0-9a-f]{40})-/.exec(url ?? "");
  return m ? m[1] : null;
}

/** Picture hash → the gallery's publicCode ("UNL-029a/219"), from its __NEXT_DATA__. */
export function galleryCodesByHash(nextData: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;
    if (typeof o.id === "string" && typeof o.publicCode === "string" && o.cardImage && o?.set?.value?.id) {
      const h = riotImageHash(o.cardImage.url);
      if (h) {
        // One picture on two printings would make the picture no key at all.
        if (out.has(h) && out.get(h) !== o.publicCode) ambiguous.add(h);
        else out.set(h, o.publicCode);
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(nextData);
  for (const h of ambiguous) out.delete(h);
  return out;
}

const normName = (s: string) => s.replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normCode = (s: string) => s.trim().toLowerCase();

/** "UNL-029a/219" → { set: "UNL", num: "029a/219" }; "RAD-R02a" → { set: "RAD", num: "r02a" }. */
export function splitPublicCode(code: string): { set: string; num: string } | null {
  const m = /^([A-Za-z0-9]+)-(.+)$/.exec(code.trim());
  return m ? { set: m[1].toUpperCase(), num: normCode(m[2]) } : null;
}

/** "set|number" → the non-promo printings with that number (more than one = ambiguous). */
export function cardsBySetNumber(cards: CardLite[]): Map<string, CardLite[]> {
  const m = new Map<string, CardLite[]>();
  for (const c of cards) {
    if (c.isPromo) continue; // a promo shares its base card's number
    const k = `${c.setCode.toUpperCase()}|${normCode(c.collectorNumber)}`;
    const arr = m.get(k);
    if (arr) arr.push(c);
    else m.set(k, [c]);
  }
  return m;
}

/** The printing this listing is, or null. See the header for the three conditions. */
export function matchHiveItem(item: HiveItem, codes: Map<string, string>, bySetNum: Map<string, CardLite[]>): CardLite | null {
  const h = riotImageHash(item.image);
  if (!h) return null;
  const code = codes.get(h);
  if (!code) return null;
  const sn = splitPublicCode(code);
  if (!sn) return null;
  const hits = bySetNum.get(`${sn.set}|${sn.num}`) ?? [];
  if (hits.length !== 1) return null;
  const card = hits[0];
  if (!item.name || normName(item.name) !== normName(card.name)) return null;
  return card;
}

/**
 * The shop's Riftbound singles as the importer's product shape, each with its
 * printing already decided (`cardId`, null when it could not be) so the title
 * matcher is never asked to guess from a title this file wrote.
 */
export function hiveProducts(items: HiveItem[], codes: Map<string, string>, cards: CardLite[], base: string): ShopifyProduct[] {
  const bySetNum = cardsBySetNumber(cards);
  const out: ShopifyProduct[] = [];
  for (const it of items) {
    if (it.game !== "riftbound" || it.category !== "Single") continue;
    if (!(it.price > 0)) continue;
    const card = matchHiveItem(it, codes, bySetNum);
    const code = card ? `${card.setCode}-${card.collectorNumber}` : "";
    out.push({
      title: [it.name, code && `- ${code}`, it.foil && "Foil"].filter(Boolean).join(" "),
      handle: it.id,
      url: `${base}/shop?item=${encodeURIComponent(it.id)}`,
      // The shop grades every single NM today; anything else is passed through
      // as the variant label so conditionRank/listingCondition read it.
      variants: [{ title: it.condition === "NM" || !it.condition ? "Near Mint" : it.condition, price: it.price.toFixed(2), available: it.stock > 0 }],
      cardId: card ? card.id : null,
    });
  }
  return out;
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Every `shop` document, or null when any page fails (a partial list would drop stock). */
export async function fetchHiveItems(): Promise<HiveItem[] | null> {
  const root = `https://firestore.googleapis.com/v1/projects/${CARDHIVE_PROJECT}/databases/(default)/documents/shop`;
  const items: HiveItem[] = [];
  let token = "";
  for (let page = 0; page < 40; page++) {
    const j = await getJson(`${root}?pageSize=300&key=${CARDHIVE_API_KEY}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!j) return null;
    for (const d of j.documents ?? []) items.push(hiveItemFromDoc(d));
    token = j.nextPageToken ?? "";
    if (!token) return items;
  }
  return null; // 12,000+ documents: not the shop this was built for
}

/** The official gallery's picture → publicCode map, or null when it cannot be read. */
export async function fetchGalleryCodes(): Promise<Map<string, string> | null> {
  try {
    const r = await fetch(OFFICIAL_GALLERY_URL, { headers: UA, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const codes = galleryCodesByHash(JSON.parse(m[1]));
    return codes.size ? codes : null;
  } catch {
    return null;
  }
}

/**
 * The importer's entry point. [] (keep yesterday's rows, store-health's stale
 * alert fires if it lasts) when either source cannot be read.
 */
export async function fetchCardHiveProducts(base: string, cards: CardLite[]): Promise<ShopifyProduct[]> {
  const [items, codes] = await Promise.all([fetchHiveItems(), fetchGalleryCodes()]);
  if (!items) {
    console.warn("  ⚠ The Card Hive: could not read its shop list — keeping this store's existing rows for this run.");
    return [];
  }
  if (!codes) {
    console.warn("  ⚠ The Card Hive: could not read Riot's card gallery — keeping this store's existing rows for this run.");
    return [];
  }
  return hiveProducts(items, codes, cards, base);
}
