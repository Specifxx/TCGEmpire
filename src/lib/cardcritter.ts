// Card Critter (cardcritter.com.au) — an Australian shop with its own stock of
// Riftbound singles, neither Shopify nor Woo.
//
// ── WHY A STORE OF ITS OWN ───────────────────────────────────────────────────
// Suggested through the suggest-a-store form on 2026-11-01 (owner request).
// Probed 2026-11-16 from Bill's PC: a Next.js site whose /riftbound/cards list
// pages are server-rendered (no script needed), 60 printings a page, ?page=N.
// robots.txt allows these pages and disallows /api/ — this file never touches
// /api/. Every price is the shop's own AUD selling price (it prices from the US
// market plus a margin, converted, and says so); the market figure it shows
// beside it is a guide and is NOT read here.
//
// ── MATCHING: SET + NUMBER, THEN THE NAME ────────────────────────────────────
// Each list entry carries the set name, the collector number ("182/167") and
// the card name. A listing is matched only when
//   1. its set name is one we know (an unknown set is unmatched),
//   2. set + number name exactly ONE non-promo printing in our catalogue, and
//   3. the shop's card name agrees with that printing's name.
// Anything else is unmatched — a wrong match is worse than a missing price.
// A card with no "In stock" badge is not a listing.
//
// ── LOAD ─────────────────────────────────────────────────────────────────────
// 24 GETs a day, one every second, robots.txt checked first. A page that fails
// makes the whole read fail ([] — yesterday's rows stay, store-health's stale
// alert fires if it lasts): a partial list would drop stock.
import type { CardLite, ShopifyProduct } from "./price-import";
import { SCRAPE_HEADERS as UA, robotsAllows, sleep } from "./scrape-http";
import { cardsBySetNumber } from "./cardhive";

export const CARDCRITTER_LIST_PATH = "/riftbound/cards";
export const CARDCRITTER_PAGE_DELAY_MS = 1000;
const MAX_PAGES = 60; // 24 today; a runaway loop is not this shop

/** The shop's set names → our set codes. An unlisted set is never matched. */
export const CARDCRITTER_SETS: Record<string, string> = {
  origins: "OGN",
  "proving grounds": "OGS",
  "origins: proving grounds": "OGS",
  spiritforged: "SFD",
  "spirit forged": "SFD",
  unleashed: "UNL",
  vendetta: "VEN",
  radiance: "RAD",
  legacy: "LGC",
  "the reckoning": "REC",
  reckoning: "REC",
};

/** One entry of a list page. */
export interface CritterItem {
  slug: string;
  name: string;
  set: string;
  number: string;
  rarity: string | null;
  priceAud: number;
  inStock: boolean;
}

const decode = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * The cards on one list page. Each is
 * <a href="/riftbound/cards/<slug>"> … <span>In stock</span> … <p>Name</p>
 * <p>Set · 001/167 · Rarity</p><p><span>$0.11</span></p></a>.
 */
export function parseCritterList(html: string): CritterItem[] {
  const out: CritterItem[] = [];
  const re = /<a\s[^>]*href="\/riftbound\/cards\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const slug = m[1];
    const body = m[2];
    const ps = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => decode(x[1]));
    if (ps.length < 3) continue;
    const [name, meta, priceText] = ps;
    const parts = meta.split("·").map((s) => s.trim());
    if (parts.length < 2) continue;
    const price = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/.exec(priceText);
    out.push({
      slug,
      name,
      set: parts[0],
      number: parts[1],
      rarity: parts[2] ?? null,
      priceAud: price ? Number(price[1].replace(/,/g, "")) : NaN,
      inStock: /\bIn stock\b/i.test(decode(body.split(/<p[\s>]/)[0] ?? "")),
    });
  }
  return out;
}

/** The last page number the list's pagination links to (1 when there is none). */
export function critterLastPage(html: string): number {
  let last = 1;
  for (const m of html.matchAll(/href="\/riftbound\/cards\?page=(\d+)/g)) last = Math.max(last, Number(m[1]));
  return last;
}

const normName = (s: string) => s.replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The printing this entry is, or null. */
export function matchCritterItem(it: CritterItem, bySetNum: Map<string, CardLite[]>): CardLite | null {
  const code = CARDCRITTER_SETS[it.set.trim().toLowerCase()];
  if (!code) return null;
  const hits = bySetNum.get(`${code}|${it.number.trim().toLowerCase()}`) ?? [];
  if (hits.length !== 1) return null;
  const card = hits[0];
  return normName(it.name) === normName(card.name) ? card : null;
}

/** In-stock, priced entries as the importer's product shape, printing already decided. */
export function critterProducts(items: CritterItem[], cards: CardLite[], base: string): ShopifyProduct[] {
  const bySetNum = cardsBySetNumber(cards);
  const out: ShopifyProduct[] = [];
  for (const it of items) {
    if (!it.inStock || !(it.priceAud > 0)) continue;
    const card = matchCritterItem(it, bySetNum);
    const code = card ? `${card.setCode}-${card.collectorNumber}` : "";
    out.push({
      title: [it.name, code && `- ${code}`].filter(Boolean).join(" "),
      handle: it.slug,
      url: `${base}${CARDCRITTER_LIST_PATH}/${it.slug}`,
      // The shop grades every single NM today (its price is the NM price).
      variants: [{ title: "Near Mint", price: it.priceAud.toFixed(2), available: true }],
      cardId: card ? card.id : null,
    });
  }
  return out;
}

async function getPage(base: string, page: number): Promise<string | null> {
  try {
    const r = await fetch(`${base}${CARDCRITTER_LIST_PATH}?page=${page}`, { headers: UA, signal: AbortSignal.timeout(30000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** The importer's entry point. [] (keep yesterday's rows) on any failure. */
export async function fetchCardCritterProducts(base: string, cards: CardLite[]): Promise<ShopifyProduct[]> {
  const allowed = await robotsAllows(base);
  if (!allowed(CARDCRITTER_LIST_PATH)) {
    console.warn("  ⚠ Card Critter: robots.txt disallows its card list — skipping.");
    return [];
  }
  const items: CritterItem[] = [];
  let last = 1;
  for (let page = 1; page <= Math.min(last, MAX_PAGES); page++) {
    if (page > 1) await sleep(CARDCRITTER_PAGE_DELAY_MS);
    const html = await getPage(base, page);
    if (!html) {
      console.warn(`  ⚠ Card Critter: page ${page} failed — keeping this store's existing rows for this run.`);
      return [];
    }
    if (page === 1) last = critterLastPage(html);
    const found = parseCritterList(html);
    if (!found.length) {
      console.warn(`  ⚠ Card Critter: page ${page} had no cards — keeping this store's existing rows for this run.`);
      return [];
    }
    items.push(...found);
  }
  return critterProducts(items, cards, base);
}
