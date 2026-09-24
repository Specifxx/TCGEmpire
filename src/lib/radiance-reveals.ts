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
import type { CardTileData } from "@/components/CardTile";

export interface RadianceReveals {
  revealed: number;
  latestAt: string | null; // ISO
  latest: CardTileData[];
}

const WHERE = { setCode: "RAD", isPromo: false } as const;

export async function getRadianceReveals(country: Country): Promise<RadianceReveals | null> {
  if (!isBeforeRadianceRelease()) return null;
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
      ["radiance-reveals-v1", country],
      { revalidate: 900, tags: [CONTENT_TAG] },
    )();
  } catch {
    return null;
  }
}
