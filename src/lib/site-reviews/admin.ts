import { prisma } from "../db";
import { RIFT_SITE_KEY, SISTER_REVIEW_SITES, reviewSiteName } from "./sites";

// /admin/reviews: every site's score and the one approval queue (2026-11-03).
// Uncached, admin only, bounded reads.

/** A written review its writer agreed to show, not yet approved or archived. */
export const REVIEWS_WAITING_WHERE = { status: "NEW", consentPublic: true, message: { not: "" } } as const;

export const REVIEW_SITE_KEYS = [RIFT_SITE_KEY, ...SISTER_REVIEW_SITES.map((s) => s.key)];

export interface SiteReviewSummary {
  key: string;
  name: string;
  url: string;
  average: number | null;
  ratings: number;
  waiting: number;
  published: number;
  privateNew: number;
}

const ROW_SELECT = {
  id: true,
  site: true,
  rating: true,
  message: true,
  displayName: true,
  consentPublic: true,
  status: true,
  source: true,
  page: true,
  createdAt: true,
  publishedAt: true,
} as const;

export type AdminReviewRow = {
  id: string;
  site: string;
  rating: number | null;
  message: string;
  displayName: string | null;
  consentPublic: boolean;
  status: string;
  source: string;
  page: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

export async function loadReviewAdmin(site: string | null) {
  const where = site ? { site } : {};
  const [rated, waitingBy, publishedBy, privateBy, waiting, privateRows, published] = await Promise.all([
    prisma.feedback.groupBy({
      by: ["site"],
      where: { rating: { not: null }, status: { not: "SPAM" }, NOT: { source: "rating-review" } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.feedback.groupBy({ by: ["site"], where: REVIEWS_WAITING_WHERE, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["site"], where: { status: "APPROVED" }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["site"], where: { status: "NEW", consentPublic: false, message: { not: "" } }, _count: { _all: true } }),
    prisma.feedback.findMany({ where: { ...where, ...REVIEWS_WAITING_WHERE }, orderBy: { createdAt: "desc" }, take: 200, select: ROW_SELECT }),
    // Written words meant only for us. RiftCompare's own are in /admin/messages.
    prisma.feedback.findMany({
      where: site ? { site, status: "NEW", consentPublic: false, message: { not: "" } } : { site: { not: RIFT_SITE_KEY }, status: "NEW", consentPublic: false, message: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: ROW_SELECT,
    }),
    prisma.feedback.findMany({ where: { ...where, status: "APPROVED" }, orderBy: { publishedAt: "desc" }, take: 100, select: ROW_SELECT }),
  ]);
  const count = (rows: { site: string; _count: { _all: number } }[], key: string) => rows.find((r) => r.site === key)?._count._all ?? 0;
  const summaries: SiteReviewSummary[] = REVIEW_SITE_KEYS.map((key) => {
    const r = rated.find((x) => x.site === key);
    return {
      key,
      name: reviewSiteName(key),
      url: key === RIFT_SITE_KEY ? "https://riftcompare.com" : SISTER_REVIEW_SITES.find((s) => s.key === key)!.url,
      average: r?._avg.rating ?? null,
      ratings: r?._count.rating ?? 0,
      waiting: count(waitingBy, key),
      published: count(publishedBy, key),
      privateNew: count(privateBy, key),
    };
  });
  return { summaries, waiting: waiting as AdminReviewRow[], privateRows: privateRows as AdminReviewRow[], published: published as AdminReviewRow[] };
}
