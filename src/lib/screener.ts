// Value-finder screener (Premium): cards trading meaningfully BELOW their own
// recent average — a mean-reversion signal flippers and value buyers want. Unlike
// /movers (raw recent % drops), this compares today's lowest to the card's ~30-day
// average, so a card that's been quietly cheap for a while still surfaces.
//
// Egress-bounded: we scan the most-searched (i.e. liquid) priced cards only, then
// pull just those cards' recent history — never the whole PriceHistory table.
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { pickPrice, priceField, type Country } from "./country";
import { cardTileSelect } from "./cards";
import type { CardTileData } from "@/components/CardTile";
import { CONTENT_TAG, HISTORY_TAG } from "./revalidate-content";
import { sydneyDayKey, sydneyWeekKey, historySource } from "./price-history";

const SCAN_CARDS = 400; // most-searched priced cards to consider
const WINDOW_DAYS = 35; // 5 weekly snapshots fit inside this
// 3, not 5: at one snapshot per week (price-import.ts) a 35-day window can
// only ever hold five points, so a floor of 5 demanded a perfect run and
// returned an empty Value Finder on any missed week.
const MIN_POINTS = 3; // need enough history for an average to mean anything
const MIN_PRICE_CENTS = 300; // ignore sub-$3 noise
const MIN_DISCOUNT = 0.08; // at least 8% below the average to list

export interface ValuePick {
  card: CardTileData; // full tile data so the row can open the QuickView popup
  currentCents: number;
  avgCents: number; // mean lowest over the window
  highCents: number; // max lowest over the window
  discountPct: number; // how far below the average (positive = cheaper than usual)
  offHighPct: number; // how far below the window high
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SCAN IS SPLIT IN TWO, BECAUSE ITS TWO HALVES CHANGE AT DIFFERENT RATES.
//
// A value pick is "today's price, against this card's recent average". Those come
// from different databases and different clocks:
//
//   • the AVERAGE is derived from PriceHistory, which is now written weekly — it
//     cannot change between snapshots, and reading it is the expensive part
//     (~400 cards x a 35-day window, per market);
//   • the CURRENT price comes from the operational database, refreshed twice a
//     day — and it is what actually decides whether a card is undervalued today.
//
// Caching them together at one rate forces a choice between a stale Value Finder
// and re-reading history daily for an average that did not move. Split, the
// history read runs once per market per week while the ranking is rebuilt every
// day against fresh prices — daily results, weekly history cost.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-card window statistics. History-derived, so it only moves weekly. */
type Baseline = { cardId: string; avg: number; high: number };

async function computeBaselines(country: Country): Promise<Baseline[]> {
  const field = priceField(country);
  const where: Prisma.CardWhereInput = { variant: null, isPromo: false };
  where[field] = { not: null };
  const ids = (
    await prisma.card.findMany({
      where,
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
      take: SCAN_CARDS,
      select: { id: true },
    })
  ).map((c) => c.id);
  if (!ids.length) return [];

  const { source, convert } = historySource(country);
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const hist = await dbHistory.priceHistory.findMany({
    where: { country: source, cardId: { in: ids }, day: { gte: cutoff } },
    select: { cardId: true, lowestPriceCents: true },
  });

  const byCard = new Map<string, number[]>();
  for (const h of hist) {
    const v = convert(h.lowestPriceCents);
    const series = byCard.get(h.cardId);
    if (series) series.push(v);
    else byCard.set(h.cardId, [v]);
  }

  const out: Baseline[] = [];
  for (const [cardId, series] of byCard) {
    if (series.length < MIN_POINTS) continue;
    const avg = series.reduce((a, b) => a + b, 0) / series.length;
    if (avg <= 0) continue;
    out.push({ cardId, avg, high: Math.max(...series) });
  }
  return out;
}

// Week-scoped: the only history read in this file.
function getBaselines(country: Country): Promise<Baseline[]> {
  return unstable_cache(
    () => computeBaselines(country),
    ["rc-undervalued-baseline", country, sydneyWeekKey()],
    { revalidate: 8 * 86400, tags: [HISTORY_TAG] },
  )();
}

async function computeUndervalued(country: Country, limit: number): Promise<ValuePick[]> {
  try {
    const baselines = await getBaselines(country);
    if (!baselines.length) return [];
    const baseById = new Map(baselines.map((b) => [b.cardId, b]));

    // Operational database only — today's prices for exactly the cards that have
    // a usable baseline. This is the half that re-runs daily.
    const cards = await prisma.card.findMany({
      where: { id: { in: [...baseById.keys()] } },
      select: cardTileSelect(country),
    });

    const picks: ValuePick[] = [];
    for (const c of cards) {
      const current = pickPrice(c, country);
      const base = baseById.get(c.id);
      if (current == null || current < MIN_PRICE_CENTS || !base) continue;
      const { avg, high } = base;
      const discount = (avg - current) / avg;
      if (discount < MIN_DISCOUNT) continue;
      // Outlier guard: ≥80% below its own average isn't a value signal, it's a
      // data-quality artifact (a mismatched/one-off junk price). Skip it.
      if (discount >= 0.8) continue;
      picks.push({
        card: c as unknown as CardTileData,
        currentCents: current,
        avgCents: Math.round(avg),
        highCents: high,
        discountPct: Math.round(discount * 1000) / 10,
        offHighPct: high > 0 ? Math.round(((high - current) / high) * 1000) / 10 : 0,
      });
    }
    picks.sort((a, b) => b.discountPct - a.discountPct);
    return picks.slice(0, limit);
  } catch {
    return [];
  }
}

// DAY-scoped, and CONTENT_TAG, on purpose — the opposite of the history caches.
//
// Everything expensive now sits behind getBaselines() above, which is week-scoped.
// What is left here reads the operational database only, so it can refresh at the
// same rate as prices do: a card that dropped this morning shows up as
// undervalued this morning, not next Monday. CONTENT_TAG means the twice-daily
// price import refreshes it directly, which is exactly what should happen when
// the prices this ranking is built on have just changed.
export async function getUndervalued(country: Country, limit = 24): Promise<ValuePick[]> {
  // Compute at a generous cap keyed by (market, day) only, then slice — so a deeper
  // list can't trigger a second scan.
  const full = await unstable_cache(
    () => computeUndervalued(country, 100),
    ["rc-undervalued", country, sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
  return full.slice(0, limit);
}
