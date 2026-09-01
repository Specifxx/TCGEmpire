// Price-history helpers: per-card time series for the charts, the weekly
// "movers" used by the homepage Price Watch, and the homepage's "recently
// updated" feed. PriceHistory records one lowest-price point per card PER
// MARKET per Sydney day (AU/US/UK/SG/CA/EU — see price-import.ts's snapshot
// write), so every function here takes a `country` and is priced in that
// market's own currency; nothing below is AU-only despite this file's history.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { cardTileSelect, withStoreCounts } from "./cards";
import { DEFAULT_COUNTRY, type Country } from "./country";
import type { CardTileData } from "@/components/CardTile";
import { HISTORY_TAG } from "./revalidate-content";

// One week plus a day of slack. The cache keys below are week-scoped, so the TTL
// only has to outlive one key — a shorter TTL (the old 48h) would expire the
// entry mid-week and trigger a fresh whole-market scan for nothing.
const HISTORY_CACHE_TTL = 8 * 86400;

// unstable_cache requires Next.js's request-scoped incremental cache, which doesn't
// exist when this module is imported by a plain tsx script (e.g. scripts/weekly-promo.ts)
// run outside the Next.js runtime — it throws "Invariant: incrementalCache missing"
// rather than caching. There, caching buys nothing anyway (a one-shot process never
// reuses it), so fall back to calling the function directly instead of failing the
// whole script. Any OTHER unstable_cache error still throws as normal.
export async function cachedOrDirect<T>(fn: () => Promise<T>, keys: string[], opts: { revalidate: number; tags: string[] }): Promise<T> {
  try {
    return await unstable_cache(fn, keys, opts)();
  } catch (e) {
    if (e instanceof Error && e.message.includes("incrementalCache missing")) return fn();
    throw e;
  }
}

// Calendar day in Australia/Sydney. PriceHistory changes once a day, so
// history-derived reads are cached with this in the key (recompute daily, not per
// request). This is the canonical home for the helper; screener.ts and
// market-index.ts import it from here (avoids an import cycle with market-index).
export function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

// WEEK-scoped cache key, and the reason history reads are affordable.
//
// PriceHistory is written once a week now (see HISTORY_MIN_INTERVAL_DAYS in
// price-import.ts), so a day-scoped key was forcing six whole-market re-scans a
// day to recompute a number that had not changed since the previous Monday. This
// returns the ISO week's Monday, so every history-derived cache recomputes on the
// same rollover the data itself moves on.
//
// Sydney, matching sydneyDayKey and the importer's own sydneyDay() — the snapshot
// boundary is Sydney midnight, so the week boundary has to agree or a key could
// roll a day before or after the data does.
export function sydneyWeekKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  // Shift back to Monday. getUTCDay(): 0 = Sunday, so Sunday counts as 6 days in.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export type PricePoint = { t: number; v: number };

// Daily lowest-price points for one card in one market (oldest → newest), in that
// market's OWN currency. The importer records a real point per card per market per
// Sydney day (AU/US/UK/SG/CA/EU — see price-import.ts), so each market has its own genuine
// series — no currency conversion needed. Resilient: returns [] on any DB error so a
// page never crashes over the chart.
async function computePriceHistory(cardId: string, country: Country, take: number): Promise<PricePoint[]> {
  try {
    // TAKE THE NEWEST `take` POINTS, THEN RESTORE ASCENDING ORDER FOR THE CHART.
    //
    // This was `orderBy: { day: "asc" }, take` — which takes the OLDEST `take`
    // rows, not the most recent. It has been harmless only because no card has
    // had more than `take` points yet; the moment one did, its chart would have
    // frozen on the oldest window and never moved again. Cutting `take` (below)
    // to save egress would have brought that forward rather than avoided it, so
    // the ordering is fixed here first.
    const rows = await dbHistory.priceHistory.findMany({
      where: { cardId, country },
      orderBy: { day: "desc" },
      take,
      select: { day: true, lowestPriceCents: true },
    });
    return rows.reverse().map((r) => ({ t: r.day.getTime(), v: r.lowestPriceCents }));
  } catch {
    return [];
  }
}

// Week-scoped cache per (card, market). PriceHistory only gains a point once a
// week now, so a day-scoped key re-read every viewed card's series six times a
// week to rebuild an identical chart.
//
// `take` is 60 rather than 120: at one point per week that is over a year of
// chart, where 120 would be nearly two and a half years of a game that has
// existed for one. It also halves the payload of the single most-requested
// history read on the site — there is one per card page.
export function getPriceHistory(cardId: string, country: Country = DEFAULT_COUNTRY, take = 60): Promise<PricePoint[]> {
  return cachedOrDirect(
    () => computePriceHistory(cardId, country, take),
    ["rc-card-history", cardId, country, String(take), sydneyWeekKey()],
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

// Lean shape for MarketPulse — the homepage's client-rendered risers/fallers
// marquee (see components/home/MarketPulse.tsx). It ships ALL FIVE markets'
// worth of movers at once (so a visitor switching markets client-side doesn't
// need a refetch — same reasoning as CardTile's multi-market price fields),
// but PulseCard only ever reads a Mover's `.card`, `.nowCents` and `.pct` —
// never `.points` (the per-card sparkline series /movers' own chart renders,
// unused here) and never PriceMovers.value (the "best value vs recent high"
// list /movers and the weekly digest use, which MarketPulse never renders at
// all — see its own source). Passing the full shape through five markets'
// worth of movers was serializing ~30 unused "value" cards plus a ~21-point
// sparkline series on every remaining mover into the homepage's hydration
// payload for a component that renders none of it. toPulseMovers() strips
// both right at the server/client boundary, in HomeSections.tsx, without
// touching this function's real callers (/movers, /games, the newsletter
// digest) which still get the full PriceMovers shape, points and all.
export type MoverSummary = Omit<Mover, "points">;
export type PulseMovers = { spiking: MoverSummary[]; plummeting: MoverSummary[] };
export function toPulseMovers(m: PriceMovers): PulseMovers {
  const strip = ({ points: _points, ...rest }: Mover): MoverSummary => rest;
  return { spiking: m.spiking.map(strip), plummeting: m.plummeting.map(strip) };
}

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
// price-import.ts's try/catch around dbHistory.priceHistory.createMany) — it can
// fail silently for days at a time (e.g. an FK mismatch after a catalogue
// rebuild, or the history project being unreachable) while the rest of the
// import keeps succeeding, since Card.lowestPriceCents itself updates via a
// separate path. When that happens, the LATEST row in PriceHistory can be many
// days old, and "now" vs "~7 days ago" stops meaning what a visitor would read
// it as — a stale $6.00 shown as today's price next to a wild swing against an
// equally stale reference reads as "this data is wrong", not "the site hasn't
// updated in a while". Refuse to serve movers/recently-updated at all once the
// freshest snapshot is older than this, so the section just doesn't render
// (both callers already treat an empty result as "hide this") instead of
// presenting stale numbers as today's market.
// MUST EXCEED THE SNAPSHOT INTERVAL, or the feature switches itself off.
//
// This was 3 days, which was correct while snapshots were daily. With weekly
// snapshots the freshest point is routinely 4-7 days old, so a 3-day threshold
// would have judged every normal week "stale" and returned empty — movers and
// recently-updated would simply have stopped rendering, silently, with no error.
// 10 days is one weekly cycle plus three days of grace, so it still catches a
// genuinely broken importer (two missed weeks) without firing on a healthy one.
export const STALE_HISTORY_MS = 10 * 86400_000;

// Compute this-week's biggest gainers, biggest fallers, and best-value buys (the
// largest discounts off a card's recent high). Reads the whole market's history
// window, so it's day-cached below — the raw compute runs once per (market, limit)
// per day regardless of how many pages (home, /movers, /games, Discord) ask for it.
async function computePriceMovers(country: Country, limit: number): Promise<PriceMovers> {
 const empty: PriceMovers = { spiking: [], plummeting: [], value: [] };
 try {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const rows = await dbHistory.priceHistory.findMany({
    where: { country, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { cardId: true, day: true, lowestPriceCents: true },
  });
  if (!rows.length) return empty;
  const latestRowDay = rows.reduce((max, r) => (r.day > max ? r.day : max), rows[0].day).getTime();
  if (Date.now() - latestRowDay > STALE_HISTORY_MS) return empty;

  // Group into per-card series.
  const series = new Map<string, PricePoint[]>();
  for (const r of rows) {
    const arr = series.get(r.cardId) ?? [];
    arr.push({ t: r.day.getTime(), v: r.lowestPriceCents });
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
    const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 86400_000);
    const rows = await dbHistory.priceHistory.findMany({
      where: { country, day: { gte: cutoff } },
      orderBy: { day: "asc" },
      select: { cardId: true, day: true, lowestPriceCents: true },
    });
    if (!rows.length) return [];

    const latestDay = rows.reduce((max, r) => (r.day > max ? r.day : max), rows[0].day).getTime();
    if (Date.now() - latestDay > STALE_HISTORY_MS) return [];

    const series = new Map<string, { day: number; v: number }[]>();
    for (const r of rows) {
      const arr = series.get(r.cardId) ?? [];
      arr.push({ day: r.day.getTime(), v: r.lowestPriceCents });
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
    ["rc-recently-updated", country, sydneyWeekKey()],
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
    ["rc-price-movers", country, sydneyWeekKey()],
    { revalidate: HISTORY_CACHE_TTL, tags: [HISTORY_TAG] },
  );
  return {
    spiking: full.spiking.slice(0, limit),
    plummeting: full.plummeting.slice(0, limit),
    value: full.value.slice(0, limit),
  };
}
