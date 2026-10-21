import { prisma } from "./db";
import { cardImageSrc } from "./card-image-url";
import { isStandardPrinting } from "./deck";
import type { BuilderCard } from "./deck-builder";

// The visual deck builder's card catalog (lib/deck-builder.ts): one entry per
// card NAME, which is what a deck counts. The entry is the standard printing
// (not a promo, alt art or Signature); its prices are the cheapest printing of
// that name in each market, which is what a player would actually buy.
// Public card columns only, so it reads through lib/db.ts's public-data
// routing like every other card list.
const MARKETS = [
  ["AU", "lowestPriceCents"],
  ["US", "lowestPriceCentsUs"],
  ["UK", "lowestPriceCentsUk"],
  ["SG", "lowestPriceCentsSg"],
  ["CA", "lowestPriceCentsCa"],
  ["EU", "lowestPriceCentsEu"],
] as const;

const PLAYABLE = ["Unit", "Spell", "Gear", "Legend", "Rune", "Battlefield"];

export async function getBuilderCatalog(): Promise<BuilderCard[]> {
  const rows = await prisma.card.findMany({
    where: { type: { in: PLAYABLE } },
    select: {
      id: true, slug: true, name: true, type: true, domain: true, energyCost: true, might: true, rarity: true,
      setCode: true, collectorNumber: true, variant: true, isPromo: true, imageUrl: true, imageThumbUrl: true,
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true,
      lowestPriceCentsCa: true, lowestPriceCentsEu: true, viewCount: true, searchCount: true,
    },
  });
  const byName = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byName.get(r.name) ?? [];
    list.push(r);
    byName.set(r.name, list);
  }
  const out: BuilderCard[] = [];
  for (const [, prints] of byName) {
    const std = prints.filter(isStandardPrinting).sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber));
    const base = std[0] ?? prints[0];
    const price: BuilderCard["price"] = {};
    for (const [m, f] of MARKETS) {
      const vals = prints.map((p) => p[f]).filter((v): v is number => v != null);
      price[m] = vals.length ? Math.min(...vals) : null;
    }
    out.push({
      id: base.id,
      slug: base.slug,
      name: base.name,
      type: base.type,
      domain: base.domain,
      energyCost: base.energyCost,
      might: base.might,
      rarity: base.rarity,
      setCode: base.setCode,
      collectorNumber: base.collectorNumber,
      img: cardImageSrc(base),
      full: cardImageSrc(base, { full: true }),
      price,
      pop: prints.reduce((n, p) => n + (p.viewCount ?? 0) + (p.searchCount ?? 0), 0),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
