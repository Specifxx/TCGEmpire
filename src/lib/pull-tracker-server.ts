// The pull tracker's one read: a set's pack-openable cards with each market's
// lowest price (lib/pull-tracker.ts has the why). Small (a few hundred rows,
// well under the cache ceiling in lib/db.ts), cached six hours, the cadence of
// the pages that read it, so it cannot drag a page's ISR down (db.ts rule 5).
// Never nested inside another cache: callers call it directly (rule 6).
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CONTENT_TAG } from "./revalidate-content";

export interface PullCard {
  id: string;
  name: string;
  slug: string | null;
  collectorNumber: string;
  rarity: string;
  imageThumbUrl: string | null;
  imageUrl: string | null;
  /** Lowest price per market, in that market's currency (cents). */
  p: { AU: number | null; US: number | null; UK: number | null; SG: number | null; CA: number | null; EU: number | null };
}

export const getPullSetCards = unstable_cache(
  async (setCode: string): Promise<PullCard[]> => {
    const rows = await prisma.card
      .findMany({
        where: { setCode, isPromo: false },
        select: {
          id: true,
          name: true,
          slug: true,
          collectorNumber: true,
          rarity: true,
          imageThumbUrl: true,
          imageUrl: true,
          lowestPriceCents: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
          lowestPriceCentsSg: true,
          lowestPriceCentsCa: true,
          lowestPriceCentsEu: true,
        },
        orderBy: { collectorNumber: "asc" },
        take: 600,
      })
      .catch(() => []);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      collectorNumber: r.collectorNumber,
      rarity: r.rarity,
      imageThumbUrl: r.imageThumbUrl,
      imageUrl: r.imageUrl,
      p: {
        AU: r.lowestPriceCents,
        US: r.lowestPriceCentsUs,
        UK: r.lowestPriceCentsUk,
        SG: r.lowestPriceCentsSg,
        CA: r.lowestPriceCentsCa,
        EU: r.lowestPriceCentsEu,
      },
    }));
  },
  ["pull-tracker-set-cards-v1"],
  { revalidate: 21600, tags: [CONTENT_TAG] },
);
