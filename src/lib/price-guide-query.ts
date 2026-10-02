// ─────────────────────────────────────────────────────────────────────────────
// /price-guide's query layer: the row shape, the URL parameters, and the
// filter / sort / page steps the page runs IN MEMORY over one cached catalogue
// (DECISIONS.md, "Site-wide price guide at /price-guide", 2026-10-02).
// ─────────────────────────────────────────────────────────────────────────────
// PURE AND CLIENT-SAFE ON PURPOSE: no Prisma, no next/*, nothing server-only.
// The loader that fills these rows lives in lib/price-guide.ts (server); this
// file is what the tests import, and what a client component may import for
// the sort list.
//
// THE FILTER MIRRORS lib/cards.ts buildCardWhere, CLAUSE FOR CLAUSE. /browse
// asks Postgres; this page asks an array. Two implementations of one search
// can drift, and a visitor who types the same words into both must get the
// same cards, so guidePredicate below is written as the same sequence of
// assignments to the same keys as buildCardWhere — a later assignment to a key
// REPLACES the earlier one there exactly as it does in the Prisma object
// (`printing=normal` overwriting `sig=1`, a facet-only search overwriting a
// typed "showcase"). tests/price-guide.test.ts pins the parity with fixtures.
//
// Two deliberate differences, both documented where they happen:
//   • `tag`, `rules` and `rulesSet` are not supported — the catalogue does not
//     carry tags or rules text. Such a URL is noindexed and ignores them.
//   • min/max compare against the price the visitor SEES: identical to /browse
//     everywhere except a UK-market visitor shown euros, who types euros.

import { dollarsToCents, normalizeSearch } from "./format";
import { parseSearchQuery } from "./search-query";
import { isPreorderSetCode, SETS, ULTIMATE_PRINTS } from "./constants";
import type { Country } from "./country";

const DAY_MS = 86_400_000;

/** Fixed index order of a row's `p` (prices) and `s` (store counts). */
export const GUIDE_MARKETS = ["AU", "US", "UK", "SG", "CA", "EU"] as const satisfies readonly Country[];

export function guideMarketIndex(country: Country): number {
  return (GUIDE_MARKETS as readonly Country[]).indexOf(country);
}

/**
 * One card in the cached catalogue. Short keys because ~1,450 of these share a
 * single unstable_cache entry (lib/db.ts rule 2: ~1.2 MB raw ceiling).
 * Bump PRICE_GUIDE_KEY in lib/price-guide.ts whenever this shape changes.
 */
export type PriceGuideRow = {
  id: string;
  slug: string | null;
  /** Raw name (search). */
  n: string;
  /** cardDisplayName — the credentialed name, display and anchor text. */
  dn: string;
  /** setCode. */
  set: string;
  /** collectorNumber, raw ("193*\/166", "SP1"). */
  no: string;
  /** domain. */
  dom: string;
  /** type. */
  ty: string;
  /** STORED rarity — filters match it; display goes through displayRarity(). */
  r: string;
  /** variant != null (alt art), isPromo, the isOvernumbered column. */
  alt: 0 | 1;
  promo: 0 | 1;
  over: 0 | 1;
  /** energyCost, might. */
  e: number | null;
  m: number | null;
  /** cardImageSrc() of the row's art, or null. */
  img: string | null;
  /** Cheapest in-stock price per market, GUIDE_MARKETS order, integer cents. */
  p: (number | null)[];
  /** In-stock store counts per market, same order. */
  s: number[];
  /** variant (credentials for the quick view's display name), or null. */
  v: string | null;
  /** Cheapest in-stock eBay item price per market (postage extra), same order;
   *  null where we track none. Optional: absent on an entry cached before
   *  2026-10-02's columns (the key is bumped, but a stale memo may hold one). */
  eb?: (number | null)[];
  /** The market's TCGplayer figure, same order: the US buyable listing, the
   *  converted reference elsewhere (2026-10-02, owner's request). */
  tc?: (number | null)[];
  /** Popularity: a DENSE rank by (searchCount desc, viewCount desc), 1 = most
   *  wanted. The raw counters are never stored or shipped. */
  pop: number;
  /** createdAt as an epoch day (sort=new). */
  add: number;
};

/** A row as the page uses it: the memo layer adds the normalised name. */
export type GuideRow = PriceGuideRow & { nn: string };

/** Per-card % changes on the weekly GLOBAL series, after dropBreakWindow. */
export interface ChangeMap {
  /** Newest point across every kept series (epoch ms), for "to {date}". */
  asOf: number | null;
  d7: Map<string, number>;
  d30: Map<string, number>;
}

// ── URL state ────────────────────────────────────────────────────────────────

/** CardQuery's names (lib/cards.ts) plus `market`. */
export interface GuideQuery {
  q?: string;
  set?: string;
  rarity?: string;
  domain?: string;
  type?: string;
  variant?: string;
  sig?: string;
  over?: string;
  ult?: string;
  promo?: string;
  printing?: string;
  priced?: string;
  min?: string;
  max?: string;
  sort?: string;
  page?: string;
  size?: string;
  market?: string;
}

const GUIDE_QUERY_KEYS = [
  "q", "set", "rarity", "domain", "type", "variant", "sig", "over", "ult", "promo",
  "printing", "priced", "min", "max", "sort", "page", "size", "market",
] as const satisfies readonly (keyof GuideQuery)[];

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * searchParams → GuideQuery. Values are kept RAW, empty strings included:
 * buildCardWhere tells "absent" from "present but empty" (a `?type=` stops a
 * typed "legend" from scoping the search), so this must too.
 */
export function parseGuideQuery(sp: RawSearchParams): GuideQuery {
  const out: GuideQuery = {};
  for (const k of GUIDE_QUERY_KEYS) {
    const v = first(sp[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const GUIDE_DEFAULT_SORT = "price_desc";
export const GUIDE_DEFAULT_SIZE = 100;

/** The guide's sort options, for SortSelect and the column headers. */
export const GUIDE_SORTS = [
  { value: "price_desc", label: "Price: High to Low" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "popular", label: "Most popular" },
  { value: "change_desc", label: "7-day change: rising first" },
  { value: "change_asc", label: "7-day change: falling first" },
  { value: "stores_desc", label: "Most stores in stock" },
  { value: "name", label: "Name: A–Z" },
  { value: "number", label: "Set & card number" },
  { value: "new", label: "Recently Added" },
] as const;
export type GuideSort = (typeof GUIDE_SORTS)[number]["value"] | "stores_asc";

const SORT_VALUES = new Set<string>([...GUIDE_SORTS.map((s) => s.value), "stores_asc"]);

export function normalizeGuideSort(v: string | undefined): GuideSort {
  return v && SORT_VALUES.has(v) ? (v as GuideSort) : GUIDE_DEFAULT_SORT;
}

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * The rows the guide lists: every released set. Applied per request rather
 * than at cache time, so a set appears on its release day with no purge and no
 * code change (isPreorderSetCode is date-driven).
 */
export function listedGuideRows<T extends Pick<PriceGuideRow, "set">>(rows: readonly T[], now: Date = new Date()): T[] {
  return rows.filter((r) => !isPreorderSetCode(r.set, now));
}

// ── Filtering (mirrors buildCardWhere) ───────────────────────────────────────

function csv(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(",").filter(Boolean);
  return arr.length ? arr : undefined;
}

/** buildCardWhere's Ultimate clause: set code plus "<n>/" at the start of the number. */
export function isUltimatePrint(setCode: string, collectorNumber: string): boolean {
  return (ULTIMATE_PRINTS[setCode] ?? []).some((n) => collectorNumber.startsWith(`${n}/`));
}

type Pred = (r: GuideRow) => boolean;

export interface GuideFilterOptions {
  /**
   * Market cents → the cents the visitor sees. Identity everywhere except the
   * UK market shown in euros (gbpCentsToEur), so a typed "10" compares against
   * the €10.00 on screen rather than £10.
   */
  toDisplayCents?: (marketCents: number) => number;
}

/** One predicate for a query — buildCardWhere's `where`, as a function of a row. */
export function guidePredicate(query: GuideQuery, country: Country, opts: GuideFilterOptions = {}): Pred {
  // Keys mirror the Prisma where's keys, so "assign again" means "replace".
  const where = new Map<string, Pred>();
  const mi = guideMarketIndex(country);

  // Printing words in the typed phrase fill ONLY the filters the URL left unset.
  const parsed = parseSearchQuery(query.q ?? "");
  const eff: GuideQuery = { ...query };
  for (const [k, v] of Object.entries(parsed.filters)) {
    const key = k as keyof GuideQuery;
    if (eff[key] === undefined) eff[key] = v;
  }

  const domains = csv(eff.domain);
  if (domains) where.set("domain", (r) => domains.includes(r.dom));
  const rarities = csv(eff.rarity);
  if (rarities) where.set("rarity", (r) => rarities.includes(r.r));
  const types = csv(eff.type);
  if (types) where.set("type", (r) => types.includes(r.ty));
  const sets = csv(eff.set);
  if (sets) where.set("setCode", (r) => sets.includes(r.set));

  if (eff.variant === "alt") where.set("variant", (r) => r.alt === 1);
  else if (eff.variant === "base") where.set("variant", (r) => r.alt === 0);

  // `tag` / `rules` / `rulesSet`: not in the catalogue, so not filtered (the
  // URL is noindexed by lib/price-guide-seo.ts either way).

  if (eff.sig === "1") where.set("collectorNumber", (r) => r.no.includes("*"));
  if (eff.over === "1") where.set("isOvernumbered", (r) => r.over === 1);
  if (eff.promo === "1") where.set("isPromo", (r) => r.promo === 1);
  if (eff.ult === "1") where.set("AND", (r) => isUltimatePrint(r.set, r.no));

  // "Normal only" — the URL's own parameter, never a typed word — replaces the
  // printing keys above, as it does in the Prisma object.
  if (query.printing === "normal") {
    where.set("variant", (r) => r.alt === 0);
    where.set("isPromo", (r) => r.promo === 0);
    where.set("isOvernumbered", (r) => r.over === 0);
    where.set("collectorNumber", (r) => !r.no.includes("*"));
  }

  // Facet words that also occur in card names: an alternative, never a
  // constraint, and never over a dimension the URL set explicitly.
  const scoped: [string, Pred][] = [];
  const st = parsed.scoped;
  if (st.type && query.type === undefined) scoped.push(["type", (r) => r.ty === st.type]);
  if (st.domain && query.domain === undefined) scoped.push(["domain", (r) => r.dom === st.domain]);
  if (st.rarity && query.rarity === undefined) scoped.push(["rarity", (r) => r.r === st.rarity]);

  const strippedName = normalizeSearch(parsed.name);

  // The whole query was facet words: they become ordinary top-level filters.
  if (query.q && !strippedName) {
    for (const [key, pred] of scoped) where.set(key, pred);
  }

  if (query.q && strippedName) {
    const raw = normalizeSearch(query.q);
    const typed = query.q;
    // The whole typed phrase against the name, then the RAW string against the
    // collector number (case and "*" intact).
    const or: Pred[] = [(r) => r.nn.includes(raw), (r) => r.no.includes(typed)];
    if (scoped.length) {
      or.push((r) => r.nn.includes(strippedName) && scoped.every(([, pred]) => pred(r)));
    } else if (strippedName !== raw) {
      or.push((r) => r.nn.includes(strippedName));
    }
    const slugs = parsed.aliasSlugs;
    if (slugs.length) or.push((r) => r.slug != null && slugs.includes(r.slug));
    where.set("OR", (r) => or.some((pred) => pred(r)));
  } else if (query.q && parsed.aliasSlugs.length) {
    const slugs = parsed.aliasSlugs;
    where.set("OR", (r) => r.slug != null && slugs.includes(r.slug));
  }

  let gte: number | undefined;
  let lte: number | undefined;
  if (query.min) gte = dollarsToCents(query.min);
  if (query.max) lte = dollarsToCents(query.max);
  if (query.priced === "1" || gte != null || lte != null) {
    const toDisplay = opts.toDisplayCents ?? ((c: number) => c);
    where.set("price", (r) => {
      const p = r.p[mi];
      if (p == null) return false;
      const v = toDisplay(p);
      return (gte == null || v >= gte) && (lte == null || v <= lte);
    });
  }

  const preds = [...where.values()];
  return (r) => preds.every((pred) => pred(r));
}

export function filterGuideRows<T extends GuideRow>(
  rows: readonly T[],
  query: GuideQuery,
  country: Country,
  opts: GuideFilterOptions = {},
): T[] {
  const match = guidePredicate(query, country, opts);
  return rows.filter(match);
}

// ── Sorting ──────────────────────────────────────────────────────────────────

const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const SET_ORDER = new Map(SETS.map((s, i) => [s.code, i]));
const setRank = (code: string) => SET_ORDER.get(code) ?? SETS.length;

/** Set order (SETS), then collector number compared numerically ("2/298" < "10/298"). */
export function compareByNumber(a: Pick<PriceGuideRow, "set" | "no" | "id">, b: Pick<PriceGuideRow, "set" | "no" | "id">): number {
  return (
    setRank(a.set) - setRank(b.set) ||
    a.set.localeCompare(b.set) ||
    COLLATOR.compare(a.no, b.no) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const compareByName = (a: GuideRow, b: GuideRow) => COLLATOR.compare(a.n, b.n) || compareByNumber(a, b);

/** Nulls last in either direction; `dir` 1 = ascending, -1 = descending. */
function nullsLast(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

/**
 * Sort a copy. Every order ends in name, then set and number, then id, so a
 * page boundary never moves between two requests.
 */
export function sortGuideRows<T extends GuideRow>(
  rows: readonly T[],
  sort: GuideSort,
  country: Country,
  d7: ReadonlyMap<string, number> | null = null,
): T[] {
  const mi = guideMarketIndex(country);
  const price = (r: GuideRow) => r.p[mi];
  const priceDesc = (a: GuideRow, b: GuideRow) => nullsLast(price(a), price(b), -1) || compareByName(a, b);
  const change = (r: GuideRow) => d7?.get(r.id) ?? null;
  let cmp: (a: GuideRow, b: GuideRow) => number;
  switch (sort) {
    case "price_asc":
      cmp = (a, b) => nullsLast(price(a), price(b), 1) || compareByName(a, b);
      break;
    // lib/cards.ts "popular": demand, then price dearest first, then name.
    case "popular":
      cmp = (a, b) => a.pop - b.pop || priceDesc(a, b);
      break;
    case "name":
      cmp = compareByName;
      break;
    case "number":
      cmp = compareByNumber;
      break;
    case "new":
      cmp = (a, b) => b.add - a.add || compareByName(a, b);
      break;
    case "change_desc":
      cmp = (a, b) => nullsLast(change(a), change(b), -1) || priceDesc(a, b);
      break;
    case "change_asc":
      cmp = (a, b) => nullsLast(change(a), change(b), 1) || priceDesc(a, b);
      break;
    case "stores_desc":
      cmp = (a, b) => b.s[mi] - a.s[mi] || priceDesc(a, b);
      break;
    case "stores_asc":
      cmp = (a, b) => a.s[mi] - b.s[mi] || priceDesc(a, b);
      break;
    case "price_desc":
    default:
      cmp = priceDesc;
  }
  return [...rows].sort(cmp);
}

// ── Price change over N days (the 30-day column) ────────────────────────────

/** = STALE_HISTORY_MS in lib/price-history.ts (pinned by tests/price-guide.test.ts). */
export const GUIDE_STALE_MS = 10 * DAY_MS;
// Same outlier guard as lib/price-table.ts sevenDayChange: a swing this large
// is a mismatched listing far more often than a real move.
const OUTLIER_DROP = 80;
const OUTLIER_SPIKE = 300;

/**
 * sevenDayChange (lib/price-table.ts) generalised to N days, for a weekly
 * series oldest first. The reference is the point nearest N days before the
 * newest one, and it must be at least `minSpanMs` back (lib/public-api.ts's
 * 25-day guard for a "30-day" figure) and no more than a week past N days — a
 * gap in the series must not pass a 60-day move off as a 30-day one. Null when
 * the series is stale, too short, or the move trips the outlier guard.
 */
export function changeOverDays(
  points: readonly { t: number; v: number }[],
  days: number,
  minSpanMs: number,
  now = Date.now(),
): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  if (now - last.t > GUIDE_STALE_MS) return null;
  const target = last.t - days * DAY_MS;
  let ref = points[0];
  for (const p of points.slice(0, -1)) if (Math.abs(p.t - target) < Math.abs(ref.t - target)) ref = p;
  const span = last.t - ref.t;
  if (ref === last || ref.v <= 0 || span < minSpanMs || span > (days + 7) * DAY_MS) return null;
  const pct = ((last.v - ref.v) / ref.v) * 100;
  if (pct >= OUTLIER_SPIKE || pct <= -OUTLIER_DROP) return null;
  return Math.round(pct * 10) / 10;
}

/** Share of the listed, priced rows (this market) that have a 30-day figure. */
export function thirtyDayCoverage(rows: readonly GuideRow[], country: Country, d30: ReadonlyMap<string, number>): number {
  const mi = guideMarketIndex(country);
  let priced = 0;
  let covered = 0;
  for (const r of rows) {
    if (r.p[mi] == null) continue;
    priced++;
    if (d30.has(r.id)) covered++;
  }
  return priced ? covered / priced : 0;
}

/** The 30-day column renders only once at least half the priced rows have a value. */
export const THIRTY_DAY_MIN_COVERAGE = 0.5;

// ── Summary figures (the stat strip and "Prices by set") ────────────────────

function median(sorted: readonly number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface GuideStats {
  listed: number;
  priced: number;
  /** Display cents. */
  medianCents: number | null;
  /** Share (0–1) of priced rows under one whole unit of the display currency. */
  underOneShare: number | null;
  dearest: { row: GuideRow; cents: number } | null;
}

export function guideStats(
  rows: readonly GuideRow[],
  country: Country,
  toDisplayCents: (marketCents: number) => number = (c) => c,
): GuideStats {
  const mi = guideMarketIndex(country);
  const prices: number[] = [];
  let dearest: GuideStats["dearest"] = null;
  for (const r of rows) {
    const p = r.p[mi];
    if (p == null) continue;
    const cents = toDisplayCents(p);
    prices.push(cents);
    if (!dearest || cents > dearest.cents || (cents === dearest.cents && compareByName(r, dearest.row) < 0)) dearest = { row: r, cents };
  }
  prices.sort((a, b) => a - b);
  return {
    listed: rows.length,
    priced: prices.length,
    medianCents: median(prices),
    underOneShare: prices.length ? prices.filter((c) => c < 100).length / prices.length : null,
    dearest,
  };
}

export interface SetPriceSummary {
  code: string;
  name: string;
  slug: string;
  listed: number;
  priced: number;
  medianCents: number | null;
  dearest: { row: GuideRow; cents: number } | null;
}

/** One summary per set that has listed rows, in SETS order. Set names come from SETS only. */
export function pricesBySet(
  rows: readonly GuideRow[],
  country: Country,
  toDisplayCents: (marketCents: number) => number = (c) => c,
): SetPriceSummary[] {
  const bySet = new Map<string, GuideRow[]>();
  for (const r of rows) (bySet.get(r.set) ?? bySet.set(r.set, []).get(r.set)!).push(r);
  const out: SetPriceSummary[] = [];
  for (const s of SETS) {
    const list = bySet.get(s.code);
    if (!list?.length) continue;
    const st = guideStats(list, country, toDisplayCents);
    out.push({ code: s.code, name: s.name, slug: s.slug, listed: st.listed, priced: st.priced, medianCents: st.medianCents, dearest: st.dearest });
  }
  return out;
}
