// The /price-guide page's market view, computed on the server for ANY market
// (2026-11-05, DECISIONS.md "The price guide becomes one CDN copy per URL"). The
// page renders the baseline market (DEFAULT_COUNTRY, the US) into its HTML, or
// the market a `?market=` link pins, and Vercel's CDN keeps that one copy per
// URL; the client island (components/price-guide/PriceGuideMarketBoard.tsx)
// asks /api/price-guide-view for the visitor's market when it differs, which
// the CDN also keeps. Both call this, so the filter, the sort, the paging and
// the summary figures are computed in exactly one place, from the same cached
// catalogue (lib/price-guide.ts) the page always read.
//
// Server-only: it reads the catalogue loader. The result is JSON-safe (the
// change maps become per-row numbers, the "as of" date a string) because the
// API route sends it over fetch.
import { COUNTRIES, type Country } from "./country";
import { gbpCentsToEur } from "./fx";
import { parsePageNum, parsePageSize } from "./cards";
import { getPriceGuideChanges, loadPriceGuideRows } from "./price-guide";
import {
  filterGuideRows,
  GUIDE_QUERY_KEYS,
  guideMarketIndex,
  guideStats,
  listedGuideRows,
  normalizeGuideSort,
  parseGuideQuery,
  pricesBySet,
  sortGuideRows,
  thirtyDayCoverage,
  THIRTY_DAY_MIN_COVERAGE,
  type GuideSort,
  type GuideStats,
  type RawSearchParams,
  type SetPriceSummary,
} from "./price-guide-query";
import type { GuideTableItem } from "@/components/price-guide/PriceGuideTable";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The query the island repeats to /api/price-guide-view: every guide key but `market`, only when set. */
export function priceGuideQuery(sp: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of GUIDE_QUERY_KEYS) {
    if (k === "market") continue;
    const v = one(sp[k]);
    if (v) out[k] = v;
  }
  return out;
}

export interface PriceGuideView {
  country: Country;
  /** The currency every figure is in: the market's own, or EUR for the UK market shown in euros. */
  currency: string;
  /** COUNTRIES[country].place, e.g. "the United Kingdom". */
  place: string;
  stats: GuideStats;
  bySet: SetPriceSummary[];
  /** This page of rows, in order, every figure in `currency`. */
  items: GuideTableItem[];
  /** Rows the guide lists (every released set), before the filters. */
  listed: number;
  /** Rows matching the filters, all pages. */
  total: number;
  /** Of `total`, those with a price in this market. */
  pricedHere: number;
  sort: GuideSort;
  page: number;
  size: number;
  totalPages: number;
  /** 1-based positions of the first and last row on this page. */
  start: number;
  end: number;
  showD30: boolean;
  /** "5 November 2026", the week the 7-day figures run to, or null. */
  asOf: string | null;
  /** The weekly history could not be read: the change columns show a dash. */
  changesUnavailable: boolean;
}

/**
 * The guide for one market and one query, or null when the catalogue is
 * unavailable (the page then renders its honest notice). `eurDisplay` is the
 * UK-market-in-euros display the visitor chose (CountryProvider), applied to
 * every figure AND to the min/max filter, which they type in that currency.
 */
export async function buildPriceGuideView(
  country: Country,
  searchParams: RawSearchParams,
  opts: { eurDisplay?: boolean } = {},
): Promise<PriceGuideView | null> {
  const [rows, changes] = await Promise.all([loadPriceGuideRows(), getPriceGuideChanges()]);
  if (rows === null) return null;

  const showEur = country === "UK" && !!opts.eurDisplay;
  const currency = showEur ? "EUR" : COUNTRIES[country].currency;
  const toDisplay = showEur ? gbpCentsToEur : (c: number) => c;
  const mi = guideMarketIndex(country);

  const listed = listedGuideRows(rows);
  const query = parseGuideQuery(searchParams);
  const sort = normalizeGuideSort(query.sort);
  const filtered = filterGuideRows(listed, query, country, { toDisplayCents: toDisplay });
  const sorted = sortGuideRows(filtered, sort, country, changes?.d7 ?? null);
  const size = parsePageSize(query.size);
  const page = parsePageNum(query.page);
  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const pageRows = sorted.slice((page - 1) * size, page * size);
  const showD30 = changes ? thirtyDayCoverage(listed, country, changes.d30) >= THIRTY_DAY_MIN_COVERAGE : false;

  const items: GuideTableItem[] = pageRows.map((row) => {
    const p = row.p[mi];
    const eb = row.eb?.[mi] ?? null;
    const tc = row.tc?.[mi] ?? null;
    return {
      row,
      price: p != null ? toDisplay(p) : null,
      ebay: eb != null ? toDisplay(eb) : null,
      tcg: tc != null ? toDisplay(tc) : null,
      stores: row.s[mi] ?? 0,
      d7: changes?.d7.get(row.id) ?? null,
      d30: changes?.d30.get(row.id) ?? null,
    };
  });

  return {
    country,
    currency,
    place: COUNTRIES[country].place,
    stats: guideStats(listed, country, toDisplay),
    bySet: pricesBySet(listed, country, toDisplay),
    items,
    listed: listed.length,
    total: sorted.length,
    pricedHere: sorted.reduce((n, r) => n + (r.p[mi] != null ? 1 : 0), 0),
    sort,
    page,
    size,
    totalPages,
    start: (page - 1) * size + 1,
    end: Math.min(page * size, sorted.length),
    showD30,
    asOf: changes?.asOf
      ? new Date(changes.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      : null,
    changesUnavailable: changes === null,
  };
}

