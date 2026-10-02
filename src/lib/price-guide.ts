// ─────────────────────────────────────────────────────────────────────────────
// /price-guide's loaders (SERVER ONLY — imports Prisma). DECISIONS.md,
// "Site-wide price guide at /price-guide: one cached catalogue, filtered in
// memory", 2026-10-02.
// ─────────────────────────────────────────────────────────────────────────────
// The page is force-dynamic (it reads searchParams, like /browse and /sealed)
// and filters, sorts and pages IN MEMORY over one market-neutral snapshot of
// the whole catalogue, so once warm a request makes ZERO database reads:
//
//   1. a globalThis memo (15 minutes) — the fast path inside one warm lambda;
//   2. the shared Data Cache (cachedOrDirect, 24 h, CONTENT_TAG) holding the
//      computed rows — one Card read + one grouped store count per purge,
//      i.e. after each of the two daily imports and each daily deploy.
//
// EGRESS (src/lib/db.ts): the Card read is ~1,450 narrow rows (~0.8–1.0 MB of
// Prisma JSON) and WILL log [egress-guard] on each recompute — expected, as for
// /cards/all and the set guides. The grouped count is ~0.3–0.45 MB. About 2–3
// recomputes a day ≈ 3–4.5 MB/day. The cached entry is ~0.4–0.55 MB, well
// under the ~1.2 MB unstable_cache ceiling (rule 2); [egress-guard:oversize]
// from cachedOrDirect would say if that ever changed.
//
// The 7-day change reads NO new history: getRiseHistory() is the week-keyed,
// HISTORY_TAG entry /tools/rising and Top Deals already keep warm. It is called
// here at page level, never inside a cache callback (rule 6).
//
// NEVER wrap getPriceGuideRows / getPriceGuideChanges in another
// unstable_cache, and never call them from inside one (tests/nested-cache.test.ts).
import { cache } from "react";
import { prisma } from "./db";
import { cachedOrDirect, sydneyWeekKey } from "./price-history";
import { dropBreakWindow } from "./methodology-breaks";
import { CONTENT_TAG } from "./revalidate-content";
import { storeCountsByCountry } from "./cards";
import { buildDuplicateMap } from "./card-duplicates";
import { cardDisplayName } from "./card-name";
import { cardImageSrc } from "./card-image-url";
import { pickPrice } from "./country";
import { TCGPLAYER_AU_RETAILER, TCGPLAYER_CA_RETAILER, TCGPLAYER_EU_RETAILER, TCGPLAYER_SG_RETAILER, TCGPLAYER_UK_RETAILER } from "./constants";
import { normalizeSearch } from "./format";
import { sevenDayChange } from "./price-table";
import { getRiseHistory, type RiseHistory } from "./rise-predictor";
import { GUIDE_MARKETS, changeOverDays, type ChangeMap, type GuideRow, type PriceGuideRow } from "./price-guide-query";

const DAY_MS = 86_400_000;

// Bump the version whenever PriceGuideRow's shape changes: the callback's
// source is part of the key, but a shape change with the same source (a field
// renamed in the type only) would otherwise serve old entries for a day
// (the price-table.ts "-v3" precedent).
// -v2 (2026-10-02): rows gained v / eb / tc.
export const PRICE_GUIDE_KEY = ["price-guide-rows-v2"];
/** db.ts rule 3's cap: ~1.45k rows today; a warning fires long before it bites. */
export const PRICE_GUIDE_MAX_ROWS = 4000;
const MEMO_TTL_MS = 15 * 60_000; // the /sealed precedent (lib/sealed-import.ts)
const FAILURE_BACKOFF_MS = 60_000;
const CHANGES_TTL_MS = 6 * 60 * 60_000;
const CHANGES_FAILURE_MS = 5 * 60_000; // rise-predictor's FAILURE_MEMO_MS

// ── The catalogue ────────────────────────────────────────────────────────────

/**
 * Every card, duplicates removed, each with all six markets' prices and store
 * counts. Throws on error so a failure is never cached (lib/rise-predictor.ts's
 * rule); getPriceGuideRows serves a stale copy or lets the page fail open.
 */
async function computePriceGuideRows(): Promise<PriceGuideRow[]> {
  const cards = await prisma.card.findMany({
    take: PRICE_GUIDE_MAX_ROWS,
    select: {
      id: true,
      slug: true,
      name: true,
      setCode: true,
      collectorNumber: true,
      domain: true,
      type: true,
      rarity: true,
      variant: true,
      isPromo: true,
      isOvernumbered: true,
      energyCost: true,
      might: true,
      imageThumbUrl: true,
      imageUrl: true,
      lowestPriceCents: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
      lowestPriceCentsEu: true,
      searchCount: true,
      viewCount: true,
      createdAt: true,
    },
  });
  if (cards.length >= PRICE_GUIDE_MAX_ROWS) {
    console.warn(`[price-guide] the catalogue read hit its ${PRICE_GUIDE_MAX_ROWS}-row cap — raise PRICE_GUIDE_MAX_ROWS and re-check the cache entry size (lib/db.ts rule 2).`);
  }

  // The PURE grouping (card-duplicates.ts), not getDuplicateMap(): that one is
  // its own whole-Card read, and these rows are already in hand.
  const dupes = buildDuplicateMap(cards);
  const keep = cards.filter((c) => !dupes.has(c.id));

  // One grouped count for every market at once (cards.ts storeCountsByCountry),
  // never a per-card or per-market query.
  const counts = await storeCountsByCountry(keep.map((c) => c.id));
  const side = await guideSidePrices();

  // Popularity as a dense rank: equal demand shares a rank, so the per-market
  // price tie-break in sortGuideRows matches lib/cards.ts's "popular" order.
  const byDemand = [...keep].sort((a, b) => b.searchCount - a.searchCount || b.viewCount - a.viewCount);
  const pop = new Map<string, number>();
  let rank = 0;
  let prev: { s: number; v: number } | null = null;
  for (const c of byDemand) {
    if (!prev || prev.s !== c.searchCount || prev.v !== c.viewCount) {
      rank++;
      prev = { s: c.searchCount, v: c.viewCount };
    }
    pop.set(c.id, rank);
  }

  return keep.map((c) => ({
    id: c.id,
    slug: c.slug,
    n: c.name,
    dn: cardDisplayName(c.name, c),
    set: c.setCode,
    no: c.collectorNumber,
    dom: c.domain,
    ty: c.type,
    r: c.rarity,
    alt: c.variant != null ? 1 : 0,
    promo: c.isPromo ? 1 : 0,
    over: c.isOvernumbered ? 1 : 0,
    e: c.energyCost,
    m: c.might,
    img: cardImageSrc({ imageUrl: c.imageUrl, imageThumbUrl: c.imageThumbUrl }),
    p: GUIDE_MARKETS.map((k) => pickPrice(c, k)),
    s: GUIDE_MARKETS.map((k) => counts.get(c.id)?.[k] ?? 0),
    v: c.variant,
    eb: GUIDE_MARKETS.map((_, i) => side.get(c.id)?.eb[i] ?? null),
    tc: GUIDE_MARKETS.map((_, i) => side.get(c.id)?.tc[i] ?? null),
    pop: pop.get(c.id) ?? 0,
    add: Math.floor(c.createdAt.getTime() / DAY_MS),
  }));
}

// ── eBay and TCGplayer beside each row (2026-10-02, owner's request) ─────────
// ONE grouped read inside this loader's own cache: the minimum in-stock,
// non-foil item price per (card, market, retailer) for the six eBay keys and
// the TCGplayer keys. ~1,450 cards x ≤11 keys of three small columns, about
// 0.3–0.5 MB of Prisma JSON per recompute (2–3 a day). Canada's eBay rows are
// US listings with unquoted international postage (lib/arbitrage.ts), so
// Canada gets the search button only, as on the homepage table.
const EBAY_KEYS: Partial<Record<(typeof GUIDE_MARKETS)[number], string>> = { AU: "ebay", US: "ebay_us", UK: "ebay_uk", SG: "ebay_sg", EU: "ebay_eu" };
// The US key is the buyable cheapest-English-NM listing; the others are the
// converted market price (constants.ts, THE RULE) — a reference, shown in its
// own labelled column and never in the Lowest figure.
const TCG_KEYS: Partial<Record<(typeof GUIDE_MARKETS)[number], string>> = {
  AU: TCGPLAYER_AU_RETAILER,
  US: "tcgplayer",
  UK: TCGPLAYER_UK_RETAILER,
  SG: TCGPLAYER_SG_RETAILER,
  CA: TCGPLAYER_CA_RETAILER,
  EU: TCGPLAYER_EU_RETAILER,
};

async function guideSidePrices(): Promise<Map<string, { eb: (number | null)[]; tc: (number | null)[] }>> {
  const keyOf = new Map<string, { i: number; ebay: boolean }>();
  GUIDE_MARKETS.forEach((m, i) => {
    const e = EBAY_KEYS[m];
    if (e) keyOf.set(`${m}|${e}`, { i, ebay: true });
    const t = TCG_KEYS[m];
    if (t) keyOf.set(`${m}|${t}`, { i, ebay: false });
  });
  const retailers = [...new Set([...Object.values(EBAY_KEYS), ...Object.values(TCG_KEYS)])] as string[];
  const groups = await prisma.retailerPrice.groupBy({
    by: ["cardId", "country", "retailer"],
    where: { retailer: { in: retailers }, inStock: true, isFoil: false },
    _min: { priceCents: true },
  });
  const out = new Map<string, { eb: (number | null)[]; tc: (number | null)[] }>();
  for (const g of groups) {
    const k = keyOf.get(`${g.country}|${g.retailer}`);
    const v = g._min.priceCents;
    if (!k || v == null || v <= 0) continue;
    let e = out.get(g.cardId);
    if (!e) out.set(g.cardId, (e = { eb: GUIDE_MARKETS.map(() => null), tc: GUIDE_MARKETS.map(() => null) }));
    (k.ebay ? e.eb : e.tc)[k.i] = v;
  }
  return out;
}

type RowsMemo = { at: number; data: GuideRow[] | null; inflight: Promise<GuideRow[]> | null; failedAt: number };
const rowsSlot = globalThis as unknown as { __priceGuideRows?: RowsMemo };

/**
 * The guide's catalogue (self-caching: listed in tests/nested-cache.test.ts
 * SELF_CACHED). A cold lambda costs one Data Cache read; concurrent requests on
 * that lambda share one in-flight promise. After an error this lambda waits a
 * minute before trying again, serving its stale copy if it has one and
 * rejecting otherwise — the page then renders its fail-open state.
 */
export function getPriceGuideRows(): Promise<GuideRow[]> {
  const memo = (rowsSlot.__priceGuideRows ??= { at: 0, data: null, inflight: null, failedAt: 0 });
  const now = Date.now();
  if (memo.data && now - memo.at < MEMO_TTL_MS) return Promise.resolve(memo.data);
  if (memo.inflight) return memo.inflight;
  if (now - memo.failedAt < FAILURE_BACKOFF_MS) {
    return memo.data
      ? Promise.resolve(memo.data)
      : Promise.reject(new Error("[price-guide] catalogue unavailable (backing off after a failed read)"));
  }
  const inflight = cachedOrDirect(() => computePriceGuideRows(), PRICE_GUIDE_KEY, {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })
    .then((rows) => {
      // The normalised name is rebuilt here rather than stored: it is derived,
      // and leaving it out keeps the cache entry ~10% smaller.
      const data = rows.map((r) => ({ ...r, nn: normalizeSearch(r.n) }));
      memo.data = data;
      memo.at = Date.now();
      return data;
    })
    .catch((err) => {
      console.error("[price-guide] catalogue load failed:", err);
      memo.failedAt = Date.now();
      if (memo.data) return memo.data;
      throw err;
    })
    .finally(() => {
      memo.inflight = null;
    });
  memo.inflight = inflight;
  return inflight;
}

/**
 * Per-request dedupe (React cache): generateMetadata and the page body both
 * need the rows, and on a cold lambda both would otherwise start a read.
 * Fails open to null — the page renders its intro, FAQ and an honest notice.
 */
export const loadPriceGuideRows = cache((): Promise<GuideRow[] | null> => getPriceGuideRows().catch(() => null));

// ── Price changes ────────────────────────────────────────────────────────────

/**
 * The 7- and 30-day changes from Rising Cards' weekly GLOBAL history. PURE.
 *
 * Every series goes through dropBreakWindow FIRST (lib/methodology-breaks.ts):
 * a change measured across the 2026-09-23 sourcing switch is the switch, not a
 * market move. Rising Cards itself is exempt by the owner's call; this page is
 * not, so its figures can differ from /tools/rising on purpose.
 */
export function computeGuideChanges(h: RiseHistory, now: number): ChangeMap {
  const d7 = new Map<string, number>();
  const d30 = new Map<string, number>();
  let asOf: number | null = null;
  for (const [cardId, series] of Object.entries(h.series)) {
    const kept = dropBreakWindow(series.map(([day, v]) => ({ t: day * DAY_MS, v })));
    if (!kept.length) continue;
    const newest = kept[kept.length - 1].t;
    if (asOf == null || newest > asOf) asOf = newest;
    const c7 = sevenDayChange(kept, now);
    if (c7 != null) d7.set(cardId, c7);
    const c30 = changeOverDays(kept, 30, 25 * DAY_MS, now);
    if (c30 != null) d30.set(cardId, c30);
  }
  return { asOf, d7, d30 };
}

type ChangesMemo = { week: string; at: number; ok: boolean; promise: Promise<ChangeMap | null> };
const changesSlot = globalThis as unknown as { __priceGuideChanges?: ChangesMemo };

/**
 * Page level only — never inside an unstable_cache callback. Memoised per warm
 * lambda for six hours within the Sydney week the history key uses. A history
 * outage (getRiseHistory throws) resolves to null: the change column shows "—"
 * and the page says the figures are unavailable, rather than failing the page.
 */
export function getPriceGuideChanges(): Promise<ChangeMap | null> {
  const week = sydneyWeekKey();
  const memo = changesSlot.__priceGuideChanges;
  if (memo && memo.week === week && Date.now() - memo.at < (memo.ok ? CHANGES_TTL_MS : CHANGES_FAILURE_MS)) {
    return memo.promise;
  }
  const entry: ChangesMemo = { week, at: Date.now(), ok: true, promise: Promise.resolve(null) };
  entry.promise = getRiseHistory()
    .then((h) => computeGuideChanges(h, Date.now()))
    .catch((err) => {
      console.error("[price-guide] weekly history unavailable — the change columns show a dash:", err);
      entry.ok = false;
      return null;
    });
  changesSlot.__priceGuideChanges = entry;
  return entry.promise;
}
