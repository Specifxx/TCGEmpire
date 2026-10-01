// Building the Pokémon sealed catalogue from TCGplayer's public data, as
// mirrored daily by TCGCSV (https://tcgcsv.com, category 3 = English Pokémon).
// Pure: the importer (lib/pokemon/import.ts) fetches, this decides. Every rule
// here is pinned in tests/pokemon-catalog.test.ts against real titles.
//
// WHY TCGCSV AND NOT mp-search-api (what lib/tcgplayer.ts uses for Riftbound):
// one static JSON per expansion, no pagination, no browser-impersonating
// headers, and the Pokémon category is English-only by construction, so the
// "cheapest English listing" filter lib/tcgplayer.ts needs is not needed here.

import { classifyPokemonSealed, type PkKind } from "./kinds";
import { packCount } from "./packs";

// ── TCGCSV payload shapes (only the fields we read) ──────────────────────────
export interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn: string;
}
export interface TcgcsvProduct {
  productId: number;
  name: string;
  imageUrl: string;
  groupId: number;
  url: string;
  presaleInfo?: { isPresale: boolean; releasedOn: string | null } | null;
  extendedData?: { name: string; value: string }[];
}
export interface TcgcsvPrice {
  productId: number;
  lowPrice: number | null;
  marketPrice: number | null;
  subTypeName: string;
}

export const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer/3";

// ── Scope ─────────────────────────────────────────────────────────────────────
// Sword & Shield onward (2020-02-07): the sealed people still buy and resell.
// Widening it is a data change here, nothing else.
export type PkSeries = "Mega Evolution" | "Scarlet & Violet" | "Sword & Shield";
export const SERIES_ORDER: readonly PkSeries[] = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield"];

const SERIES_PREFIX: [RegExp, PkSeries][] = [
  [/^ME\d*:\s*/, "Mega Evolution"],
  [/^SV\d*:\s*/, "Scarlet & Violet"],
  [/^SWSH\d*:\s*/, "Sword & Shield"],
];
// Expansions TCGplayer files without a series prefix.
const UNPREFIXED_SETS: Record<string, PkSeries> = {
  Celebrations: "Sword & Shield",
  "Pokemon GO": "Sword & Shield",
  "Shining Fates": "Sword & Shield",
  "Champion's Path": "Sword & Shield",
  "First Partner Collection 2026": "Mega Evolution",
};
// Groups holding sealed products that are not an expansion: their products
// join the catalogue with no set ("Collections & other products").
export const MISC_GROUP_NAMES = new Set(["Miscellaneous Cards & Products"]);
const SETLESS_GROUP = /^(?:Trick or Trade BOOster Bundle|Battle Academy 20\d\d|My First Battle|Trading Card Game Classic)/;
// Card-only sub-groups that share a prefix with a real expansion.
const NOT_A_SET = /promo|trainer gallery|galarian gallery|shiny vault|classic collection|energies/i;

export const SCOPE_START = "2020-02-07";

export function seriesForDate(isoDay: string | null | undefined): PkSeries | null {
  if (!isoDay) return null;
  const d = isoDay.slice(0, 10);
  if (d >= "2025-09-26") return "Mega Evolution";
  if (d >= "2023-03-31") return "Scarlet & Violet";
  if (d >= SCOPE_START) return "Sword & Shield";
  return null;
}

export type GroupRole =
  // `main`: a numbered expansion ("ME02:", "SV05:", "SWSH07:"), not a special set.
  | { role: "set"; series: PkSeries; name: string; main: boolean }
  | { role: "setless" }
  | { role: "misc" }
  | null;

/** What a TCGplayer group is to the catalogue, or null when out of scope. */
export function groupRole(g: Pick<TcgcsvGroup, "name" | "publishedOn">): GroupRole {
  if (MISC_GROUP_NAMES.has(g.name)) return { role: "misc" };
  if (SETLESS_GROUP.test(g.name)) return seriesForDate(g.publishedOn) ? { role: "setless" } : null;
  if (NOT_A_SET.test(g.name)) return null;
  for (const [re, series] of SERIES_PREFIX) {
    if (re.test(g.name)) return { role: "set", series, name: g.name.replace(re, "").trim(), main: /^(?:ME|SV|SWSH)\d+:/.test(g.name) };
  }
  const special = UNPREFIXED_SETS[g.name];
  if (special) return { role: "set", series: special, name: g.name, main: false };
  return null;
}

// ── Names, slugs, contents ────────────────────────────────────────────────────
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

/** TCGplayer writes "Pokemon"; the brand is Pokémon. Display only, never matching. */
export function displayName(name: string): string {
  return name.replace(/\bPokemon\b/g, "Pokémon").replace(/\s+/g, " ").trim();
}

function isSealedProduct(p: TcgcsvProduct): boolean {
  return !(p.extendedData ?? []).some((e) => e.name === "Number" || e.name === "Rarity");
}

/**
 * "What's inside" — the listing's own bullet list, one fact per line, never
 * its marketing paragraph (that copy is the publisher's, and every store
 * repeats it). Falls back to a single "Includes …" sentence.
 */
export function parseContents(cardText: string | undefined | null): string[] {
  if (!cardText) return [];
  const text = cardText
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;| /g, " ")
    .replace(/\r/g, "");
  const clean = (l: string) => l.replace(/\s+/g, " ").trim();
  const bullets = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[•●▪*-]\s*/.test(l))
    .map((l) => clean(l.replace(/^[•●▪*-]\s*/, "")))
    .filter((l) => l.length > 2 && l.length <= 200);
  if (bullets.length) return bullets.slice(0, 14);
  const inc = /\bIncludes?\s+([^.\n]{4,200})\./i.exec(text);
  return inc ? [clean(inc[1]).replace(/^./, (c) => c.toUpperCase())] : [];
}

function upcOf(p: TcgcsvProduct): string | null {
  const v = (p.extendedData ?? []).find((e) => e.name === "UPC")?.value?.replace(/[^0-9]/g, "");
  return v && v.length >= 8 ? v : null;
}

/** 200px thumbnail → TCGplayer's 1000px rendition (what lib/tcgplayer.ts uses). */
export function largeImage(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
}

// ── The build ─────────────────────────────────────────────────────────────────
export interface CatalogSet {
  id: number;
  slug: string;
  name: string;
  code: string | null;
  series: PkSeries;
  releasedOn: string | null; // YYYY-MM-DD
}
export interface CatalogProduct {
  id: number;
  name: string;
  slugBase: string;
  setId: number | null;
  groupId: number;
  kind: PkKind;
  series: PkSeries;
  imageUrl: string | null;
  tcgplayerUrl: string;
  releasedOn: string | null;
  presale: boolean;
  contents: string[];
  upc: string | null;
  /** Booster packs inside (lib/pokemon/packs.ts), null when not knowable. */
  packCount: number | null;
  packCountFrom: "contents" | "name" | null;
}
export interface CatalogPrice {
  productId: number;
  lowCents: number | null; // cheapest listing (item price)
  marketCents: number | null; // TCGplayer market price
}
export interface CatalogBuild {
  sets: CatalogSet[];
  products: CatalogProduct[];
  prices: CatalogPrice[];
  /** Products seen but excluded, by reason — the importer logs it. */
  skipped: Record<string, number>;
}

const toCents = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;

/**
 * A TCGplayer "low" under 30% of its own market price on sealed is a damaged or
 * mis-listed box far more often than a deal, and it would become the headline
 * price. Dropped (the market price still shows as a reference).
 */
export function plausibleLow(lowCents: number | null, marketCents: number | null): number | null {
  if (lowCents == null) return null;
  if (marketCents != null && lowCents < marketCents * 0.3) return null;
  return lowCents;
}

export function buildCatalog(
  groups: TcgcsvGroup[],
  productsByGroup: Map<number, TcgcsvProduct[]>,
  pricesByGroup: Map<number, TcgcsvPrice[]>,
): CatalogBuild {
  const sets: CatalogSet[] = [];
  const products: CatalogProduct[] = [];
  const prices: CatalogPrice[] = [];
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const seen = new Set<number>();

  for (const g of groups) {
    const role = groupRole(g);
    const list = productsByGroup.get(g.groupId);
    if (!role || !list) continue;
    const setProducts: CatalogProduct[] = [];
    let earliest: string | null = null;

    for (const p of list) {
      if (!isSealedProduct(p)) continue;
      if (seen.has(p.productId)) continue;
      const kind = classifyPokemonSealed(p.name);
      if (!kind) {
        skip("out-of-scope kind");
        continue;
      }
      const released = p.presaleInfo?.releasedOn?.slice(0, 10) ?? null;
      let series: PkSeries | null;
      if (role.role === "set") series = role.series;
      else series = seriesForDate(released);
      if (!series) {
        skip("before scope");
        continue;
      }
      seen.add(p.productId);
      if (released && (!earliest || released < earliest)) earliest = released;
      const contents = parseContents((p.extendedData ?? []).find((e) => e.name === "CardText")?.value);
      const packs = packCount({ name: p.name, kind, contents, mainExpansion: role.role === "set" && role.main });
      setProducts.push({
        id: p.productId,
        name: displayName(p.name),
        slugBase: slugify(p.name),
        setId: role.role === "set" ? g.groupId : null,
        groupId: g.groupId,
        kind,
        series,
        imageUrl: p.imageUrl ? largeImage(p.productId) : null,
        tcgplayerUrl: p.url || `https://www.tcgplayer.com/product/${p.productId}`,
        releasedOn: released,
        presale: Boolean(p.presaleInfo?.isPresale),
        contents,
        upc: upcOf(p),
        packCount: packs?.count ?? null,
        packCountFrom: packs?.from ?? null,
      });
    }
    if (!setProducts.length) continue;
    products.push(...setProducts);
    if (role.role === "set") {
      sets.push({
        id: g.groupId,
        slug: slugify(role.name),
        name: displayName(role.name),
        code: g.abbreviation?.trim() || null,
        series: role.series,
        releasedOn: g.publishedOn ? g.publishedOn.slice(0, 10) : earliest,
      });
    }
    const ids = new Set(setProducts.map((p) => p.id));
    for (const pr of pricesByGroup.get(g.groupId) ?? []) {
      if (!ids.has(pr.productId)) continue;
      const marketCents = toCents(pr.marketPrice);
      prices.push({ productId: pr.productId, lowCents: plausibleLow(toCents(pr.lowPrice), marketCents), marketCents });
    }
  }
  return { sets, products, prices, skipped };
}

/**
 * Stable, unique slugs. A product keeps the slug it was first given (`existing`,
 * from the database) forever; a new product takes its name's slug, or the slug
 * plus its TCGplayer id when that is already taken.
 */
export function assignSlugs(
  products: { id: number; slugBase: string }[],
  existing: Map<number, string>,
): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>(existing.values());
  for (const [id, slug] of existing) out.set(id, slug);
  // Deterministic: lowest id wins a contested base slug.
  for (const p of [...products].sort((a, b) => a.id - b.id)) {
    if (out.has(p.id)) continue;
    const base = p.slugBase || `product-${p.id}`;
    const slug = taken.has(base) ? `${base}-${p.id}` : base;
    taken.add(slug);
    out.set(p.id, slug);
  }
  return out;
}

/** Set slugs, made unique the same way (two groups can share a display name). */
export function assignSetSlugs(sets: CatalogSet[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>();
  for (const s of [...sets].sort((a, b) => a.id - b.id)) {
    const slug = taken.has(s.slug) ? `${s.slug}-${s.id}` : s.slug;
    taken.add(slug);
    out.set(s.id, slug);
  }
  return out;
}
