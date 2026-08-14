import { prisma } from "./db";

// Public read of APPROVED reviews.
//
// TWO CONDITIONS, BOTH REQUIRED, and they are not the same condition:
//   • consentPublic — the person ticked "you can show this publicly";
//   • status APPROVED — a human actually read it and published it.
// Consent without moderation would put whatever a stranger typed on the
// homepage; moderation without consent would publish words from someone who
// never agreed to it. The query below demands both, and /api/admin/feedback
// refuses to set APPROVED on a row without consent, so neither can be satisfied
// by accident.
//
// NOTHING IS EVER SEEDED HERE. If the table is empty the section renders
// nothing (see ReviewsSection) — an invented or "example" testimonial is a
// fabricated endorsement, and this repo's whole content culture is the opposite
// of that.

export interface PublicReview {
  id: string;
  rating: number | null;
  message: string;
  displayName: string | null;
  publishedAt: Date | null;
}

// Below this, the section stays hidden entirely. Two testimonials read as
// "nobody uses this"; the honest move on a young site is to show nothing until
// there is something real to show.
export const MIN_REVIEWS_TO_DISPLAY = 3;

const TTL_MS = 10 * 60_000;
type Memo = { at: number; rows: PublicReview[] };
// globalThis memo, NOT unstable_cache — see the egress rules at the top of
// lib/db.ts for why (unstable_cache silently no-ops over ~1.2 MB and then hits
// Postgres on every request). This payload is tiny, but the convention is the
// convention.
const g = globalThis as unknown as { __rcReviews?: Memo };

export async function getApprovedReviews(limit = 12): Promise<PublicReview[]> {
  const now = Date.now();
  if (g.__rcReviews && now - g.__rcReviews.at < TTL_MS) return g.__rcReviews.rows.slice(0, limit);
  try {
    const rows = await prisma.feedback.findMany({
      where: { status: "APPROVED", consentPublic: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 24,
      // Explicit select — never widen this to include `email`, which is a reply
      // address collected under "only if you want a reply", not for publication.
      select: { id: true, rating: true, message: true, displayName: true, publishedAt: true },
    });
    g.__rcReviews = { at: now, rows };
    return rows.slice(0, limit);
  } catch {
    // A reviews strip must never take the homepage down with it.
    return [];
  }
}
