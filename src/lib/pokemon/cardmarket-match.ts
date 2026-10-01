// Matching Cardmarket's Pokémon sealed catalogue to ours. Pure.
//
// Cardmarket publishes its catalogue and a daily EUR price guide as public
// files (game id 6 = Pokémon), the same files lib/cardmarket.ts reads for
// Riftbound (game 22). OFF unless POKEMON_CARDMARKET=1: the owner's Cardmarket
// data permission (lib/cardmarket.ts header, 2026-09-04) was asked and given
// for Riftbound, so Pokémon waits on the same question (docs/pokemon/README.md).
//
// The names differ in shape, not substance:
//   TCGplayer   "Phantasmal Flames Premium Checklane Blister [Blaziken]"
//   Cardmarket  "Phantasmal Flames: Blaziken Premium Checklane Blister"
// so both reduce to a KEY: the product kind plus the set of words that are not
// generic packaging words. Equal keys match; otherwise the closest key above
// 0.8 Jaccard does, when it is the only one that close. Anything ambiguous is
// left unmatched (tests/pokemon-cardmarket.test.ts).

import { classifyPokemonSealed, foldName, type PkKind } from "./kinds";

export const CARDMARKET_POKEMON_GAME = 6;
export const CM_NONSINGLES_URL = `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_${CARDMARKET_POKEMON_GAME}.json`;
export const CM_PRICEGUIDE_URL = `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${CARDMARKET_POKEMON_GAME}.json`;

export interface CmProduct {
  idProduct: number;
  name: string;
  idExpansion: number;
}
export interface CmPrice {
  idProduct: number;
  low: number | null;
  trend: number | null;
}

const GENERIC = new Set([
  "pokemon", "tcg", "the", "and", "of", "a", "booster", "boosters", "box", "boxes", "pack", "packs", "collection", "elite",
  "trainer", "etb", "bundle", "premium", "ultra", "super", "center", "exclusive", "international", "version", "tin",
  "tins", "blister", "deck", "decks", "with", "edition",
]);

export function cmKey(name: string): { kind: PkKind | null; words: Set<string> } {
  const kind = classifyPokemonSealed(name);
  const words = new Set(
    foldName(name)
      .replace(/&/g, " ")
      // "1-Pack" and "Single Pack" are the same blister, and Cardmarket's
      // "Booster Box (18 Boosters)" is TCGplayer's "Half Booster Box".
      .replace(/\bsingle pack\b/g, "1 pack")
      .replace(/\(18 boosters?\)/g, " half ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !GENERIC.has(w)),
  );
  return { kind, words };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

const sameWords = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((w) => b.has(w));

/**
 * Our product id → Cardmarket idProduct. A Cardmarket product claimed by two of
 * ours is dropped for both: one wrong price is worse than two missing ones.
 */
export function matchCardmarket(
  ours: readonly { id: number; name: string; kind: PkKind }[],
  theirs: readonly CmProduct[],
): Map<number, number> {
  const byKind = new Map<PkKind, { id: number; words: Set<string> }[]>();
  for (const p of theirs) {
    const { kind, words } = cmKey(p.name);
    if (!kind || !words.size) continue;
    const list = byKind.get(kind) ?? [];
    list.push({ id: p.idProduct, words });
    byKind.set(kind, list);
  }
  const claims = new Map<number, number[]>();
  for (const o of ours) {
    const { words } = cmKey(o.name);
    const pool = byKind.get(o.kind) ?? [];
    if (!words.size || !pool.length) continue;
    const exact = pool.filter((c) => sameWords(c.words, words));
    let pick: number | null = exact.length === 1 ? exact[0].id : null;
    if (exact.length === 0) {
      const scored = pool
        .map((c) => ({ id: c.id, s: jaccard(c.words, words) }))
        .filter((c) => c.s >= 0.8)
        .sort((a, b) => b.s - a.s);
      if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) pick = scored[0].id;
    }
    if (pick != null) claims.set(pick, [...(claims.get(pick) ?? []), o.id]);
  }
  const out = new Map<number, number>();
  for (const [cm, ourIds] of claims) if (ourIds.length === 1) out.set(ourIds[0], cm);
  return out;
}

/** Low is dropped when it is under 30% of the trend, the TCGplayer rule (catalog.ts plausibleLow). */
export function cmFigures(p: CmPrice | undefined): { lowCents: number | null; trendCents: number | null } {
  const c = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? Math.round(v * 100) : null);
  const trendCents = c(p?.trend);
  let lowCents = c(p?.low);
  if (lowCents != null && trendCents != null && lowCents < trendCents * 0.3) lowCents = null;
  return { lowCents, trendCents };
}

export function cardmarketPokemonUrl(idProduct: number): string {
  // The id dispatcher, never /Products/Singles (lib/cardmarket-url.ts explains why).
  return `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${idProduct}`;
}
