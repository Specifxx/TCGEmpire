// Price-history helpers: per-card time series for the charts, the weekly
// "movers" used by the homepage Price Watch, and the homepage's "recently
// updated" feed. PriceHistory records one lowest-price point per card PER
// MARKET per Sydney day (AU/US/UK/SG — see price-import.ts's snapshot
// write), so every function here takes a `country` and is priced in that
// market's own currency; nothing below is AU-only despite this file's history.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { cardTileSelect } from "./cards";
import { DEFAULT_COUNTRY, type Country } from "./country";
import type { CardTileData } from "@/components/CardTile";
import { CONTENT_TAG } from "./revalidate-content";

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

// Calendar day in Australia/Sydney — see market-index. PriceHistory changes once a
// day, so history-derived reads are cached with this in the key (recompute daily,
// not per request). Kept local to avoid an import cycle with market-index.
export function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

export type PricePoint = { t: number; v: number };

// Daily lowest-price points for one card in one market (oldest → newest), in that
// market's OWN currency. The importer records a real point per card per market per
// Sydney day (AU/US/UK — see price-import.ts), so each market has its own genuine
// series — no currency conversion needed. Resilient: returns [] on any DB error so a
// page never crashes over the chart.
async function computePriceHistory(cardId: string, country: Country, take: number): Promise<PricePoint[]> {
  try {
    const rows = await dbHistory.priceHistory.findMany({
      where: { cardId, country },
      orderBy: { day: "asc" },
      take,
      select: { day: true, lowestPriceCents: true },
    });
    return rows.map((r) => ({ t: r.day.getTime(), v: r.lowestPriceCents }));
  } catch {
    return [];
  }
}

// Day-scoped cache per (card, market): repeated views of the same card's chart in a
// day read the history DB once, not once per page load. Only cards actually viewed
// get cached, so this never over-reads. Window trimmed to 120 days (2× the useful
// chart range) to cap the per-read payload.
export function getPriceHistory(cardId: string, country: Country = DEFAULT_COUNTRY, take = 120): Promise<PricePoint[]> {
  return cachedOrDirect(
    () => computePriceHistory(cardId, country, take),
    ["rc-card-history", cardId, country, String(take), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
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
const STALE_HISTORY_MS = 3 * 86400_000;

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
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) });
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
const RECENT_WINDOW_DAYS = 7;
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

    const cards = await prisma.card.findMany({
      where: { id: { in: top.map((s) => s.cardId) } },
      select: cardTileSelect(country),
    });
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
    { revalidate: 172800, tags: [CONTENT_TAG] },
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
    { revalidate: 172800, tags: [CONTENT_TAG] },
  );
  return {
    spiking: full.spiking.slice(0, limit),
    plummeting: full.plummeting.slice(0, limit),
    value: full.value.slice(0, limit),
  };
}
