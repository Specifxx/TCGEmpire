// Radiance preview season on /sets/radiance (2026-09-24 growth pass):
// "N of 180 revealed · updated {time}" and a newest-first "Latest reveals"
// strip. DATABASE CARDS ONLY — a card appears here because the official-gallery
// import (.github/workflows/radiance-reveals.yml, twice a day) wrote it, never
// because it was typed in. Switches itself off on release day.
//
// COST: one count and one 12-row tile read, cached 15 minutes and purged by the
// import (CONTENT_TAG). /sets/[set] is dynamic, so db.ts rule 5 (never cache
// shorter than the page's revalidate) does not bite here.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { cardTileSelect } from "./cards";
import type { Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { isBeforeRadianceRelease } from "./sets/radiance";
import { isBeforeLegacyRelease, LEGACY_SET_CODE } from "./sets/legacy";
import type { CardTileData } from "@/components/CardTile";

export interface RadianceReveals {
  revealed: number;
  latestAt: string | null; // ISO
  latest: CardTileData[];
}

// Legacy (2026-11-27, "Win back RiftCompare visitors"): the same strip for
// any set in its preview season. Rift's Google peaks were set-cycle news
// (15-28 Sep, Google: 2,788 visitors, most on Radiance spoiler and mechanic
// posts; 12-25 Nov, between sets: 1,129), so Legacy's reveals get the counter
// on /sets/legacy and inside the spoilers post, filled by set-reveals.yml.
export type SetReveals = RadianceReveals;

export async function getRadianceReveals(country: Country): Promise<RadianceReveals | null> {
  return isBeforeRadianceRelease() ? getSetReveals("RAD", country) : null;
}

// `ttl` must be at least the reading page's own revalidate (db.ts rule 5): the
// set page is dynamic and reads it at 900; a blog post (ISR, a day) passes 86400,
// and the import's CONTENT_TAG purge still refreshes it the day cards land.
export async function getLegacyReveals(country: Country, ttl = 900): Promise<SetReveals | null> {
  return isBeforeLegacyRelease() ? getSetReveals(LEGACY_SET_CODE, country, ttl) : null;
}

async function getSetReveals(setCode: string, country: Country, ttl = 900): Promise<SetReveals | null> {
  const WHERE = { setCode, isPromo: false } as const;
  try {
    return await unstable_cache(
      async (): Promise<RadianceReveals> => {
        const [revealed, latest] = await Promise.all([
          prisma.card.count({ where: WHERE }),
          prisma.card.findMany({
            where: WHERE,
            orderBy: { createdAt: "desc" },
            take: 12,
            select: { ...cardTileSelect(country), createdAt: true },
          }),
        ]);
        const latestAt = (latest[0] as { createdAt?: Date } | undefined)?.createdAt ?? null;
        return {
          revealed,
          latestAt: latestAt ? new Date(latestAt).toISOString() : null,
          latest: latest as unknown as CardTileData[],
        };
      },
      [setCode === "RAD" ? "radiance-reveals-v1" : `set-reveals-v1-${setCode}-${ttl}`, country],
      { revalidate: ttl, tags: [CONTENT_TAG] },
    )();
  } catch {
    return null;
  }
}
