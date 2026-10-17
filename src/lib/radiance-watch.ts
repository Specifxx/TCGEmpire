// "Follow Radiance's chase cards" (2026-10-16, growth pass; DECISIONS.md,
// "Growth: meet readers where they are"). Four in five search visits are
// spoiler, leak and card-list readers, not shoppers; the one thing they want
// that this site does better than a spoiler blog is knowing what the chase
// cards will cost. One click (Google or Discord) creates the account AND
// watches these cards, so the account starts activated: a watch is the action
// that predicts a member staying (funnel-report: alert sign-ups 100% active in a
// week, the old popup's 12%).
//
// Eight, inside the free watchlist (FREE_WATCHLIST_LIMIT, 10), so a new account
// takes them all and keeps two slots of its own: six Signature printings and
// two over-numbered Legends, the cards the reveal posts lead with. The Chinese-
// exclusive Seraphine 174a* joined on 2026-10-17 with its card image, in place
// of the unsigned K'Sante 172.
// that stops resolving simply drops out of the strip.
import { prisma } from "./db";

export const RADIANCE_CHASE_SLUGS = [
  "seraphine-starry-eyed-songstress-rad-174s-167",
  "seraphine-starry-eyed-songstress-rad-174as-167",
  "ekko-boy-who-shattered-time-rad-168s-167",
  "ziggs-hexplosives-expert-rad-169s-167",
  "mordekaiser-iron-revenant-rad-170s-167",
  "orianna-lady-of-clockwork-rad-171s-167",
  "seraphine-starry-eyed-songstress-rad-174-167",
  "riven-the-exile-rad-173-167",
] as const;

export interface ChaseCard {
  id: string;
  name: string;
  slug: string | null;
  collectorNumber: string;
  imageUrl: string | null;
  imageThumbUrl: string | null;
}

/** The chase cards, in RADIANCE_CHASE_SLUGS order. One small read by slug; never throws. */
export async function getRadianceChaseCards(): Promise<ChaseCard[]> {
  try {
    const rows = await prisma.card.findMany({
      where: { slug: { in: [...RADIANCE_CHASE_SLUGS] } },
      select: { id: true, name: true, slug: true, collectorNumber: true, imageUrl: true, imageThumbUrl: true },
      take: RADIANCE_CHASE_SLUGS.length,
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return RADIANCE_CHASE_SLUGS.map((s) => bySlug.get(s)).filter((r): r is ChaseCard => !!r);
  } catch {
    return [];
  }
}
