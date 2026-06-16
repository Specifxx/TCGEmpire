// Value-finder screener (Premium): cards trading meaningfully BELOW their own
// recent average — a mean-reversion signal flippers and value buyers want. Unlike
// /movers (raw recent % drops), this compares today's lowest to the card's ~30-day
// average, so a card that's been quietly cheap for a while still surfaces.
//
// Egress-bounded: we scan the most-searched (i.e. liquid) priced cards only, then
// pull just those cards' recent history — never the whole PriceHistory table.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { pickPrice, priceField, type Country } from "./country";

const SCAN_CARDS = 400; // most-searched priced cards to consider
const WINDOW_DAYS = 30;
const MIN_POINTS = 5; // need enough history for an average to mean anything
const MIN_PRICE_CENTS = 300; // ignore sub-$3 noise
const MIN_DISCOUNT = 0.08; // at least 8% below the average to list

export interface ValuePick {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  currentCents: number;
  avgCents: number; // mean lowest over the window
  highCents: number; // max lowest over the window
  discountPct: number; // how far below the average (positive = cheaper than usual)
  offHighPct: number; // how far below the window high
}

export async function getUndervalued(country: Country, limit = 24): Promise<ValuePick[]> {
  try {
    const field = priceField(country);
    const where: Prisma.CardWhereInput = { variant: null, isPromo: false };
    where[field] = { not: null };
    const cards = await prisma.card.findMany({
      where,
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
      take: SCAN_CARDS,
      select: {
        id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true,
        lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
      },
    });
    if (!cards.length) return [];

    const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const hist = await prisma.priceHistory.findMany({
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
      picks.push({
        id: c.id, name: c.name, slug: c.slug, setCode: c.setCode, collectorNumber: c.collectorNumber, imageThumbUrl: c.imageThumbUrl,
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
