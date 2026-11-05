// The /sealed page's market view, computed on the server for ANY market (2026-11-05,
// DECISIONS.md "The sealed page becomes one CDN copy per URL"). The page renders the
// baseline market (DEFAULT_COUNTRY, the US) into its HTML and keeps it at Vercel's CDN;
// the client island (components/SealedMarketBoard.tsx) asks /api/sealed-view for the
// visitor's market when it differs, which the CDN also keeps. Both call this, so the
// filters, the sort and the sold-out mark are computed in exactly one place, from the
// same cached getSealedGroups() read the page always made (never a second loader
// nested in another cache: egress rule 6).
//
// Server-only: it reads the sealed loader. The result is JSON-safe (firstSeenAt is an
// ISO string or null) because the API route sends it over fetch.
import { getSealedGroups, type SealedGroup } from "./sealed-import";
import { soldOutEverywhere } from "./sealed-offers";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { newestReleasedSet } from "./constants";

export interface SealedParams {
  q?: string | string[];
  type?: string | string[];
  set?: string | string[];
  min?: string | string[];
  max?: string | string[];
  instock?: string | string[];
  atmsrp?: string | string[];
  sort?: string | string[];
}
export const SEALED_PARAM_KEYS = ["q", "type", "set", "min", "max", "instock", "atmsrp", "sort"] as const;

export const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const csvParam = (v?: string | string[]) => one(v).split(",").map((s) => s.trim()).filter(Boolean);
export const isFilteredParams = (sp: SealedParams) =>
  Boolean(one(sp.q) || one(sp.type) || one(sp.set) || one(sp.min) || one(sp.max) || one(sp.instock) || one(sp.atmsrp));

/** The query the island repeats to /api/sealed-view: only the page's own keys, only when set. */
export function sealedQuery(sp: SealedParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SEALED_PARAM_KEYS) {
    const v = one(sp[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** A group as the island and the tiles see it: the loader's group with a JSON-safe firstSeenAt. */
export type SealedViewGroup = Omit<SealedGroup, "firstSeenAt"> & { firstSeenAt: string | null };

export interface SealedView {
  /** The market asked for. */
  country: Country;
  /** The market whose listings are shown: `country`, or the default market when it has none. */
  priceCountry: Country;
  usingFallback: boolean;
  /** Filtered and sorted, in the order the page shows them. Prices in priceCountry's currency. */
  groups: SealedViewGroup[];
  /** groupKeys of products every store we track says are sold out. */
  soldOutKeys: string[];
  typeOptions: string[];
  setOptions: { code: string; name: string }[];
  isFiltered: boolean;
  /** The newest released set's code when its sealed is in this market's feed and the view is unfiltered. */
  featuredSetCode: string | null;
}

export async function buildSealedView(country: Country, searchParams: SealedParams): Promise<SealedView> {
  // Sealed data is sourced per market (AU stores + US TCGplayer). For a market
  // with no rows of its own (e.g. UK), fall back to the default market so the page
  // is never blank — and price it in that market's currency so the currency stays
  // honest.
  //
  // The fallback was AU, chosen when AU was the default market. US is now both the
  // default AND the market with the broadest sealed coverage (TCGplayer), so an
  // unserved visitor lands somewhere fuller rather than in AUD for no reason.
  let all = await getSealedGroups(country);
  let priceCountry = country;
  if (all.length === 0 && country !== DEFAULT_COUNTRY) {
    all = await getSealedGroups(DEFAULT_COUNTRY);
    priceCountry = DEFAULT_COUNTRY;
  }
  const usingFallback = priceCountry !== country;
  const q = one(searchParams.q).trim();
  const ql = q.toLowerCase();
  const typesSel = csvParam(searchParams.type);
  const setsSel = csvParam(searchParams.set);
  const minCents = one(searchParams.min) ? Math.round(parseFloat(one(searchParams.min)) * 100) : null;
  const maxCents = one(searchParams.max) ? Math.round(parseFloat(one(searchParams.max)) * 100) : null;
  const instock = one(searchParams.instock) === "1";
  const atMsrpOnly = one(searchParams.atmsrp) === "1";
  const sort = one(searchParams.sort);
  const isFiltered = isFilteredParams(searchParams);
  // The newest released set, read from SETS (2026-09-26, "Blog and tools,
  // joined up" in DECISIONS.md). The default order floats its sealed to the
  // top and the page's callout names it. Both said "Vendetta" in code — the
  // callout still announced "Vendetta sealed is here" two months on — and code
  // stays set-agnostic: a new set is a data row, not an edit here.
  const newest = newestReleasedSet();

  // Facet options — only the product types / sets that actually exist in the feed.
  const typeOptions = [...new Set(all.map((g) => g.productType))].sort((a, b) => a.localeCompare(b));
  const setOptions = [...new Set(all.map((g) => g.setCode).filter((c): c is string => !!c))]
    .sort()
    .map((code) => ({ code, name: code }));

  let groups = all;
  if (typesSel.length) groups = groups.filter((g) => typesSel.includes(g.productType));
  if (setsSel.length) groups = groups.filter((g) => g.setCode != null && setsSel.includes(g.setCode));
  if (instock) groups = groups.filter((g) => g.storeCount > 0);
  if (atMsrpOnly) groups = groups.filter((g) => g.atMsrp);
  if (minCents != null) groups = groups.filter((g) => g.lowestPriceCents != null && g.lowestPriceCents >= minCents);
  if (maxCents != null) groups = groups.filter((g) => g.lowestPriceCents != null && g.lowestPriceCents <= maxCents);
  if (ql)
    groups = groups.filter(
      (g) =>
        g.name.toLowerCase().includes(ql) ||
        g.productType.toLowerCase().includes(ql) ||
        (g.setCode ?? "").toLowerCase().includes(ql)
    );

  if (sort === "price_asc") groups = [...groups].sort((a, b) => (a.lowestPriceCents ?? Infinity) - (b.lowestPriceCents ?? Infinity));
  else if (sort === "price_desc") groups = [...groups].sort((a, b) => (b.lowestPriceCents ?? -1) - (a.lowestPriceCents ?? -1));
  else if (sort === "name") groups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "new")
    // Newest first. A null firstSeenAt (the tracking row hasn't been written yet —
    // see recordSealedFirstSeen) sorts LAST, not first: "unknown" must never look
    // like "just added" the way it would if missing sorted as epoch-0 descending.
    groups = [...groups].sort((a, b) => (b.firstSeenAt?.getTime() ?? -1) - (a.firstSeenAt?.getTime() ?? -1));
  else
    // Default: float the newest released set's sealed to the top via a stable
    // sort, leaving every other group in its (already-filtered) order.
    groups = groups
      .map((g, i) => [g, i] as const)
      .sort((a, b) => {
        const av = newest && a[0].setCode === newest.code ? 0 : 1;
        const bv = newest && b[0].setCode === newest.code ? 0 : 1;
        return av - bv || a[1] - b[1];
      })
      .map(([g]) => g);

  // "Sold out at every store we track" (free, 2026-09-25): every store listing
  // the product in this market says sold out on a fresh read. Computed from the
  // getSealedGroups() result already read at the top, never from a second loader
  // nested in another cache (egress rule 6), and it needs no price history.
  const soldOutKeys = [...new Set(all.filter((g) => soldOutEverywhere(g.listings)).map((g) => g.groupKey))];

  // The newest-set callout shows only on the unfiltered view, and only when
  // that set's sealed actually exists in the feed.
  const featuredSetCode = !isFiltered && newest && all.some((g) => g.setCode === newest.code) ? newest.code : null;

  return {
    country,
    priceCountry,
    usingFallback,
    groups: groups.map((g) => ({ ...g, firstSeenAt: g.firstSeenAt ? g.firstSeenAt.toISOString() : null })),
    soldOutKeys,
    typeOptions,
    setOptions,
    isFiltered,
    featuredSetCode,
  };
}
