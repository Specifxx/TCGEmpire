// How many of a pre-release set's cards have been revealed so far — the "N" in
// /sets/<slug>'s preview-season title ("Riftbound Radiance Card List: N of 180
// So Far"). Non-promo only, the same WHERE lib/radiance-reveals.ts counts, so
// the title and the hub's "N of 180 revealed" counter report one number.
//
// COST: one count, cached 15 minutes and purged by the card import
// (CONTENT_TAG). It wraps a raw prisma count, not a self-caching loader, so it
// is not the nesting db.ts rule 6 forbids. /sets/[set] is force-dynamic, so
// rule 5 (never cache shorter than the page's revalidate) does not bite.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CONTENT_TAG } from "./revalidate-content";

/** Revealed non-promo cards in `code`, or null when the lookup fails. */
export async function getSetRevealCount(code: string): Promise<number | null> {
  try {
    return await unstable_cache(
      () => prisma.card.count({ where: { setCode: code, isPromo: false } }),
      ["set-reveal-count-v1", code],
      { revalidate: 900, tags: [CONTENT_TAG] },
    )();
  } catch {
    return null;
  }
}
