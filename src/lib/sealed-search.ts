// One definition of "which sealed products match a search", shared by the
// navbar dropdown (/api/search) and the /browse results (2026-10-04, owner: "if I
// search origins and I click enter, there's no sealed products found … the
// search bar should work for sealed products as well"). /sealed keeps its own
// substring filter on its facet page; this is the free-text search.
//
// Pure: no database, no React. Takes whatever SealedGroup list the caller has
// already read (getSealedGroups() caches itself, so this adds no query).
import { SETS } from "./constants";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { editDistance, typoBudget } from "./did-you-mean";

type Searchable = { name: string; productType: string; setCode: string | null };

// "Origins: Proving Grounds Kit" -> "origins proving grounds kit". Lower case,
// accents folded, everything that is not a letter or digit becomes one space,
// so punctuation never decides a match (and "booster-box" finds "booster box").
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "boxes" -> "box", "packs" -> "pack", "origins" -> "origin" (a prefix of the
// word, so it still matches "origins"). Matching is by substring, so a stem that
// is a stub ("bundl" for "bundles") still finds "bundle".
const stem = (t: string) => (t.length > 4 && t.endsWith("es") ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

// Shoppers' shorthand (owner's UX review, 2026-11-24, P0 5: "synonyms (ETB, UPC, BB)"). A whole-word abbreviation is read
// as the words it stands for before matching. Only abbreviations a store title spells out in full.
export const SEALED_SYNONYMS: Record<string, string> = {
  bb: "booster box",
  bbox: "booster box",
  bx: "booster box",
  pg: "proving grounds",
  pgk: "proving grounds",
  etb: "elite trainer box",
  upc: "ultra premium collection",
  bp: "booster pack",
  cd: "champion deck",
};

/** The words a query is made of, folded, shorthand spelled out, stemmed. [] when there is nothing to match. */
export function sealedSearchTokens(q: string): string[] {
  return fold(q)
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => (SEALED_SYNONYMS[w] ?? w).split(" "))
    .map(stem);
}

// A word of the query that is not in the product's words may still be a typo of one ("spiritforgd", "boostr"): it
// matches a word within the same edit budget the card search's "Did you mean" uses (lib/did-you-mean.ts; none for
// three letters or fewer). Only ever a whole word against a whole word, so "box" never fuzzes into "fox".
function fuzzyIn(token: string, words: readonly string[]): boolean {
  const max = typoBudget(token.length);
  if (max === 0) return false;
  return words.some((w) => editDistance(token, stem(w), max) <= max);
}

// The set's own name, from its code: a product listed as "Booster Box (OGN)" is
// still an Origins product when the visitor types "origins".
const SET_NAME_BY_CODE = new Map(SETS.map((s) => [s.code, s.name]));

function haystack(g: Searchable): string {
  const setName = g.setCode ? SET_NAME_BY_CODE.get(g.setCode) ?? "" : "";
  return fold(`${g.name} ${g.productType} ${g.setCode ?? ""} ${setName}`);
}

/**
 * The groups whose name, product type, set code or set name contain EVERY word
 * of the query (any order), best first: the whole phrase in the name, then every
 * word in the name, then matches that lean on the set or type. Within a rank the
 * input order is kept (a stable sort), so the caller's own ordering still shows.
 */
export function matchSealedGroups<T extends Searchable>(groups: readonly T[], q: string): T[] {
  const tokens = sealedSearchTokens(q);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(" ");
  const ranked: { g: T; rank: number; at: number }[] = [];
  groups.forEach((g, at) => {
    const hay = haystack(g);
    const exact = tokens.every((t) => hay.includes(t));
    // A typo'd word ranks below every exact match (rank 3), and only when every other word matched.
    if (!exact) {
      const words = hay.split(" ");
      if (!tokens.every((t) => hay.includes(t) || fuzzyIn(t, words))) return;
      ranked.push({ g, rank: 3, at });
      return;
    }
    const name = fold(g.name);
    const rank = name.includes(phrase) ? 0 : tokens.every((t) => name.includes(t)) ? 1 : 2;
    ranked.push({ g, rank, at });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.at - b.at).map((r) => r.g);
}

/**
 * Which market's sealed prices to search, and read. A market with no sealed rows
 * of its own falls back to the default market, priced in ITS currency, the same
 * rule /sealed applies, so a UK or Singapore visitor finds the product (in
 * dollars) instead of nothing.
 */
export async function loadSealedForSearch<G>(
  country: Country,
  load: (c: Country) => Promise<G[]>,
): Promise<{ groups: G[]; priceCountry: Country }> {
  let groups = await load(country);
  let priceCountry = country;
  if (groups.length === 0 && country !== DEFAULT_COUNTRY) {
    groups = await load(DEFAULT_COUNTRY);
    priceCountry = DEFAULT_COUNTRY;
  }
  return { groups, priceCountry };
}
