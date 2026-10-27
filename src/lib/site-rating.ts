import { prisma } from "./db";

// THE SITE'S OWN STAR RATING, shown on the Pro page the way Collectr shows its
// App Store rating (owner, 2026-10-26). DECISIONS.md, "Pro: Collectr's model,
// $6.99 or $3.99/mo yearly".
//
// REAL RATINGS ONLY: the average of every star rating visitors sent through
// /api/feedback (the rate prompt, the feedback widget and page), nothing seeded
// and nothing filtered by score. Hidden until MIN_RATINGS_TO_SHOW exist (100
// since 2026-10-27, owner: "once we have like 100 people provide us
// feedback"); "5.0 from 2 ratings" says nothing. A "rating-review" row repeats
// the stars of a rating already counted (the prompt's optional review), so it
// is left out of the average. Never in JSON-LD: a site rating itself is a
// self-serving review, which Google's review-snippet rules exclude.
//
// One aggregate over an indexed column, memoised on globalThis for six hours
// (the reviews.ts convention, not unstable_cache: see the egress rules in
// lib/db.ts). Any error is "no rating", never a broken page.

export const MIN_RATINGS_TO_SHOW = 100;
const TTL_MS = 6 * 60 * 60_000;

export interface SiteRating {
  average: number;
  count: number;
}

const g = globalThis as unknown as { __rcSiteRating?: { at: number; value: SiteRating | null } };

/** The rating to show, or null below the threshold. Pure. */
export function ratingToShow(average: number | null | undefined, count: number): SiteRating | null {
  if (!average || count < MIN_RATINGS_TO_SHOW) return null;
  return { average: Math.round(average * 10) / 10, count };
}

/** "4.7 rating · 23 ratings" */
export function ratingLine(r: SiteRating): string {
  return `${r.average.toFixed(1)} rating · ${r.count.toLocaleString("en-US")} ${r.count === 1 ? "rating" : "ratings"}`;
}

export async function getSiteRating(): Promise<SiteRating | null> {
  const now = Date.now();
  if (g.__rcSiteRating && now - g.__rcSiteRating.at < TTL_MS) return g.__rcSiteRating.value;
  try {
    const agg = await prisma.feedback.aggregate({ where: { rating: { not: null }, NOT: { source: "rating-review" } }, _avg: { rating: true }, _count: { rating: true } });
    const value = ratingToShow(agg._avg.rating, agg._count.rating);
    g.__rcSiteRating = { at: now, value };
    return value;
  } catch {
    return null;
  }
}
