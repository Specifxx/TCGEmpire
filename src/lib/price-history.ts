// Price-history helpers: per-card time series for the charts, the weekly
// "movers" used by the homepage Price Watch, and the homepage's "recently
// updated" feed. PriceHistory records ONE lowest-price point per card per
// Sydney day (see price-import.ts's snapshot write) — the cheapest price
// found in ANY tracked market that day, stored as USD cents under the single
// country="GLOBAL" sentinel (GLOBAL_HISTORY_COUNTRY below). Every function
// here still takes a `country` and returns it priced in THAT market's own
// currency; historySource() is the one place that knows the stored series is
// USD/GLOBAL, not the caller's own market — nothing below is AU-only despite
// this file's history.
import { unstable_cache } from "next/cache";
import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage.external";
import { prisma } from "./db";
import { getCardSeries, getWindow, dayIndexToDate } from "./history-store";
import { cardTileSelect, withStoreCounts } from "./cards";
import { DEFAULT_COUNTRY, currencyOf, type Country } from "./country";
import { convertCents } from "./fx";
import type { CardTileData } from "@/components/CardTile";
import { HISTORY_TAG } from "./revalidate-content";

// The one PriceHistory.country value every snapshot is written under since
// 2026-09-05 (see price-import.ts's snapshot write) — the day's lowest price
// across every tracked market, converted to USD cents. A literal string
// constant, not a Country: PriceHistory.country is a plain text column and
// this value must never be looked up in COUNTRIES/currencyOf like a real
// market code (see rise-predictor.ts's own guard against exactly that, for
// the retired "NZ" market code left behind by an earlier removal).
export const GLOBAL_HISTORY_COUNTRY = "GLOBAL";

// No market gets its own PriceHistory rows any more — 2026-09-02 stopped
// writing CA/EU as pure currency-converted duplicates of US/UK; 2026-09-05
// finished the idea for AU/US/UK/SG too, once it was clear the four
// "independently tracked" markets were really the same handful of stores
// undercutting each other, not four separate price stories. Resolves a
// market to the ONE series that should actually be queried on its behalf
// (always GLOBAL now) plus the conversion to apply to every price read from
// it to get back to `country`'s own currency. Every real PriceHistory reader
// in the codebase goes through this — see its call sites — so the single
// shared series behaves exactly like a real per-market one to every caller
// except this file and price-import.ts, which are the only two that need to
// know it's a shared USD series at all.
export function historySource(country: Country): { source: typeof GLOBAL_HISTORY_COUNTRY; convert: (usdCents: number) => number } {
  const to = currencyOf(country);
  return { source: GLOBAL_HISTORY_COUNTRY, convert: (usdCents) => convertCents(usdCents, "USD", to) };
}

// The cache keys below are now DAY-scoped (sydneyDayKey), matching the daily
// `data`-branch publish cadence — a key rotates every day regardless of this
// TTL, as long as the TTL is at least a day, so this is deliberately generous
// slack rather than a tight budget: a bigger value than the key's real
// lifetime just means an entry can be reused a little past its own key if
// Next.js's cache ever serves a slightly-stale hit, never a correctness
// issue. Left at the old weekly-cadence value rather than retuned, since a
// smaller number buys nothing here.
const HISTORY_CACHE_TTL = 8 * 86400;

// unstable_cache requires Next.js's request-scoped incremental cache, which doesn't
// exist when this module is imported by a plain tsx script (e.g. scripts/weekly-promo.ts)
// run outside the Next.js runtime — it throws "Invariant: incrementalCache missing"
// rather than caching. There, caching buys nothing anyway (a one-shot process never
// reuses it), so fall back to calling the function directly instead of failing the
// whole script. Any OTHER unstable_cache error still throws as normal.
//
// ── NEVER NEST THIS INSIDE ANOTHER unstable_cache CALLBACK ──────────────────
// Next.js 14.2 runs an unstable_cache callback under a store with
// `fetchCache: "force-no-store"` and `isUnstableCacheCallback: true`, and the
// cache READ is gated on `store.fetchCache !== "force-no-store"` (see
// node_modules/next/dist/server/web/spec-extension/unstable-cache.js, the
// "when we are nested inside of other unstable_cache's we should bypass cache"
// branch). So a self-cached loader called from inside another cached callback
// RECOMPUTES on every outer miss — its own key, TTL and tag are ignored — and
// the outer entry's freshness becomes the inner read's real cadence.
//
// That is how the first egress audit of the history project (2026-09-11) found
// its whole-market reads running 86 and 36 times in twenty minutes with no
// build and no import in the window: getPriceMovers, getRisingCards,
// getUndervalued and the arbitrage row pulls were all being invoked from inside
// getCachedTopDeals' hour-long entry, and /games and /tools/value-finder had
// wrapped already-cached loaders in a second unstable_cache of their own.
//
// Two defences below, both cheap:
//   1. A nested call is detected from the store and logged as
//      [egress-guard:nested-cache], so the Vercel function logs name the caller
//      the moment someone reintroduces the pattern (tests/nested-cache.test.ts
//      pins the known sites statically as well).
//   2. Every real compute is logged as [egress-guard:cache-miss] with its key
//      and duration, so "which loader is actually running, and how often" is a
//      log search rather than a theory.
// RULE 2 — the one egress rule with no automated guard at all (2026-09-14,
// DECISIONS.md "Find the fifth burn before RM10 dies"). unstable_cache stores
// `JSON.stringify(result)` and then stringifies the WHOLE entry again on the
// way into the incremental cache, so the real ceiling is well under the 2 MB
// hard check — budget ~1.2 MB raw (see the header of src/lib/db.ts). Past
// that, Next.js silently DECLINES to cache the entry: no error, just a
// console.warn in production and every subsequent request recomputing it. A
// static audit found two cache entries sitting in that dead zone — big enough
// to matter, too small to trip src/lib/db.ts's own per-QUERY guard (which
// gates on ≥1 MB of a single Prisma call, not the assembled cache payload) —
// and a genuine, if slow-growing, per-user cliff in a third. This checks the
// actual thing that matters: the size of what is ABOUT to go into the cache.
const CACHE_ENTRY_WARN_BYTES = 1_200_000;

export async function cachedOrDirect<T>(fn: () => Promise<T>, keys: string[], opts: { revalidate: number; tags: string[] }): Promise<T> {
  const label = keys.join(",");
  if (isNestedInUnstableCache()) {
    console.warn(
      `[egress-guard:nested-cache] ${label} was called inside another unstable_cache callback — ` +
        `Next.js bypasses the inner cache there, so this loader recomputes on every outer miss. ` +
        `Hoist the call out of the outer cache (see the note on cachedOrDirect in lib/price-history.ts).`,
    );
  }
  const compute = async () => {
    const started = Date.now();
    const result = await fn();
    console.log(`[egress-guard:cache-miss] ${label} computed in ${Date.now() - started} ms`);
    try {
      const bytes = JSON.stringify(result).length;
      if (bytes >= CACHE_ENTRY_WARN_BYTES) {
        console.warn(
          `[egress-guard:oversize] ${label} is ~${(bytes / 1e6).toFixed(2)} MB going into unstable_cache — ` +
            `past ~1.2 MB raw, Next.js may silently DECLINE to cache this entry, and every request would ` +
            `then recompute it instead of one pull per key. Narrow the select, take a cap, or split the ` +
            `payload — see egress rule 2 in src/lib/db.ts.`,
        );
      }
    } catch {
      /* sizing is best-effort — never break the cache on account of measuring it */
    }
    return result;
  };
  try {
    return await unstable_cache(compute, keys, opts)();
  } catch (e) {
    if (e instanceof Error && e.message.includes("incrementalCache missing")) return fn();
    throw e;
  }
}

// Reads the flag Next sets on the render store while an unstable_cache callback
// is executing. Internal module, but it is the very one unstable_cache itself
// imports, and this repo pins next to a 14.2.x range; if the import ever breaks
// the guard degrades to "never nested" rather than failing the render.
function isNestedInUnstableCache(): boolean {
  try {
    return staticGenerationAsyncStorage.getStore()?.isUnstableCacheCallback === true;
  } catch {
    return false;
  }
}

// Calendar day in Australia/Sydney. PriceHistory changes once a day, so
// history-derived reads are cached with this in the key (recompute daily, not per
// request). This is the canonical home for the helper; screener.ts and
// market-index.ts import it from here (avoids an import cycle with market-index).
export function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

// Calendar day (date-only) in Australia/Sydney, as an actual Date rather than
// sydneyDayKey's string — the price-history x-axis bucket, so there's exactly
// one snapshot per constituent per local day. The canonical home for the same
// reason as sydneyDayKey above: BOTH price-import.ts and sealed-import.ts
// write snapshots and need this, and price-import.ts already imports FROM
// sealed-import.ts (importSealed), so putting it in either writer would risk
// a real import cycle — this module is the neutral ground both sit above.
export function sydneyDay(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

// DAILY SNAPSHOTS. Was weekly (7) while every reader queried Postgres
// directly at request time — the cost control was on the READ side, not the
// write side, and a write is cheap ingress regardless of cadence. Since
// src/lib/history-store.ts moved every request-time reader in THIS file off
// Postgres and onto the daily-published `data` branch (see DECISIONS.md,
// "History off Neon"), the read-rate argument for a weekly cadence no longer
// applies here — writing daily just means the CDN-served series is daily
// too. SealedPriceHistory (src/lib/sealed-import.ts) still reads Postgres
// directly at request time and keeps its own weekly gate
// (SEALED_HISTORY_MIN_INTERVAL_DAYS in sealed-import.ts) until it gets the
// same treatment.
export const HISTORY_MIN_INTERVAL_DAYS = 1;

// SealedPriceHistory (src/lib/sealed-import.ts) is a SEPARATE table with its
// own writer and, for now, its own Postgres reader (sealed-rise-predictor.ts
// still queries it directly at request time — it has not had the
// history-store.ts treatment yet). Its own constant, kept weekly, so this
// file's move to daily writes does not silently widen sealed's read cost
// too. Same neutral home as sydneyDay/HISTORY_MIN_INTERVAL_DAYS above, for
// the same import-cycle reason (price-import.ts imports FROM
// sealed-import.ts).
export const SEALED_HISTORY_MIN_INTERVAL_DAYS = 7;

// WEEK-scoped cache key, and the reason history reads are affordable.
//
// PriceHistory is written once a week now (see HISTORY_MIN_INTERVAL_DAYS
// above), so a day-scoped key was forcing six whole-market re-scans a
// day to recompute a number that had not changed since the previous Monday. This
// returns the ISO week's Monday, so every history-derived cache recomputes on the
// same rollover the data itself moves on.
//
// Sydney, matching sydneyDayKey and sydneyDay above — the snapshot boundary is
// Sydney midnight, so the week boundary has to agree or a key could roll a day
// before or after the data does.
//
// `d` defaults to now (every existing cache-key caller), but takes any date —
// collapseToWeekly below reuses it to find which week a HISTORICAL row falls
// in, rather than duplicating the same Monday-alignment logic a second time.
export function sydneyWeekKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const monday = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  // Shift back to Monday. getUTCDay(): 0 = Sunday, so Sunday counts as 6 days in.
  const back = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - back);
  return monday.toISOString().slice(0, 10);
}

export type PricePoint = { t: number; v: number };

// Retained as a pure, tested utility (tests/price-history-weekly-bucketing.test.ts)
// even though computePriceHistory below no longer calls it: the JSON series
// published by scripts/export-history.ts is already at most one point per
// day (PriceHistory.day is unique per card), so there is nothing left to
// bucket at read time. Kept for any future raw-Postgres reader that still
// needs to collapse legacy dense history the way this always did.
export function collapseToWeekly<T extends { day: Date; lowestPriceCents: number }>(rows: T[]): T[] {
  const byWeek = new Map<string, T>();
  for (const r of rows) {
    const key = sydneyWeekKey(r.day);
    const cur = byWeek.get(key);
    if (!cur || r.lowestPriceCents < cur.lowestPriceCents) byWeek.set(key, r);
  }
  return [...byWeek.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
}

// One card's daily price series (oldest → newest), in that market's OWN
// currency. Reads src/lib/history-store.ts's CDN-published JSON instead of
// Postgres — see DECISIONS.md, "History off Neon" — so this never opens a
// database connection. AU/US/UK/SG each have a genuine tracked series (see
// price-import.ts); CA and EU are historySource()-derived from US and UK,
// converted back to CAD/EUR below. Resilient: returns [] on any fetch/parse
// failure so a page never crashes over the chart, exactly like the Postgres
// read it replaces.
async function computePriceHistory(cardId: string, country: Country, take: number): Promise<PricePoint[]> {
  try {
    const { convert } = historySource(country);
    const series = await getCardSeries(cardId);
    if (!series || series.p.length === 0) return [];
    // Already sorted ascending by scripts/export-history.ts and at most one
    // point per day, so `take` is a straightforward "last N days" slice —
    // no bucketing needed the way legacy dense-daily Postgres rows once did.
    const recent = series.p.slice(-take);
    return recent.map(([dayIdx, usdCents]) => ({ t: dayIndexToDate(dayIdx).getTime(), v: convert(usdCents) }));
  } catch {
    return [];
  }
}

// Day-scoped cache per (card, market) — the `data` branch (and this file's
// own writer) publishes at most once a day now, so a day-scoped key matches
// the real update cadence exactly (see HISTORY_MIN_INTERVAL_DAYS above).
//
// `take` is 150: at one point per day that is five months of chart. Raised
// from the old weekly-cadence default of 60 (which, at one point per WEEK,
// covered a comparable stretch) now that the series can genuinely hold a
// point per day.
export function getPriceHistory(cardId: string, country: Country = DEFAULT_COUNTRY, take = 150): Promise<PricePoint[]> {
  return cachedOrDirect(
    () => computePriceHistory(cardId, country, take),
    ["rc-card-history", cardId, country, String(take), sydneyDayKey()],
    { revalidate: HISTORY_CACHE_TTL, tags: [HISTORY_TAG] },
  );
}

export type Mover = {
  card: CardTileData;
  points: PricePoint[]; // sparkline series (AU)
  nowCents: number;
  refCents: number; // the comparison baseline (≈7 days ago, or recent high for value)
  pct: number; // signed % change vs refCents
};

export type PriceMovers = { spiking: Mover[]; plummeting: Mover[]; value: Mover[] };

// REMOVED 2026-09-17: MoverSummary / PulseMovers / toPulseMovers existed only
// to trim this shape at the server/client boundary for the homepage's Market
// Pulse marquee, which was removed from the homepage in the same pass (owner's
// instruction — see DECISIONS.md). With no client component consuming a
// trimmed mover list, the trim had nothing left to trim for, so it went with
// it rather than sitting here as a helper with no callers.
//
// getPriceMovers()'s real callers (/movers, /games, the newsletter digest) are
// untouched and still get the full PriceMovers shape, sparkline points and all.

// Only consider cards worth caring about, to keep the lists signal-rich (a $0.50
// common doubling to $1 isn't interesting).
const MIN_CENTS = 300; // $3
// 21 (was 35) — cut for history-DB egress: this reads the WHOLE market's history
// every recompute (~1200 cards × WINDOW_DAYS rows), so each day trimmed here is a
// direct, proportional cut. 21 days still comfortably covers the 7-day-back
// reference the movers calc needs; "recent high" just means a slightly shorter
// lookback (3 weeks instead of 5).
const WINDOW_DAYS = 21;
const LIST_SIZE = 5;

// The daily import's price-history snapshot write is best-effort (see
// price-import.ts's try/catch around dbHistory.priceHistory.createMany), and
// the daily export to the `data` branch (scripts/export-history.ts) is a
// SEPARATE step again, non-fatal on its own failure. Either can fail silently
// for a day or more while the rest of the pipeline keeps succeeding, since
// Card.lowestPriceCents itself updates via an unrelated path. When that
// happens, the freshest point in the published window can be stale, and "now"
// vs "~7 days ago" stops meaning what a visitor would read it as. Refuse to
// serve movers/recently-updated at all once the freshest snapshot is older
// than this, so the section just doesn't render (both callers already treat
// an empty result as "hide this") instead of presenting stale numbers as
// today's market. MUST EXCEED THE SNAPSHOT INTERVAL, or the feature switches
// itself off.
//
// Back to 3 days (was 10 while snapshots were weekly — see git history):
// HISTORY_MIN_INTERVAL_DAYS moved back to 1 once every reader here moved off
// Postgres (DECISIONS.md, "History off Neon"), so the freshest point should
// again routinely be 0-1 days old, and 3 days is a genuine outage's worth of
// grace, not a normal week's.
export const STALE_HISTORY_MS = 3 * 86400_000;

// Compute this-week's biggest gainers, biggest fallers, and best-value buys (the
// largest discounts off a card's recent high). Reads the whole market's history
// window, so it's day-cached below — the raw compute runs once per (market, limit)
// per day regardless of how many pages (home, /movers, /games, Discord) ask for it.
async function computePriceMovers(country: Country, limit: number): Promise<PriceMovers> {
 const empty: PriceMovers = { spiking: [], plummeting: [], value: [] };
 try {
  const { convert } = historySource(country);
  const win = await getWindow(35);
  if (!win) return empty;
  const cutoffIdx = win.days.length - WINDOW_DAYS;
  const rows: { cardId: string; day: Date; lowestPriceCents: number }[] = [];
  for (const [cardId, cents] of Object.entries(win.cards)) {
    for (let i = Math.max(0, cutoffIdx); i < win.days.length; i++) {
      const c = cents[i];
      if (c == null) continue;
      rows.push({ cardId, day: dayIndexToDate(win.days[i]), lowestPriceCents: c });
    }
  }
  if (!rows.length) return empty;
  const latestRowDay = rows.reduce((max, r) => (r.day > max ? r.day : max), rows[0].day).getTime();
  if (Date.now() - latestRowDay > STALE_HISTORY_MS) return empty;

  // Group into per-card series.
  const series = new Map<string, PricePoint[]>();
  for (const r of rows) {
    const arr = series.get(r.cardId) ?? [];
    arr.push({ t: r.day.getTime(), v: convert(r.lowestPriceCents) });
    series.set(r.cardId, arr);
  }

  const SEVEN = 7 * 86400_000;
  type Stat = { cardId: string; points: PricePoint[]; now: number; ref7: number; high: number; pct7: number; discount: number };
  const stats: Stat[] = [];
  for (const [cardId, pts] of series) {
    if (pts.length < 2) continue;
    const now = pts[pts.length - 1].v;
    if (now < MIN_CENTS) continue;
    const nowT = pts[pts.length - 1].t;
    // Point closest to 7 days ago (fall back to the oldest we have).
    let ref7 = pts[0];
    for (const p of pts) if (Math.abs(p.t - (nowT - SEVEN)) < Math.abs(ref7.t - (nowT - SEVEN))) ref7 = p;
    const high = Math.max(...pts.map((p) => p.v));
    const pct7 = ref7.v > 0 ? ((now - ref7.v) / ref7.v) * 100 : 0;
    const discount = high > 0 ? ((high - now) / high) * 100 : 0;
    stats.push({ cardId, points: pts, now, ref7: ref7.v, high, pct7, discount });
  }

  // Outlier guard: a ≥80% one-week swing (or ≥80% off the recent high) is almost
  // always a data-quality artifact — a mismatched listing or a one-off junk price —
  // not a real market move, so we drop it rather than headline an absurd %. An
  // equally-absurd spike (≥300%) is the same bug in the other direction.
  const OUTLIER_DROP = 80;
  const OUTLIER_SPIKE = 300;
  const spikingStats = stats.filter((s) => s.pct7 > 1 && s.pct7 < OUTLIER_SPIKE).sort((a, b) => b.pct7 - a.pct7).slice(0, limit);
  const plummetStats = stats.filter((s) => s.pct7 < -1 && s.pct7 > -OUTLIER_DROP).sort((a, b) => a.pct7 - b.pct7).slice(0, limit);
  // Best value = biggest discount off the recent high (and actually down, not flat).
  const valueStats = stats.filter((s) => s.discount > 5 && s.discount < OUTLIER_DROP && s.now < s.high).sort((a, b) => b.discount - a.discount).slice(0, limit);

  // Hydrate tile data for every card we'll show (in the requested market's currency).
  const ids = Array.from(new Set([...spikingStats, ...plummetStats, ...valueStats].map((s) => s.cardId)));
  if (!ids.length) return empty;
  // withStoreCounts: this feed is hydrated for ONE market and rendered on the
  // ISR-cached homepage, where CardTile re-prices to the visitor's market on the
  // client — so the tile needs every market's in-stock count, not just this
  // one's, or it shows one market's price beside another's store count.
  const cards = await withStoreCounts(
    await prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) })
  );
  const byId = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));

  const toMover = (s: Stat, ref: number, pct: number): Mover | null => {
    const card = byId.get(s.cardId);
    if (!card) return null;
    return { card, points: s.points, nowCents: s.now, refCents: ref, pct: Math.round(pct * 10) / 10 };
  };
  const clean = (arr: (Mover | null)[]) => arr.filter((m): m is Mover => m !== null);

  return {
    spiking: clean(spikingStats.map((s) => toMover(s, s.ref7, s.pct7))),
    plummeting: clean(plummetStats.map((s) => toMover(s, s.ref7, s.pct7))),
    value: clean(valueStats.map((s) => toMover(s, s.high, -s.discount))),
  };
 } catch {
  return empty;
 }
}

export type RecentUpdate = {
  card: CardTileData;
  prevCents: number;
  nowCents: number;
  pct: number; // signed % change vs the previous recorded point
};

// Only look back far enough to find each card's PRIOR point — 7 days is generous
// slack for a card that occasionally misses a day (out of stock, a slow crawl),
// while staying an order of magnitude cheaper than the movers query's 21-day
// window. This function only ever needs "yesterday vs today", not a trend.
// Widened from 7 with the move to weekly snapshots. computeRecentlyUpdated needs
// at least two points per card to detect a change, and a 7-day window over weekly
// data often holds exactly one — which would have made this return empty most of
// the time rather than obviously break. 21 days guarantees three.
const RECENT_WINDOW_DAYS = 21;
const RECENT_MAX = 80; // upper bound requested for the homepage feed

// Cards whose price genuinely changed in the MOST RECENT snapshot — "just
// moved", not "moved sometime this week" (that's what /movers already covers
// with a curated top-5-per-category view over a 21-day window). This is
// deliberately a wider, rawer list: every real change from the latest import,
// for a homepage feed that exists to (a) give crawlers dozens of fresh internal
// links every day and (b) give a returning visitor a reason to look again.
// Never fabricated — a card only appears here because two consecutive
// PriceHistory rows for it genuinely differ.
async function computeRecentlyUpdated(country: Country, limit: number): Promise<RecentUpdate[]> {
  try {
    const { convert } = historySource(country);
    const win = await getWindow(35);
    if (!win) return [];
    const cutoffIdx = Math.max(0, win.days.length - RECENT_WINDOW_DAYS);
    const rows: { cardId: string; day: Date; lowestPriceCents: number }[] = [];
    for (const [cardId, cents] of Object.entries(win.cards)) {
      for (let i = cutoffIdx; i < win.days.length; i++) {
        const c = cents[i];
        if (c == null) continue;
        rows.push({ cardId, day: dayIndexToDate(win.days[i]), lowestPriceCents: c });
      }
    }
    if (!rows.length) return [];

    const latestDay = rows.reduce((max, r) => (r.day > max ? r.day : max), rows[0].day).getTime();
    if (Date.now() - latestDay > STALE_HISTORY_MS) return [];

    const series = new Map<string, { day: number; v: number }[]>();
    for (const r of rows) {
      const arr = series.get(r.cardId) ?? [];
      arr.push({ day: r.day.getTime(), v: convert(r.lowestPriceCents) });
      series.set(r.cardId, arr);
    }

    // Same outlier guard as computePriceMovers: a ≥80% one-step swing is almost
    // always a mismatched listing or a one-off junk price, not a real move.
    const OUTLIER_DROP = 80;
    const OUTLIER_SPIKE = 300;
    type Stat = { cardId: string; prev: number; now: number; pct: number };
    const stats: Stat[] = [];
    for (const [cardId, pts] of series) {
      if (pts.length < 2) continue;
      const last = pts[pts.length - 1];
      // Only cards actually touched in the LATEST snapshot qualify — a card whose
      // newest point is from 3 days ago didn't "just move".
      if (last.day !== latestDay) continue;
      const prev = pts[pts.length - 2];
      if (prev.v === last.v) continue; // present in both snapshots but unchanged
      const pct = prev.v > 0 ? ((last.v - prev.v) / prev.v) * 100 : 0;
      if (pct >= OUTLIER_SPIKE || pct <= -OUTLIER_DROP) continue;
      stats.push({ cardId, prev: prev.v, now: last.v, pct });
    }
    if (!stats.length) return [];

    // Biggest genuine moves first, capped to the requested/RECENT_MAX limit —
    // "no silent truncation": this is a deliberate cap on an already-bounded
    // real dataset, not a partial view presented as complete.
    stats.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const top = stats.slice(0, Math.min(limit, RECENT_MAX));

    // Every market's in-stock count, for the same reason as computePriceMovers
    // above: this renders on the ISR-cached homepage and re-prices client-side.
    const cards = await withStoreCounts(
      await prisma.card.findMany({
        where: { id: { in: top.map((s) => s.cardId) } },
        select: cardTileSelect(country),
      })
    );
    const byId = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));

    const out: RecentUpdate[] = [];
    for (const s of top) {
      const card = byId.get(s.cardId);
      if (!card) continue;
      out.push({ card, prevCents: s.prev, nowCents: s.now, pct: Math.round(s.pct * 10) / 10 });
    }
    return out;
  } catch {
    return [];
  }
}

// Day-scoped cache: ONE whole-market history read per market per day, shared
// across the homepage and anything else that asks. Keyed on market+day only
// (not limit), so a bigger caller can't trigger a second read.
export async function getRecentlyUpdated(country: Country = DEFAULT_COUNTRY, limit = 60): Promise<RecentUpdate[]> {
  const full = await cachedOrDirect(
    () => computeRecentlyUpdated(country, RECENT_MAX),
    ["rc-recently-updated", country, sydneyDayKey()],
    { revalidate: HISTORY_CACHE_TTL, tags: [HISTORY_TAG] },
  );
  return full.slice(0, limit);
}

// Day-scoped cache: ONE whole-market history read per market per day, shared across
// the homepage, /movers, /games and the Discord bot. The raw read is identical for
// any list size, so we compute at a generous cap (keyed by market+day only, NOT
// limit) and slice to the caller's limit — so a bigger /movers list can't trigger a
// second read. Auto-refreshes at the day rollover.
const MOVERS_MAX = 50;
export async function getPriceMovers(country: Country = DEFAULT_COUNTRY, limit = LIST_SIZE): Promise<PriceMovers> {
  const full = await cachedOrDirect(
    () => computePriceMovers(country, MOVERS_MAX),
    ["rc-price-movers", country, sydneyDayKey()],
    { revalidate: HISTORY_CACHE_TTL, tags: [HISTORY_TAG] },
  );
  return {
    spiking: full.spiking.slice(0, limit),
    plummeting: full.plummeting.slice(0, limit),
    value: full.value.slice(0, limit),
  };
}
