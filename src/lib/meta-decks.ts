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
  category?: "meta" | "beginner";
  // Attribution: the real tournament list this deck is copied from.
  sourceUrl?: string;
  source?: string; // e.g. "Player · 1st, Event (Jun 2026)"
  // section: champion | unit | gear | spell | battlefield | rune | sideboard
  cards: { name: string; qty: number; section: string }[];
}

export const META_DECKS: MetaDeckSeed[] = (metaDecksData.decks ?? []) as MetaDeckSeed[];

export interface ResolvedCardData {
  id: string;
  name: string;
  nameNormalized: string;
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
  section: string;
  card: ResolvedCardData | null;
  unitPriceCents: number | null;
  lineCents: number;
}

export interface ResolvedDeck extends MetaDeckSeed {
  legendCard: ResolvedCardData | null;
  legendPriceCents: number | null;
  items: ResolvedCard[];
  // Main deck = everything except the sideboard, plus the legend.
  totalCards: number;
  totalCents: number;
  pricedCards: number;
  // Sideboard, priced separately from the headline build cost.
  sideboardCards: number;
  sideboardCents: number;
  imageUrl: string | null;
}

const CARD_SELECT = {
  id: true,
  name: true,
  nameNormalized: true,
  setCode: true,
  collectorNumber: true,
  domain: true,
  type: true,
  rarity: true,
  imageThumbUrl: true,
  imageUrl: true,
  lowestPriceCents: true,
} as const;

// Build a name -> cheapest base printing map for a set of card names in ONE query.
// (Resolving each card individually would fire ~100 queries per page and can
// exhaust the serverless DB connection pool.)
async function buildCardMap(names: string[]): Promise<Map<string, ResolvedCardData>> {
  const keys = Array.from(new Set(names.map(normalizeSearch)));
  const matches = await prisma.card.findMany({
    where: { nameNormalized: { in: keys }, isPromo: false },
    select: { ...CARD_SELECT },
    orderBy: [{ lowestPriceCents: { sort: "asc", nulls: "last" } }],
  });
  const map = new Map<string, ResolvedCardData>();
  for (const m of matches) {
    const nq = m.nameNormalized;
    const isBase = !m.collectorNumber.includes("*") && !/\d+[a-z]/i.test(m.collectorNumber);
    const existing = map.get(nq);
    // Prefer base art; otherwise keep the first (cheapest, due to orderBy).
    if (!existing || (isBase && !(!existing.collectorNumber.includes("*") && !/\d+[a-z]/i.test(existing.collectorNumber)))) {
      map.set(nq, m);
    }
  }
  return map;
}

function resolveDeckFromMap(seed: MetaDeckSeed, map: Map<string, ResolvedCardData>): ResolvedDeck {
  const legend = map.get(normalizeSearch(seed.legend)) ?? null;

  const items: ResolvedCard[] = seed.cards.map((c) => {
    const card = map.get(normalizeSearch(c.name)) ?? null;
    const unitPriceCents = card?.lowestPriceCents ?? null;
    return {
      qty: c.qty,
      inputName: c.name,
      section: c.section,
      card,
      unitPriceCents,
      lineCents: unitPriceCents != null ? unitPriceCents * c.qty : 0,
    };
  });

  // The headline build cost is the MAIN deck (everything except the sideboard)
  // plus the legend; the sideboard is summed separately.
  const main = items.filter((i) => i.section !== "sideboard");
  const side = items.filter((i) => i.section === "sideboard");

  const legendLine = legend?.lowestPriceCents != null ? legend.lowestPriceCents : 0;
  const totalCards = main.reduce((n, i) => n + i.qty, 0) + 1; // +1 legend
  const totalCents = main.reduce((n, i) => n + i.lineCents, 0) + legendLine;
  const pricedCards =
    main.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0) +
    (legend?.lowestPriceCents != null ? 1 : 0);
  const sideboardCards = side.reduce((n, i) => n + i.qty, 0);
  const sideboardCents = side.reduce((n, i) => n + i.lineCents, 0);

  return {
    ...seed,
    legendCard: legend,
    legendPriceCents: legend?.lowestPriceCents ?? null,
    items,
    totalCards,
    totalCents,
    pricedCards,
    sideboardCards,
    sideboardCents,
    imageUrl: legend?.imageUrl ?? legend?.imageThumbUrl ?? null,
  };
}

export async function resolveDeck(seed: MetaDeckSeed): Promise<ResolvedDeck> {
  const map = await buildCardMap([seed.legend, ...seed.cards.map((c) => c.name)]);
  return resolveDeckFromMap(seed, map);
}

export async function resolveAllDecks(): Promise<ResolvedDeck[]> {
  const allNames = META_DECKS.flatMap((d) => [d.legend, ...d.cards.map((c) => c.name)]);
  const map = await buildCardMap(allNames);
  return META_DECKS.map((d) => resolveDeckFromMap(d, map));
}

export function getDeckSeed(slug: string): MetaDeckSeed | undefined {
  return META_DECKS.find((d) => d.slug === slug);
}
