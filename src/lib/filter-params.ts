// The URL rules the filter panels share: the card panel (components/Filters.tsx,
// on /browse, /sets/[set] and /price-guide), the sealed panel
// (components/SealedFilters.tsx, on /sealed and /pokemon/sealed) and the chip
// row above the results (components/ActiveFilters.tsx). Pure and router-free,
// so tests/filter-search.test.ts pins them directly.

/**
 * The longest keyword the panels' search box sends. /pokemon/sealed reads at
 * most 80 characters of `q` (lib/pokemon/browse.ts parseBrowse), so a longer
 * one would be cut there without the visitor seeing it; no card or product
 * name comes near it.
 */
export const KEYWORD_MAX = 80;

/**
 * Apply the panel's keyword box to a query string: `q` becomes the trimmed
 * text (empty removes it), every other parameter is kept, so the words narrow
 * whatever filters are already ticked (AND), and `page` goes, because a new
 * search starts at page 1. It is the same `q` the header search sets, so on
 * /browse it is the same metered search (lib/search-quota.ts): the page
 * meters a `q` on its first page whatever wrote it.
 */
export function applyKeyword(p: URLSearchParams, text: string): void {
  const v = text.trim();
  if (v) p.set("q", v);
  else p.delete("q");
  p.delete("page");
}

/**
 * What "Clear" keeps, in a panel and in the chip row alike: the search and
 * the order. `q` is the visitor's search, not one of the facets: it gets no
 * chip and no count, and clearing the facets leaves it in place (the chip
 * row's "Clear all" always did; the card panel's "Clear" dropped it until
 * 2026-10-19). The search box's own Clear button is how a search is removed.
 */
export const KEPT_ON_CLEAR = ["q", "sort"] as const;

/** The query string after "Clear": every filter gone, the search and the order kept. */
export function clearedFilters(current: string): URLSearchParams {
  const from = new URLSearchParams(current);
  const next = new URLSearchParams();
  for (const k of KEPT_ON_CLEAR) {
    const v = from.get(k);
    if (v) next.set(k, v);
  }
  return next;
}

/** `basePath`, with the query string when there is one. */
export function hrefWith(basePath: string, p: URLSearchParams): string {
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
