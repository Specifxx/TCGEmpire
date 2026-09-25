// Every link on /tools/deal-finder — the Buy-from presets, the store picker's
// Apply, the sort tabs, the pager and the "Only my cards" chips — is built by
// hrefFor() below, from ONE parsed parameter set. Client-safe (no server
// imports), so the store picker (components/ArbitrageFilters.tsx) builds its URL
// the same way the server page does.
//
// Why one builder (2026-09-25): until then each control assembled its own query
// string, and the "Worth more on eBay" tab's pager, sort tabs and store filter
// all left out view=flip. After the default view changed on 2026-09-21 every one
// of those clicks moved a paying member to a different tab, and nobody noticed
// for four days. A control can only drop a parameter now by passing an explicit
// patch for it; everything else is carried from the current URL.
import type { ArbSort } from "./arbitrage";

export const DEAL_FINDER_PATH = "/tools/deal-finder";

/** "Only my cards": the watchlist, or the binder (the portfolio's collection). */
export type MineFilter = "watch" | "own";

export interface DealFinderParams {
  /** Explicit buy-side keys, or null when the URL has none (= the market's default). */
  buy: string[] | null;
  sort: ArbSort;
  page: number;
  /** Honoured only for Plus+ members — parseDealFinderParams drops it otherwise. */
  mine: MineFilter | null;
}

// A repeated key (?buy=a&buy=b) arrives from Next as an array; the first wins.
type Param = string | string[] | undefined;
export type DealFinderSearchParams = { buy?: Param; sort?: Param; page?: Param; mine?: Param; view?: Param };
const one = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Parse the page's search params. `allowMine` is isPremium(user): a free or
 * signed-out visitor's ?mine= is ignored rather than honoured or refused.
 * `ebayKey` maps the retired ?view=deals ("Cheapest on eBay") onto its
 * replacement, the eBay-only preset; ?view=flip and ?view=xregion (the cut tabs)
 * simply land on the default list.
 */
export function parseDealFinderParams(
  sp: DealFinderSearchParams,
  opts: { allowMine: boolean; ebayKey: string | null },
): DealFinderParams {
  const raw = { buy: one(sp.buy), sort: one(sp.sort), page: one(sp.page), mine: one(sp.mine), view: one(sp.view) };
  // !== undefined, not a truthy check: `buy=` (the explicit "None" selection)
  // parses to [], which must NOT fall back to the default list — only a param
  // that is genuinely absent (first visit, no filter touched) does.
  let buy: string[] | null = raw.buy !== undefined ? raw.buy.split(",").map((s) => s.trim()).filter(Boolean) : null;
  if (buy === null && raw.view === "deals" && opts.ebayKey) buy = [opts.ebayKey];
  // "margin" / "profit" are the pre-2026-09-25 values; old links keep working.
  const sort: ArbSort = raw.sort === "pct" || raw.sort === "margin" ? "pct" : "saving";
  const page = Math.max(1, parseInt(raw.page ?? "1", 10) || 1);
  const mine = opts.allowMine && (raw.mine === "watch" || raw.mine === "own") ? raw.mine : null;
  return { buy, sort, page, mine };
}

/**
 * The URL for the current parameters with `patch` applied. Defaults are left
 * out (no buy = default sources, sort=saving, page=1, no mine) so the canonical
 * URL stays /tools/deal-finder. A control that changes what the list contains
 * (sources, sort, mine) should patch page: 1 as well.
 */
export function hrefFor(params: DealFinderParams, patch: Partial<DealFinderParams> = {}): string {
  const p: DealFinderParams = { ...params, ...patch };
  const q: string[] = [];
  // Keys are retailer slugs ([a-z0-9_]); encoded anyway so a crafted URL
  // round-trips rather than breaking the query string.
  if (p.buy !== null) q.push(`buy=${p.buy.map(encodeURIComponent).join(",")}`);
  if (p.sort !== "saving") q.push(`sort=${p.sort}`);
  if (p.mine) q.push(`mine=${p.mine}`);
  if (p.page > 1) q.push(`page=${p.page}`);
  return q.length ? `${DEAL_FINDER_PATH}?${q.join("&")}` : DEAL_FINDER_PATH;
}
