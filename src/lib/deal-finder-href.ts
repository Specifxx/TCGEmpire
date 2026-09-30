// Every link on /tools/deal-finder — the view tabs, the store picker's Apply,
// the sort tabs, the pager and the "Only my cards" chips — is built by
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
//
// THREE VIEWS (2026-09-30, DECISIONS.md "Deal Finder: three views"). ?view= picks
// one; the default ("tcg", no param) is "Underpriced vs TCGplayer". Each view
// carries only the parameters it uses, and canonical() below is applied on the
// way IN (parse) and on the way OUT (hrefFor), so a link always round-trips:
//
//   tcg      buy, sort, mine, page   (the store picker, sort tabs, Only my cards)
//   vs-ebay  sort, mine, page        (no store picker: its store side is fixed)
//   ebay     page                    (free for everyone; no picker, sort or mine)
import type { ArbSort } from "./arbitrage";

export const DEAL_FINDER_PATH = "/tools/deal-finder";

/** "Only my cards": the watchlist, or the binder (the portfolio's collection). */
export type MineFilter = "watch" | "own";

/**
 * tcg — "Underpriced vs TCGplayer" (the default, no ?view=).
 * ebay — "Cheapest on eBay" (?view=ebay): an eBay listing beats every store we track.
 * vs-ebay — "Underpriced vs eBay" (?view=vs-ebay): a store beats the cheapest eBay listing.
 */
export type DealFinderView = "tcg" | "ebay" | "vs-ebay";
export const DEAL_FINDER_VIEWS: readonly DealFinderView[] = ["tcg", "ebay", "vs-ebay"];

export interface DealFinderParams {
  view: DealFinderView;
  /** Explicit buy-side keys, or null when the URL has none (= the market's default). "tcg" only. */
  buy: string[] | null;
  sort: ArbSort;
  page: number;
  /** Honoured only for Plus+ members — parseDealFinderParams drops it otherwise. Not on "ebay". */
  mine: MineFilter | null;
}

// A repeated key (?buy=a&buy=b) arrives from Next as an array; the first wins.
type Param = string | string[] | undefined;
export type DealFinderSearchParams = { buy?: Param; sort?: Param; page?: Param; mine?: Param; view?: Param };
const one = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Pure: drop what the view does not use, so a URL never carries a dead parameter. */
function canonical(p: DealFinderParams): DealFinderParams {
  if (p.view === "ebay") return { view: "ebay", buy: null, sort: "saving", page: p.page, mine: null };
  if (p.view === "vs-ebay") return { ...p, buy: null };
  return p;
}

/** Pure: a raw ?view= value as a view. Unknown and retired values land on the default. */
export function parseView(raw: string | undefined): DealFinderView {
  // ?view=deals was the "Cheapest on eBay" tab until 2026-09-25, then the
  // eBay-only preset of the one list; since 2026-09-30 it is that tab again.
  if (raw === "ebay" || raw === "deals") return "ebay";
  if (raw === "vs-ebay") return "vs-ebay";
  // ?view=flip and ?view=xregion (tabs cut on 2026-09-25) and anything else.
  return "tcg";
}

/**
 * Parse the page's search params. `allowMine` is isPremium(user): a free or
 * signed-out visitor's ?mine= is ignored rather than honoured or refused.
 */
export function parseDealFinderParams(sp: DealFinderSearchParams, opts: { allowMine: boolean }): DealFinderParams {
  const raw = { buy: one(sp.buy), sort: one(sp.sort), page: one(sp.page), mine: one(sp.mine), view: one(sp.view) };
  const view = parseView(raw.view);
  // !== undefined, not a truthy check: `buy=` (the explicit "None" selection)
  // parses to [], which must NOT fall back to the default list — only a param
  // that is genuinely absent (first visit, no filter touched) does.
  const buy: string[] | null = raw.buy !== undefined ? raw.buy.split(",").map((s) => s.trim()).filter(Boolean) : null;
  // "margin" / "profit" are the pre-2026-09-25 values; old links keep working.
  const sort: ArbSort = raw.sort === "pct" || raw.sort === "margin" ? "pct" : "saving";
  const page = Math.max(1, parseInt(raw.page ?? "1", 10) || 1);
  const mine = opts.allowMine && (raw.mine === "watch" || raw.mine === "own") ? raw.mine : null;
  return canonical({ view, buy, sort, page, mine });
}

/**
 * The URL for the current parameters with `patch` applied. Defaults are left
 * out (default view, no buy = default sources, sort=saving, page=1, no mine) so
 * the canonical URL stays /tools/deal-finder. A control that changes what the
 * list contains (view, sources, sort, mine) should patch page: 1 as well.
 */
export function hrefFor(params: DealFinderParams, patch: Partial<DealFinderParams> = {}): string {
  const p = canonical({ ...params, ...patch });
  const q: string[] = [];
  if (p.view !== "tcg") q.push(`view=${p.view}`);
  // Keys are retailer slugs ([a-z0-9_]); encoded anyway so a crafted URL
  // round-trips rather than breaking the query string.
  if (p.buy !== null) q.push(`buy=${p.buy.map(encodeURIComponent).join(",")}`);
  if (p.sort !== "saving") q.push(`sort=${p.sort}`);
  if (p.mine) q.push(`mine=${p.mine}`);
  if (p.page > 1) q.push(`page=${p.page}`);
  return q.length ? `${DEAL_FINDER_PATH}?${q.join("&")}` : DEAL_FINDER_PATH;
}
