// DexCompare, the owner's Pokémon sealed STORE comparison (www.dexcompare.app),
// joined to this section's products. Pure and client-safe: the parser, the join
// and the link builders. The server loader is lib/pokemon/dexcompare-data.ts.
//
// Why (owner, 2026-10-15: "connect it to DexCompare … make things seamless"):
// this section prices TCGplayer and eBay, which is the US plus ~29 eBay-tracked
// products elsewhere, so most product boards outside the US said "No listing we
// track in Australia". DexCompare reads 200-odd independent stores in the same
// markets. Its public browse index (GET /api/browse/<region>, CDN-cached, the
// file its own search box loads) gives every product's cheapest open store
// price and how many stores have it; this section shows that figure beside its
// own and links to DexCompare's page for the store-by-store table.
//
// THE JOIN IS EXACT, never by name: both sites take their product images from
// TCGplayer's CDN (".../product/<productId>_in_1000x1000.jpg"), and this
// section's product id IS TCGplayer's productId (lib/pokemon/catalog.ts). A
// product DexCompare has no TCGplayer image for, or groups differently (half
// boxes, retailer exclusives, art variants), is not joined: its page links
// DexCompare's set page instead (dexSetSlug), which claims no price.
// Measured 2026-10-15: 607 of 713 products on the live set pages joined.

import type { Country } from "../country";

/** The site, as a link prefix. */
export const DEX_ORIGIN = "https://www.dexcompare.app";

/** This section's market → DexCompare's region path. DexCompare also has NZ, which this site does not. */
export const DEX_REGION: Record<Country, string> = { US: "us", AU: "au", UK: "uk", CA: "ca", EU: "eu", SG: "sg" };

/** The browse index format this parser reads (DexCompare lib/index-client.ts INDEX_VERSION). Another version is refused. */
export const DEX_INDEX_VERSION = 1;

/** One joined product in one market: [DexCompare slug, cheapest open price in cents or null, stores in stock, stores listing it, TCGplayer open (US)]. */
export type DexRow = [slug: string, cents: number | null, inStock: number, listed: number, marketplace: 0 | 1];

/** One market's join table, keyed by TCGplayer productId. What the loader caches. */
export interface DexMarket {
  market: Country;
  /** DexCompare's last store check in this market (ISO), null when it says none. */
  checkedAt: string | null;
  byId: Record<string, DexRow>;
  /** Products with at least one store in stock: the home band's figure. */
  inStockProducts: number;
}

/** What a page hands a board or a tile for one market. */
export type DexLink =
  | {
      kind: "product";
      slug: string;
      /** Cheapest OPEN price at a store (TCGplayer included in the US, as on DexCompare), in the market's currency; null when none is open. */
      cents: number | null;
      inStock: number;
      listed: number;
      /** TCGplayer has it open (US only): DexCompare's cheapest may be TCGplayer's. */
      marketplace: boolean;
      checkedAt: string | null;
    }
  | { kind: "set"; setSlug: string; setName: string };

const TCGPLAYER_IMAGE_ID = /tcgplayer-cdn\.tcgplayer\.com\/product\/(\d+)_/;

/** TCGplayer's productId from a TCGplayer CDN image URL, else null. */
export function tcgplayerIdFromImage(url: string | null | undefined): number | null {
  const m = url ? TCGPLAYER_IMAGE_ID.exec(url) : null;
  return m ? Number(m[1]) : null;
}

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/**
 * DexCompare's browse index for one region, as the join table. Throws on
 * anything but the version and shape it knows, so a change there leaves the
 * last good cache entry in place instead of caching an empty table.
 *
 * A row is DexCompare's CompactCard: [slug, name, type, setCode, img, price,
 * inStock, listed, marketplace, median]. An image under "~" is a Shopify CDN
 * path (no TCGplayer id) and is skipped, as is any row without a TCGplayer
 * image. Two rows with one id (never seen) keep the first, the index's own
 * order (open first).
 */
export function parseDexIndex(body: unknown, market: Country): DexMarket {
  if (!body || typeof body !== "object") throw new Error("DexCompare index: not an object");
  const b = body as { v?: unknown; region?: unknown; checkedAt?: unknown; rows?: unknown };
  if (b.v !== DEX_INDEX_VERSION) throw new Error(`DexCompare index: version ${String(b.v)}, expected ${DEX_INDEX_VERSION}`);
  if (b.region !== DEX_REGION[market]) throw new Error(`DexCompare index: region ${String(b.region)} for ${market}`);
  if (!Array.isArray(b.rows) || b.rows.length === 0) throw new Error("DexCompare index: no rows");
  const byId: Record<string, DexRow> = {};
  let inStockProducts = 0;
  for (const r of b.rows) {
    if (!Array.isArray(r) || typeof r[0] !== "string") continue;
    const inStock = int(r[6]);
    const listed = int(r[7]);
    if (inStock == null || listed == null) continue;
    if (inStock > 0) inStockProducts++;
    const id = tcgplayerIdFromImage(typeof r[4] === "string" ? r[4] : null);
    if (id == null || byId[id]) continue;
    const cents = r[5] == null ? null : int(r[5]);
    byId[id] = [r[0], cents && cents > 0 ? cents : null, inStock, listed, r[8] === 1 ? 1 : 0];
  }
  if (!Object.keys(byId).length) throw new Error("DexCompare index: no row carries a TCGplayer id");
  return { market, checkedAt: typeof b.checkedAt === "string" ? b.checkedAt : null, byId, inStockProducts };
}

// This section's set slugs (lib/pokemon/catalog.ts slugify of TCGplayer's group
// name) where DexCompare's differ. Checked 2026-10-15 against DexCompare's
// lib/sets.ts; every other set in scope has the same slug on both sites.
const SET_SLUG_EXCEPTIONS: Record<string, string> = {
  "scarlet-violet-base-set": "scarlet-violet",
  "sword-shield-base-set": "sword-shield",
  "champions-path": "champion-s-path",
};

/**
 * DexCompare's slug for one of this section's sets, when DexCompare lists a
 * joined product of it in this market (its product slugs start with the set's
 * slug; the table holds only joined rows, 85% and more of each index), else
 * null: a set DexCompare does not have yet is never linked.
 */
export function dexSetSlug(index: DexMarket | null, setSlug: string | null | undefined): string | null {
  if (!index || !setSlug) return null;
  const slug = SET_SLUG_EXCEPTIONS[setSlug] ?? setSlug;
  const prefix = `${slug}-`;
  for (const row of Object.values(index.byId)) if (row[0].startsWith(prefix)) return slug;
  return null;
}

/** The product's DexCompare link in one market: the product when joined, else its set when DexCompare has the set, else null. */
export function dexLinkFor(
  index: DexMarket | null,
  product: { id: number; set: { slug: string; name: string } | null },
): DexLink | null {
  if (!index) return null;
  const row = index.byId[product.id];
  if (row) {
    const [slug, cents, inStock, listed, marketplace] = row;
    return { kind: "product", slug, cents, inStock, listed, marketplace: marketplace === 1, checkedAt: index.checkedAt };
  }
  const setSlug = product.set ? dexSetSlug(index, product.set.slug) : null;
  return setSlug && product.set ? { kind: "set", setSlug, setName: product.set.name } : null;
}

/** The figures a grid tile shows: the product only (a tile never links a set). */
export type DexTileFigures = Pick<Extract<DexLink, { kind: "product" }>, "cents" | "inStock" | "listed" | "marketplace">;

export function dexTileFigures(index: DexMarket | null, id: number): DexTileFigures | null {
  const row = index?.byId[id];
  return row ? { cents: row[1], inStock: row[2], listed: row[3], marketplace: row[4] === 1 } : null;
}

/** The grid's tiles with this market's DexCompare figures attached (null where not joined). */
export function withDex<T extends { id: number }>(tiles: readonly T[], index: DexMarket | null): (T & { dex: DexTileFigures | null })[] {
  return tiles.map((t) => ({ ...t, dex: dexTileFigures(index, t.id) }));
}

/** Can you buy it at a store (or, in the US, on TCGplayer) by DexCompare's last check? */
export function dexOpen(d: { cents: number | null; inStock: number; marketplace: boolean }): boolean {
  return d.cents != null && (d.inStock > 0 || d.marketplace);
}

// ── Links ─────────────────────────────────────────────────────────────────────
// UTM on every link, so DexCompare's analytics count this section's referrals
// by surface. `rel` is DEX_REL: our own site and no commission, but a data link
// repeated across a thousand product pages, so nofollow (sister-sites.ts keeps
// FOLLOWED links to the footer and a few articles; four look-alike sites
// cross-linked sitewide read as a link network).

export const DEX_REL = "nofollow noopener";

export type DexSurface = "product" | "quickview" | "markets" | "set" | "home" | "subnav";

function withUtm(path: string, surface: DexSurface): string {
  return `${DEX_ORIGIN}${path}?utm_source=riftcompare&utm_medium=referral&utm_campaign=pkmn-${surface}`;
}

export function dexHref(market: Country, link: DexLink, surface: DexSurface): string {
  const region = DEX_REGION[market];
  return withUtm(link.kind === "product" ? `/${region}/p/${link.slug}` : `/${region}/sets/${link.setSlug}`, surface);
}

/** DexCompare's home for the market: every product, every store. */
export function dexHomeHref(market: Country, surface: DexSurface): string {
  return withUtm(`/${DEX_REGION[market]}`, surface);
}

/** "8 stores" / "1 store". */
export function storesWord(n: number): string {
  return `${n} ${n === 1 ? "store" : "stores"}`;
}
