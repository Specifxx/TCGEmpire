// Filtering, sorting and paging the Pokémon grid — the /pokemon/sealed page's
// rules, pure so tests/pokemon-browse.test.ts can pin them. The page itself
// only parses searchParams and renders.

import { gbpCentsToEur } from "../fx";
import { foldName, isPkKind, kindOrder } from "./kinds";
import { perPackCents } from "./packs";
import type { PkTile } from "./types";

export const PAGE_SIZE = 48;
/** The set filter's value for products outside any expansion. */
export const SETLESS = "other";

export interface BrowseQuery {
  q: string;
  kinds: string[];
  sets: string[];
  minCents: number | null;
  maxCents: number | null;
  inStock: boolean;
  sort: string;
  page: number;
}

type Raw = string | string[] | undefined;
const one = (v: Raw) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const csv = (v: Raw) =>
  one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const money = (v: Raw) => {
  const n = parseFloat(one(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export const SORTS = [
  { value: "", label: "Sort: Featured" },
  { value: "release", label: "Newest release" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name: A–Z" },
] as const;

export function parseBrowse(sp: Record<string, Raw>): BrowseQuery {
  const page = Math.max(1, Math.min(500, parseInt(one(sp.page), 10) || 1));
  const sort = one(sp.sort);
  return {
    q: one(sp.q).trim().slice(0, 80),
    kinds: csv(sp.type).filter(isPkKind),
    sets: csv(sp.set).slice(0, 40),
    minCents: money(sp.min),
    maxCents: money(sp.max),
    inStock: one(sp.instock) === "1",
    sort: SORTS.some((s) => s.value === sort) ? sort : "",
    page,
  };
}

export function isFiltered(q: BrowseQuery): boolean {
  return Boolean(q.q || q.kinds.length || q.sets.length || q.minCents != null || q.maxCents != null || q.inStock);
}

/** Every word of the query must appear in the product's name, set or kind. */
function matchesQuery(t: PkTile, words: string[]): boolean {
  if (!words.length) return true;
  const hay = foldName(`${t.name} ${t.setName ?? ""} ${t.kind.replace(/-/g, " ")}`);
  return words.every((w) => hay.includes(w));
}

export function filterTiles(tiles: readonly PkTile[], q: BrowseQuery): PkTile[] {
  const words = foldName(q.q).split(/\s+/).filter(Boolean);
  return tiles.filter(
    (t) =>
      (!q.kinds.length || q.kinds.includes(t.kind)) &&
      (!q.sets.length || q.sets.includes(t.setSlug ?? SETLESS)) &&
      (!q.inStock || t.lowCents != null) &&
      (q.minCents == null || (t.lowCents != null && t.lowCents >= q.minCents)) &&
      (q.maxCents == null || (t.lowCents != null && t.lowCents <= q.maxCents)) &&
      matchesQuery(t, words),
  );
}

const releaseKey = (t: PkTile) => t.releasedOn ?? "";

/**
 * Featured: newest release first, then the box-shaped kinds before packs and
 * blisters, then cheapest. Unpriced products sort after priced ones in every
 * price order, never first.
 */
export function sortTiles(tiles: readonly PkTile[], sort: string): PkTile[] {
  const list = [...tiles];
  const priceAsc = (a: PkTile, b: PkTile) => (a.lowCents ?? Infinity) - (b.lowCents ?? Infinity);
  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => priceAsc(a, b) || a.name.localeCompare(b.name));
    case "price_desc":
      return list.sort((a, b) => (b.lowCents ?? -1) - (a.lowCents ?? -1) || a.name.localeCompare(b.name));
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "release":
      return list.sort((a, b) => releaseKey(b).localeCompare(releaseKey(a)) || a.name.localeCompare(b.name));
    default:
      return list.sort(
        (a, b) =>
          releaseKey(b).localeCompare(releaseKey(a)) ||
          kindOrder(a.kind) - kindOrder(b.kind) ||
          priceAsc(a, b) ||
          a.name.localeCompare(b.name),
      );
  }
}

export function pageOf<T>(list: readonly T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: list.slice((p - 1) * size, p * size), page: p, pages };
}

/**
 * The UK market's GBP figures shown in euros for a visitor who asked for that
 * (lib/get-country.ts getDisplayCurrency), exactly as /sealed converts them.
 */
export function toDisplay(tiles: readonly PkTile[], showEur: boolean): PkTile[] {
  if (!showEur) return [...tiles];
  return tiles.map((t) => ({
    ...t,
    lowCents: t.lowCents != null ? gbpCentsToEur(t.lowCents) : null,
    refCents: t.refCents != null ? gbpCentsToEur(t.refCents) : null,
    // From the converted listing, never the pound figure converted on its own:
    // otherwise the shown price ÷ packs and the shown per-pack differ by a cent.
    perPackCents: t.lowCents != null ? perPackCents(gbpCentsToEur(t.lowCents), t.packCount) : null,
  }));
}

/** The search-result title's fixed tail; the query is clamped so the whole title fits in 60. */
export const SEARCH_TITLE_TAIL = ": Pokémon sealed prices";
const TITLE_LIMIT = 60;

/** "151 booster bundle: Pokémon sealed prices", the query cut at a word with "…" when it would run past 60. */
export function searchTitle(q: string): string {
  const room = TITLE_LIMIT - SEARCH_TITLE_TAIL.length;
  const query = q.replace(/\s+/g, " ").trim();
  if (query.length <= room) return `${query}${SEARCH_TITLE_TAIL}`;
  const cut = query.slice(0, room - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > room / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…${SEARCH_TITLE_TAIL}`;
}

/**
 * Canonical and robots for a /pokemon/sealed view. The clean first page is
 * the one indexable view. Pages 2+ of the clean list are their own canonical
 * (each lists different products) but noindex, follow, so crawlers reach the
 * products without the pages competing with page one. A filtered, searched or
 * sorted view is noindex, follow and canonical to the clean page.
 */
export function sealedIndexing(q: BrowseQuery): { path: string; noindex: boolean } {
  if (isFiltered(q) || q.sort) return { path: "/pokemon/sealed", noindex: true };
  if (q.page > 1) return { path: `/pokemon/sealed?page=${q.page}`, noindex: true };
  return { path: "/pokemon/sealed", noindex: false };
}
