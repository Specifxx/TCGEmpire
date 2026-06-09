// Price-history helpers: per-card time series for the charts, and the weekly
// "movers" used by the homepage Price Watch. PriceHistory is recorded for the AU
// market only (one lowest-price point per card per Sydney day), so everything here
// is AU-priced.
import { prisma } from "./db";
import { cardTileSelect } from "./cards";
import type { Country } from "./country";
import type { CardTileData } from "@/components/CardTile";

export type PricePoint = { t: number; v: number };

// Daily lowest-price points for one card in one market (oldest → newest). Each
// market is priced in its own currency.
export async function getPriceHistory(cardId: string, country = "AU", take = 180): Promise<PricePoint[]> {
  const rows = await prisma.priceHistory.findMany({
    where: { cardId, country },
    orderBy: { day: "asc" },
    take,
    select: { day: true, lowestPriceCents: true },
  });
  return rows.map((r) => ({ t: r.day.getTime(), v: r.lowestPriceCents }));
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
// largest discounts off a card's recent high). Cheap enough to run inside the
// homepage's ISR window.
export async function getPriceMovers(country: Country = "AU"): Promise<PriceMovers> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const rows = await prisma.priceHistory.findMany({
    where: { country, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { cardId: true, day: true, lowestPriceCents: true },
  });
  if (!rows.length) return { spiking: [], plummeting: [], value: [] };

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

  const spikingStats = stats.filter((s) => s.pct7 > 1).sort((a, b) => b.pct7 - a.pct7).slice(0, LIST_SIZE);
  const plummetStats = stats.filter((s) => s.pct7 < -1).sort((a, b) => a.pct7 - b.pct7).slice(0, LIST_SIZE);
  // Best value = biggest discount off the recent high (and actually down, not flat).
  const valueStats = stats.filter((s) => s.discount > 5 && s.now < s.high).sort((a, b) => b.discount - a.discount).slice(0, LIST_SIZE);

  // Hydrate tile data for every card we'll show (in the requested market's currency).
  const ids = Array.from(new Set([...spikingStats, ...plummetStats, ...valueStats].map((s) => s.cardId)));
  if (!ids.length) return { spiking: [], plummeting: [], value: [] };
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
}
