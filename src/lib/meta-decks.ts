import { prisma } from "./db";
import { normalizeSearch } from "./format";
import { pickPrice, priceField, type Country } from "./country";
import type { Prisma } from "@prisma/client";
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
  // Metagame standing, from the riftDecks.com Vendetta breakdown. These move
  // daily — prisma/meta-decks.json._metaUpdated says when they were last checked.
  // avgPriceUsd is riftDecks' own reference figure and is NOT used for pricing:
  // build cost is always computed live in the reader's own market.
  metaSharePct?: number;
  winRatePct?: number;
  top8s?: number;
  avgPriceUsd?: number;
  // Attribution: the real tournament list this deck is copied from.
  sourceUrl?: string;
  source?: string; // e.g. "Player · 1st at Event"
  // section: champion | unit | gear | spell | battlefield | rune | sideboard
  cards: { name: string; qty: number; section: string }[];
}

export const META_DECKS: MetaDeckSeed[] = (metaDecksData.decks ?? []) as MetaDeckSeed[];

// When the tier/metashare figures above were last reconciled against riftDecks.
export const META_UPDATED: string = (metaDecksData as { _metaUpdated?: string })._metaUpdated ?? "";

// Meta decks that play a card with this name (loose match so "Kai'Sa" == "kaisa").
// Static seed data — no DB call. Powers the "Played in" section on card pages, which
// adds card ↔ deck internal links (and a useful "what's this card for?" signal).
export function decksUsingCard(cardName: string): MetaDeckSeed[] {
  const target = normalizeSearch(cardName);
  if (!target) return [];
  return META_DECKS.filter((d) => d.cards.some((c) => normalizeSearch(c.name) === target));
}

export interface ResolvedCardData {
  id: string;
  slug: string | null;
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
  // Main deck = everything except the sideboard, plus the legend. This is the
  // real deck size (56) and is what the decklist header counts.
  totalCards: number;
  // Build cost EXCLUDES runes: a rune base is 12 near-worthless commons that
  // every deck in the domain runs, so pricing them buries the number that
  // actually differs between decks. priceableCards is the denominator that
  // matches totalCents (main deck + legend, minus runes).
  totalCents: number;
  priceableCards: number;
  pricedCards: number;
  // Sideboard, priced separately from the headline build cost.
  sideboardCards: number;
  sideboardCents: number;
  imageUrl: string | null;
}

const CARD_SELECT = {
  id: true,
  slug: true,
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
  lowestPriceCentsNz: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
} as const;

// Build a name -> cheapest base printing map for a set of card names in ONE query.
// (Resolving each card individually would fire ~100 queries per page and can
// exhaust the serverless DB connection pool.) Prices reflect the selected market:
// ResolvedCardData.lowestPriceCents is set to the AU or NZ column accordingly.
async function buildCardMap(names: string[], country: Country): Promise<Map<string, ResolvedCardData>> {
  const keys = Array.from(new Set(names.map(normalizeSearch)));
  const field = priceField(country);
  const matches = await prisma.card.findMany({
    where: { nameNormalized: { in: keys }, isPromo: false },
    select: { ...CARD_SELECT },
    orderBy: [{ [field]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput],
  });
  const map = new Map<string, ResolvedCardData>();
  for (const m of matches) {
    const nq = m.nameNormalized;
    // Collapse to the active market's price so the rest of the pricing is market-agnostic.
    const eff: ResolvedCardData = { ...m, lowestPriceCents: pickPrice(m, country) };
    const isBase = !m.collectorNumber.includes("*") && !/\d+[a-z]/i.test(m.collectorNumber);
    const existing = map.get(nq);
    // Prefer base art; otherwise keep the first (cheapest, due to orderBy).
    if (!existing || (isBase && !(!existing.collectorNumber.includes("*") && !/\d+[a-z]/i.test(existing.collectorNumber)))) {
      map.set(nq, eff);
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
  // plus the legend; the sideboard is summed separately. Runes are counted in
  // the deck SIZE but not in the COST — see priceableCards above.
  const main = items.filter((i) => i.section !== "sideboard");
  const priceable = main.filter((i) => i.section !== "rune");
  const side = items.filter((i) => i.section === "sideboard");

  const legendLine = legend?.lowestPriceCents != null ? legend.lowestPriceCents : 0;
  const totalCards = main.reduce((n, i) => n + i.qty, 0) + 1; // +1 legend
  const totalCents = priceable.reduce((n, i) => n + i.lineCents, 0) + legendLine;
  const priceableCards = priceable.reduce((n, i) => n + i.qty, 0) + 1; // +1 legend
  const pricedCards =
    priceable.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0) +
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
    priceableCards,
    pricedCards,
    sideboardCards,
    sideboardCents,
    imageUrl: legend?.imageUrl ?? legend?.imageThumbUrl ?? null,
  };
}

export async function resolveDeck(seed: MetaDeckSeed, country: Country = "AU"): Promise<ResolvedDeck> {
  const map = await buildCardMap([seed.legend, ...seed.cards.map((c) => c.name)], country);
  return resolveDeckFromMap(seed, map);
}

export async function resolveAllDecks(country: Country = "AU"): Promise<ResolvedDeck[]> {
  const allNames = META_DECKS.flatMap((d) => [d.legend, ...d.cards.map((c) => c.name)]);
  const map = await buildCardMap(allNames, country);
  return META_DECKS.map((d) => resolveDeckFromMap(d, map));
}

export function getDeckSeed(slug: string): MetaDeckSeed | undefined {
  return META_DECKS.find((d) => d.slug === slug);
}
