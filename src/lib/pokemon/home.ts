// What /pokemon shows, built from one market's catalogue with no I/O: the
// stat line, the lowest price per pack by kind, what TCGplayer lists as coming
// up, a "from" price per product type, the newest sets and, in the US only,
// products listed under TCGplayer's own market price. Pure and client-safe;
// tests/pokemon-home.test.ts pins it against the real US fixture and the UK
// and SG variants derived from it.
//
// `catalog` is the one the page renders: in the UK it may already be in euros
// (lib/pokemon/browse.ts toDisplay). Nothing here formats money; the components
// do, with the page's display currency.

import { kindInfo, kindOrder, type PkKind } from "./kinds";
import { listingSourceList, sourceList } from "./copy";
import { KIND_HUBS, kindHref, type KindHub } from "./hubs";
import { asOfLabel, cheapestByKind, isHalfBox, perPackRanking } from "./value";
import type { Country } from "../country";
import type { PkCatalog, PkListingSource, PkSetSummary, PkSource, PkTile } from "./types";

// ── Stat line ─────────────────────────────────────────────────────────────────

export interface HomeStats {
  products: number;
  sets: number;
  /** Products with an open listing we track in THIS market (never "each one": many have none). */
  listed: number;
  /** Sources with an open listing that heads a product in THIS market, fixed order. */
  listingSources: PkListingSource[];
  /** This market's listing sources plus the reference, for the FAQ and any "prices from" copy. */
  sources: PkSource[];
  /** "TCGplayer and eBay": the reference plus this market's listing sources. */
  sourceList: string;
  asOf: string | null;
}

/**
 * The listing sources this market actually shows: those heading at least one
 * product. The catalogue's own `sources` is every market's, so in Singapore it
 * would name TCGplayer listings that only exist in the US.
 */
export function marketListingSources(tiles: readonly PkTile[]): PkListingSource[] {
  const seen = new Set(tiles.map((t) => t.lowSource).filter((s): s is PkListingSource => s != null));
  return (["tcgplayer", "cardmarket", "ebay"] as const).filter((s) => seen.has(s));
}

export function homeStats(catalog: PkCatalog): HomeStats {
  const listingSources = marketListingSources(catalog.tiles);
  const sources: PkSource[] = [...listingSources, ...(catalog.tiles.some((t) => t.refCents != null) ? (["tcgplayer_market"] as const) : [])];
  return {
    products: catalog.tiles.length,
    sets: catalog.sets.length,
    listed: catalog.tiles.filter((t) => t.lowCents != null).length,
    listingSources,
    sources,
    sourceList: sourceList(sources),
    asOf: asOfLabel(catalog.pricesAsOf),
  };
}

/**
 * The hero's stat line. It quotes how many products have a tracked listing
 * rather than promising one "for each": in the US about a tenth have none,
 * and where eBay is the only source it covers a few dozen of a thousand.
 * The reference is "where TCGplayer publishes one" for the same reason.
 */
export function heroLine(stats: HomeStats, place: string, converted: boolean): string {
  if (stats.products === 0) return "No prices yet.";
  const n = (x: number) => x.toLocaleString("en-US");
  const head = `${n(stats.products)} English sealed ${stats.products === 1 ? "product" : "products"} from ${n(stats.sets)} ${stats.sets === 1 ? "set" : "sets"}.`;
  const asOf = stats.asOf ? ` Prices ${stats.asOf}, updated daily.` : " Updated daily.";
  const ref = `TCGplayer's market price as a reference${converted ? " (converted, marked ≈)" : ""} where it publishes one`;
  const listings = listingSourceList(stats.listingSources);
  if (!listings || stats.listed === 0) {
    return `${head} We track no listings in ${place}: each product links to a search of your own eBay site, with ${ref}.${asOf}`;
  }
  const coverage = stats.listed === stats.products ? "every one of them" : `${n(stats.listed)} of them`;
  return `${head} We track the cheapest ${listings} listing in ${place} for ${coverage}, with the price per pack wherever the pack count is known, and show ${ref}.${asOf}`;
}

// ── Lowest price per pack, by kind ────────────────────────────────────────────

export const HOME_PER_PACK_ROWS = 5;
/** A group with fewer ranked rows than this is dropped rather than shown thin. */
export const HOME_PER_PACK_MIN = 3;

export interface PerPackGroup {
  hub: KindHub;
  rows: PkTile[];
}

/**
 * The three kind hubs' top rows. Singapore has no tracked listing, so no
 * per-pack figure exists there; it returns nothing rather than ranking by a
 * converted reference.
 */
export function perPackBoard(catalog: PkCatalog, market: Country): PerPackGroup[] {
  if (market === "SG") return [];
  return KIND_HUBS.map((hub) => ({ hub, rows: perPackRanking(catalog.tiles, { kinds: hub.kinds, limit: HOME_PER_PACK_ROWS }) })).filter(
    (g) => g.rows.length >= HOME_PER_PACK_MIN,
  );
}

// ── Coming up ─────────────────────────────────────────────────────────────────

export const COMING_UP_TILES = 8;

export interface ComingUpGroup {
  /** The date TCGplayer lists, or null when it lists none. */
  releasedOn: string | null;
  tiles: PkTile[];
}

export interface ComingUp {
  /** The next set with pre-orders: the earliest set date on or after today. */
  next: { set: PkSetSummary; releasedOn: string; days: number } | null;
  /** Up to COMING_UP_TILES pre-orders, box-shaped kinds first, grouped by date ascending. */
  groups: ComingUpGroup[];
  /** Every pre-order in the catalogue. */
  total: number;
}

const dayOf = (d: string | Date): string => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Whole days from `today` to `day` (both calendar days, UTC). */
export function daysUntil(day: string, today: string | Date): number {
  const a = Date.parse(`${dayOf(today)}T00:00:00Z`);
  const b = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "today", "tomorrow", "in 36 days". */
export function daysWording(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function comingUp(catalog: PkCatalog, today: string | Date): ComingUp {
  const t = dayOf(today);
  const pre = catalog.tiles.filter((x) => x.presale);
  const presaleSets = new Set(pre.map((x) => x.setSlug).filter(Boolean));
  const nextSet =
    catalog.sets
      .filter((s) => presaleSets.has(s.slug) && s.releasedOn != null && s.releasedOn >= t)
      .sort((a, b) => (a.releasedOn as string).localeCompare(b.releasedOn as string) || a.name.localeCompare(b.name))[0] ?? null;

  // The boxes people plan around first, then by date, so eight mini tins
  // listed for the same morning never crowd out a booster box.
  const featured = [...pre]
    .filter((x) => !isHalfBox(x))
    .sort(
      (a, b) =>
        kindOrder(a.kind) - kindOrder(b.kind) ||
        (a.releasedOn ?? "9999").localeCompare(b.releasedOn ?? "9999") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, COMING_UP_TILES);
  const byDate = new Map<string | null, PkTile[]>();
  for (const x of featured) byDate.set(x.releasedOn, [...(byDate.get(x.releasedOn) ?? []), x]);
  const groups = [...byDate.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([releasedOn, tiles]) => ({ releasedOn, tiles }));

  return {
    next: nextSet ? { set: nextSet, releasedOn: nextSet.releasedOn as string, days: daysUntil(nextSet.releasedOn as string, t) } : null,
    groups,
    total: pre.length,
  };
}

// ── Shop by type ──────────────────────────────────────────────────────────────

export const SHOP_KINDS: readonly PkKind[] = ["booster-box", "etb", "pc-etb", "booster-bundle", "upc", "tin"];

export interface ShopType {
  kind: PkKind;
  label: string;
  href: string;
  /** The released product of this kind with the cheapest open listing, or null. */
  from: PkTile | null;
  count: number;
}

export function shopByType(catalog: PkCatalog): ShopType[] {
  const cheapest = cheapestByKind(catalog.tiles);
  return SHOP_KINDS.map((kind) => ({
    kind,
    label: kindInfo(kind).plural,
    href: kindHref(kind),
    from: cheapest[kind] ?? null,
    count: catalog.tiles.filter((t) => t.kind === kind).length,
  }));
}

// ── Newest sets ───────────────────────────────────────────────────────────────

export interface NewestSet {
  set: PkSetSummary;
  /** Cheapest open listing of the set's booster box / ETB, pre-orders included (and flagged by `presale`). */
  box: PkTile | null;
  etb: PkTile | null;
}

export function newestSets(catalog: PkCatalog, n = 6): NewestSet[] {
  return catalog.sets.slice(0, Math.max(0, n)).map((set) => {
    const c = cheapestByKind(
      catalog.tiles.filter((t) => t.setSlug === set.slug),
      { includePresale: true },
    );
    return { set, box: c["booster-box"] ?? null, etb: c.etb ?? null };
  });
}

// ── Listed under TCGplayer's market price (US only) ───────────────────────────

export const BELOW_MARKET_ROWS = 8;
/** Under this reference a few dollars' gap is noise, not news. */
export const BELOW_MARKET_MIN_REF_CENTS = 2500;

export interface BelowMarketRow {
  tile: PkTile;
  /** Whole percent under the reference, ≥ 1. */
  pctUnder: number;
}

/**
 * Released US products whose cheapest open listing is under TCGplayer's
 * market price, by how far. US only: everywhere else that reference is a
 * conversion, and a gap against a converted figure says more about the
 * exchange rate than about the listing. Rows that round to 0% are left out.
 */
export function belowMarket(catalog: PkCatalog, market: Country): BelowMarketRow[] {
  if (market !== "US") return [];
  return catalog.tiles
    .filter(
      (t) => !t.presale && t.lowCents != null && t.refCents != null && t.refCents >= BELOW_MARKET_MIN_REF_CENTS && t.lowCents < t.refCents,
    )
    .map((t) => ({ tile: t, pctUnder: Math.round((((t.refCents as number) - (t.lowCents as number)) / (t.refCents as number)) * 100) }))
    .filter((r) => r.pctUnder >= 1)
    .sort((a, b) => b.pctUnder - a.pctUnder || a.tile.name.localeCompare(b.tile.name))
    .slice(0, BELOW_MARKET_ROWS);
}

// ── Everything at once ────────────────────────────────────────────────────────

export interface HomeModel {
  stats: HomeStats;
  perPack: PerPackGroup[];
  comingUp: ComingUp;
  shop: ShopType[];
  newest: NewestSet[];
  below: BelowMarketRow[];
}

export function buildHome(catalog: PkCatalog, market: Country, today: string | Date): HomeModel {
  return {
    stats: homeStats(catalog),
    perPack: perPackBoard(catalog, market),
    comingUp: comingUp(catalog, today),
    shop: shopByType(catalog),
    newest: newestSets(catalog),
    below: belowMarket(catalog, market),
  };
}
