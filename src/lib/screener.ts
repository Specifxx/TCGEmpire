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
import { CONTENT_TAG } from "./revalidate-content";
import { sydneyDayKey } from "./market-index";

const SCAN_CARDS = 400; // most-searched priced cards to consider
const WINDOW_DAYS = 30;
const MIN_POINTS = 5; // need enough history for an average to mean anything
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

async function computeUndervalued(country: Country, limit: number): Promise<ValuePick[]> {
  try {
    const field = priceField(country);
    const where: Prisma.CardWhereInput = { variant: null, isPromo: false };
    where[field] = { not: null };
    const cards = await prisma.card.findMany({
      where,
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
      take: SCAN_CARDS,
      select: cardTileSelect(country),
    });
    if (!cards.length) return [];

    const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const hist = await dbHistory.priceHistory.findMany({
      where: { country, cardId: { in: cards.map((c) => c.id) }, day: { gte: cutoff } },
      select: { cardId: true, lowestPriceCents: true },
    });
    const byCard = new Map<string, number[]>();
    for (const h of hist) (byCard.get(h.cardId) ?? byCard.set(h.cardId, []).get(h.cardId)!).push(h.lowestPriceCents);

    const picks: ValuePick[] = [];
    for (const c of cards) {
      const current = pickPrice(c, country);
      const series = byCard.get(c.id);
      if (current == null || current < MIN_PRICE_CENTS || !series || series.length < MIN_POINTS) continue;
      const avg = series.reduce((a, b) => a + b, 0) / series.length;
      const high = Math.max(...series);
      if (avg <= 0) continue;
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

// Day-scoped cache: the undervalued scan reads a chunk of PriceHistory, so run it
// once per (market, limit) per day and share across every visitor of the
// value-finder page. Auto-refreshes at the day rollover.
export function getUndervalued(country: Country, limit = 24): Promise<ValuePick[]> {
  return unstable_cache(
    () => computeUndervalued(country, limit),
    ["rc-undervalued", country, String(limit), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}
