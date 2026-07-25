import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { buildCardWhere, buildCardOrderBy, cardTileSelect } from "./cards";
import { pickPrice, priceField, type Country } from "./country";
import type { CardTileData } from "@/components/CardTile";

// "Most popular cards" — the most-SEARCHED Riftbound singles in the visitor's market,
// surfaced on the homepage. Search clicks are the purest demand signal we have. Ties
// (e.g. lots of cards with the same search count) break toward the MORE EXPENSIVE
// card, so the section leads with the chase/high-value cards people actually want.
// Priced-only so every tile shows a real price. Optional setCode scopes it to one
// set (e.g. the Vendetta homepage strip) instead of the whole database.
export async function getPopularCards(limit = 12, country: Country = "AU", setCode?: string): Promise<CardTileData[]> {
  const field = priceField(country);
  const cards = (await prisma.card.findMany({
    where: buildCardWhere({ set: setCode, priced: "1" }, country),
    orderBy: [
      { searchCount: "desc" },
      { [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
      { viewCount: "desc" },
    ],
    take: limit,
    select: cardTileSelect(country),
  })) as CardTileData[];
  return cards;
}

// "Cheapest cards" — the lowest-priced Riftbound singles in the visitor's market,
// surfaced on the homepage to show off two things at once: how cheaply you can buy
// here, and how many stores we compare for each card. We order cheapest-first (so the
// prices really are the lowest), then break ties by the widest store coverage — that
// way the section leads with well-stocked bargains, which is the coverage we want to
// boast about, rather than an obscure card that happens to sit in a single shop.
export async function getCheapestCards(limit = 12, country: Country = "AU"): Promise<CardTileData[]> {
  const cards = (await prisma.card.findMany({
    where: buildCardWhere({ priced: "1" }, country),
    orderBy: buildCardOrderBy("price_asc", country),
    // Over-fetch the cheapest tier so the coverage tiebreak has room to work.
    take: limit * 5,
    select: cardTileSelect(country),
  })) as CardTileData[];

  return cards
    .sort(
      (a, b) =>
        (pickPrice(a, country)! - pickPrice(b, country)!) ||
        b._count.retailerPrices - a._count.retailerPrices
    )
    .slice(0, limit);
}

// "Most valuable cards" — the highest-priced Riftbound singles in the visitor's
// market. Powers the value-checker lander's live proof block ("what's worth the
// most right now"). Priced-only so every tile shows a real figure.
export async function getValuableCards(limit = 12, country: Country = "AU"): Promise<CardTileData[]> {
  const cards = (await prisma.card.findMany({
    where: buildCardWhere({ priced: "1" }, country),
    orderBy: buildCardOrderBy("price_desc", country),
    take: limit,
    select: cardTileSelect(country),
  })) as CardTileData[];
  return cards;
}
