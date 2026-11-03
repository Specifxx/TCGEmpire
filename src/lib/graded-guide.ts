// The graded price guide, /graded (DECISIONS.md, "Graded price guide",
// 2026-10-27): every Riftbound card with a live graded slab on eBay, its
// cheapest PSA 10, PSA 9, BGS and CGC asking price, and the raw card beside it.
// It answers "what is a PSA 10 X worth", which the card pages answer one card at
// a time behind a tab. Read from the newest public graded day file
// (lib/price-history-store.ts), which the daily eBay pass writes: asking prices
// of live listings, converted to US dollars, never sales.
import { compareGrades } from "./graded-history";
import type { GradedDayFile } from "./price-history-store";

/** The columns, best first. Other grades still count toward a card's row. */
export const GUIDE_GRADES = ["PSA 10", "PSA 9", "BGS 10", "BGS 9.5", "CGC 10"] as const;

export interface GradedGuideCard {
  id: string;
  slug: string | null;
  name: string;
  setName: string;
  collectorNumber: string;
}

export interface GradedGuideRow {
  card: GradedGuideCard;
  /** Grade label → cheapest live listing, US cents. */
  prices: Record<string, number>;
  /** The best grade on offer and its price, for sorting and the headline column. */
  top: { grade: string; cents: number };
  /** Cheapest raw copy we track, US cents, or null. */
  rawCents: number | null;
}

/** Pure: rows for every card the day file names and the catalogue knows, priciest top slab first. */
export function gradedGuideRows(day: GradedDayFile | null, cards: ReadonlyMap<string, GradedGuideCard>, rawBySlug: ReadonlyMap<string, number>): GradedGuideRow[] {
  if (!day?.prices) return [];
  const out: GradedGuideRow[] = [];
  for (const [id, byGrade] of Object.entries(day.prices)) {
    const card = cards.get(id);
    if (!card?.slug) continue;
    const prices: Record<string, number> = {};
    for (const [g, c] of Object.entries(byGrade)) if (Number.isInteger(c) && c > 0) prices[g] = c;
    const grades = Object.keys(prices).sort(compareGrades);
    if (!grades.length) continue;
    const best = grades.includes("PSA 10") ? "PSA 10" : grades[0];
    const raw = rawBySlug.get(card.slug);
    out.push({ card, prices, top: { grade: best, cents: prices[best] }, rawCents: raw && raw > 0 ? raw : null });
  }
  return out.sort((a, b) => b.top.cents - a.top.cents || a.card.name.localeCompare(b.card.name));
}

/** "6.2×" the raw price, or null when either side is missing or the slab is not above raw. */
export function gradedMultiple(row: GradedGuideRow): string | null {
  const p10 = row.prices["PSA 10"];
  if (!p10 || !row.rawCents || p10 <= row.rawCents) return null;
  const x = p10 / row.rawCents;
  return `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`;
}
