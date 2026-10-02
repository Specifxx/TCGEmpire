import { normalizeSearch } from "./format";

// "Did you mean?" for the header search (2026-10-02, Reddit feedback). PURE.
//
// The typeahead matches a normalised substring (lib/cards.ts buildCardWhere),
// so "kaisa" already finds "Kai'Sa"; what it cannot survive is a TYPO —
// "jinz", "vaybe", "ahry". When a query returns nothing, the route runs this
// over the card names it already has cached (the price guide's catalogue, no
// new database read) and offers up to three names within a small edit
// distance. It suggests NAMES to search for, never a printing, and never
// claims a card exists that is not in the catalogue.

/** Levenshtein distance, bounded: returns max+1 as soon as it cannot be ≤ max. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How many edits a query of this length may be off by. */
export function typoBudget(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3;
}

/**
 * Up to `limit` distinct card names close to `query`, closest first. A name
 * is compared whole, by its champion half ("Shen" of "Shen, Eye of
 * Twilight"), and by its prefix of the query's length, so a typo in the
 * first word of a long name still lands.
 */
export function didYouMean(query: string, names: readonly string[], limit = 3): string[] {
  const q = normalizeSearch(query);
  const budget = typoBudget(q.length);
  if (budget === 0) return [];
  const best = new Map<string, number>();
  for (const name of new Set(names)) {
    const full = normalizeSearch(name);
    const head = normalizeSearch(name.split(",")[0]);
    const d = Math.min(
      editDistance(q, full, budget),
      editDistance(q, head, budget),
      editDistance(q, full.slice(0, q.length), budget),
    );
    if (d === 0 || d > budget) continue; // 0 would have matched already
    const prev = best.get(name);
    if (prev == null || d < prev) best.set(name, d);
  }
  return [...best.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([n]) => n);
}
