import { prisma } from "../db";

// ONE SISTER SITE'S PUBLIC SCORE AND REVIEWS (lib/site-reviews/sites.ts), as
// served by /api/site-reviews/<key>.
//
// • The score is every star rating that site's visitors sent, at once and
//   unmoderated (owner, 2026-11-03: "star reviews are automatically on the
//   website"). A "rating-review" row repeats the stars of a rating already
//   counted, so it is left out, exactly as lib/site-rating.ts does for
//   RiftCompare.
// • A written review appears only when its writer left "Show my review" ticked
//   AND an admin approved it in /admin/reviews (the lib/reviews.ts rule).
// • Never the email, the page or anything else: the select below is the whole
//   public payload.
//
// Two indexed reads per site, memoised on globalThis for six hours (the
// lib/reviews.ts convention, not unstable_cache: see lib/db.ts), and the CDN
// keeps the route's answer six hours on top. Any error is "nothing yet".

export interface PublicSiteReview {
  id: string;
  rating: number | null;
  message: string;
  name: string;
  /** YYYY-MM-DD the review was published. */
  date: string;
}

export type StarSplit = Record<"1" | "2" | "3" | "4" | "5", number>;

export interface SiteReviewsPayload {
  site: string;
  rating: { average: number; count: number; split: StarSplit } | null;
  reviews: PublicSiteReview[];
}

export const MAX_PUBLIC_REVIEWS = 24;
const TTL_MS = 6 * 60 * 60_000;

type Row = { id: string; rating: number | null; message: string; displayName: string | null; publishedAt: Date | null };

/** Pure: rows from the two reads → the public payload. */
export function shapeSiteReviews(site: string, split: { rating: number | null; count: number }[], rows: Row[]): SiteReviewsPayload {
  const s: StarSplit = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let count = 0;
  let sum = 0;
  for (const g of split) {
    if (g.rating == null || g.rating < 1 || g.rating > 5 || !Number.isInteger(g.rating)) continue;
    s[String(g.rating) as keyof StarSplit] += g.count;
    count += g.count;
    sum += g.rating * g.count;
  }
  const rating = count > 0 ? { average: Math.round((sum / count) * 10) / 10, count, split: s } : null;
  const reviews = rows
    .filter((r) => r.message.trim() && r.publishedAt)
    .slice(0, MAX_PUBLIC_REVIEWS)
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      message: r.message.trim(),
      name: r.displayName?.trim() || "Verified visitor",
      date: r.publishedAt!.toISOString().slice(0, 10),
    }));
  return { site, rating, reviews };
}

const g = globalThis as unknown as { __rcSiteReviews?: Map<string, { at: number; value: SiteReviewsPayload }> };

export async function getSiteReviews(site: string): Promise<SiteReviewsPayload> {
  const now = Date.now();
  const memo = (g.__rcSiteReviews ??= new Map());
  const hit = memo.get(site);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  try {
    const [split, rows] = await Promise.all([
      prisma.feedback.groupBy({
        by: ["rating"],
        // A row marked spam in /admin/reviews leaves the score too.
        where: { site, rating: { not: null }, status: { not: "SPAM" }, NOT: { source: "rating-review" } },
        _count: { _all: true },
      }),
      prisma.feedback.findMany({
        where: { site, status: "APPROVED", consentPublic: true, publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: MAX_PUBLIC_REVIEWS,
        // Explicit select: never the email, the page or the user.
        select: { id: true, rating: true, message: true, displayName: true, publishedAt: true },
      }),
    ]);
    const value = shapeSiteReviews(
      site,
      split.map((x) => ({ rating: x.rating, count: x._count._all })),
      rows,
    );
    memo.set(site, { at: now, value });
    return value;
  } catch {
    return { site, rating: null, reviews: [] };
  }
}
