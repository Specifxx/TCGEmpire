import { prisma } from "./db";
import { normalizeSearch } from "./format";
import metaDecksData from "../../prisma/meta-decks.json";

export interface MetaDeckSeed {
  slug: string;
  name: string;
  legend: string;
  tier: string;
  archetype: string;
  domains: string[];
  description: string;
  cards: { name: string; qty: number }[];
}

export const META_DECKS: MetaDeckSeed[] = (metaDecksData.decks ?? []) as MetaDeckSeed[];

export interface ResolvedCardData {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  domain: string;
  type: string;
  rarity: string;
  imageThumbUrl: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
}

export interface ResolvedCard {
  qty: number;
  inputName: string;
  card: ResolvedCardData | null;
  unitPriceCents: number | null;
  lineCents: number;
}

export interface ResolvedDeck extends MetaDeckSeed {
  legendCard: ResolvedCardData | null;
  legendPriceCents: number | null;
  items: ResolvedCard[];
  totalCards: number;
  totalCents: number;
  pricedCards: number;
  imageUrl: string | null;
}

const CARD_SELECT = {
  id: true,
  name: true,
  setCode: true,
  collectorNumber: true,
  domain: true,
  type: true,
  rarity: true,
  imageThumbUrl: true,
  imageUrl: true,
  lowestPriceCents: true,
} as const;

// Resolve a card name to the cheapest real (non-promo, base-art) printing so the
// deck price reflects what it actually costs to build in AU.
async function resolveByName(name: string) {
  const nq = normalizeSearch(name);
  const matches = await prisma.card.findMany({
    where: { nameNormalized: nq, isPromo: false },
    select: { ...CARD_SELECT },
    orderBy: [{ lowestPriceCents: { sort: "asc", nulls: "last" } }],
  });
  // Prefer base art (no "*", no letter variant) when present, else cheapest.
  const base = matches.find((m) => !m.collectorNumber.includes("*") && !/\d+[a-z]/i.test(m.collectorNumber));
  return base ?? matches[0] ?? null;
}

export async function resolveDeck(seed: MetaDeckSeed): Promise<ResolvedDeck> {
  const legend = await resolveByName(seed.legend);

  const items: ResolvedCard[] = [];
  for (const c of seed.cards) {
    const card = await resolveByName(c.name);
    const unitPriceCents = card?.lowestPriceCents ?? null;
    items.push({
      qty: c.qty,
      inputName: c.name,
      card,
      unitPriceCents,
      lineCents: unitPriceCents != null ? unitPriceCents * c.qty : 0,
    });
  }

  const legendLine = legend?.lowestPriceCents != null ? legend.lowestPriceCents : 0;
  const totalCards = seed.cards.reduce((n, c) => n + c.qty, 0) + 1; // +1 legend
  const totalCents = items.reduce((n, i) => n + i.lineCents, 0) + legendLine;
  const pricedCards =
    items.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0) +
    (legend?.lowestPriceCents != null ? 1 : 0);

  return {
    ...seed,
    legendCard: legend,
    legendPriceCents: legend?.lowestPriceCents ?? null,
    items,
    totalCards,
    totalCents,
    pricedCards,
    imageUrl: legend?.imageUrl ?? legend?.imageThumbUrl ?? null,
  };
}

export async function resolveAllDecks(): Promise<ResolvedDeck[]> {
  return Promise.all(META_DECKS.map(resolveDeck));
}

export function getDeckSeed(slug: string): MetaDeckSeed | undefined {
  return META_DECKS.find((d) => d.slug === slug);
}
