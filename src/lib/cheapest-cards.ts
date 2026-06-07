import { prisma } from "./db";
import { buildCardWhere, buildCardOrderBy, cardTileSelect } from "./cards";
import { pickPrice, type Country } from "./country";
import type { CardTileData } from "@/components/CardTile";

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
