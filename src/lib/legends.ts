import { prisma } from "./db";
import { META_DECKS } from "./meta-decks";

export interface LegendEntry {
  id: string;
  name: string;
  champion: string; // name before the comma, e.g. "Master Yi"
  epithet: string; // after the comma, e.g. "Wuju Master"
  domain: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  deckSlug: string | null;
  deckTier: string | null;
}

// One entry per legend card (deduped by name, preferring the base printing), with
// a link to its meta deck if we feature one. Powers the /legends hub.
export async function getLegends(): Promise<LegendEntry[]> {
  const cards = await prisma.card.findMany({
    where: { type: "Legend", isPromo: false },
    select: {
      id: true,
      name: true,
      domain: true,
      setCode: true,
      collectorNumber: true,
      imageThumbUrl: true,
      imageUrl: true,
      lowestPriceCents: true,
    },
    orderBy: { name: "asc" },
  });

  const isBase = (n: string) => !n.includes("*") && !/\d+[a-z]/i.test(n);

  const byName = new Map<string, (typeof cards)[number]>();
  for (const c of cards) {
    const existing = byName.get(c.name);
    if (!existing || (isBase(c.collectorNumber) && !isBase(existing.collectorNumber))) {
      byName.set(c.name, c);
    }
  }

  const deckByLegend = new Map(META_DECKS.map((d) => [d.legend, d]));

  return Array.from(byName.values())
    .map((c) => {
      const [champion, ...rest] = c.name.split(",");
      const deck = deckByLegend.get(c.name) ?? null;
      return {
        ...c,
        champion: champion.trim(),
        epithet: rest.join(",").replace(/-\s*Starter/i, "").trim(),
        deckSlug: deck?.slug ?? null,
        deckTier: deck?.tier ?? null,
      };
    })
    .sort((a, b) => a.champion.localeCompare(b.champion));
}
