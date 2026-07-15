// Price-history helpers: per-card time series for the charts, and the weekly
// "movers" used by the homepage Price Watch. PriceHistory is recorded for the AU
// market only (one lowest-price point per card per Sydney day), so everything here
// is AU-priced.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { cardTileSelect } from "./cards";
import type { Country } from "./country";
import type { CardTileData } from "@/components/CardTile";
import { CONTENT_TAG } from "./revalidate-content";

// Calendar day in Australia/Sydney — see market-index. PriceHistory changes once a
// day, so history-derived reads are cached with this in the key (recompute daily,
// not per request). Kept local to avoid an import cycle with market-index.
function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

export type PricePoint = { t: number; v: number };

// Daily lowest-price points for one card in one market (oldest → newest), in that
// market's OWN currency. The importer records a real point per card per market per
// Sydney day (AU/NZ/US/UK — see price-import.ts), so each market has its own genuine
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
export function getPriceHistory(cardId: string, country: Country = "AU", take = 120): Promise<PricePoint[]> {
  return unstable_cache(
    () => computePriceHistory(cardId, country, take),
    ["rc-card-history", cardId, country, String(take), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
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
const WINDOW_DAYS = 35;
const LIST_SIZE = 5;

// Compute this-week's biggest gainers, biggest fallers, and best-value buys (the
// largest discounts off a card's recent high). Reads the whole market's 35-day
// history, so it's day-cached below — the raw compute runs once per (market, limit)
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

// Day-scoped cache: one raw compute per (market, limit) per day, shared across the
// homepage, /movers, /games and the Discord bot — instead of a fresh whole-market
// history read on each. Auto-refreshes at the day rollover.
export function getPriceMovers(country: Country = "AU", limit = LIST_SIZE): Promise<PriceMovers> {
  return unstable_cache(
    () => computePriceMovers(country, limit),
    ["rc-price-movers", country, String(limit), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}
