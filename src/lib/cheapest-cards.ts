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
// most right now"). Priced-only so every tile shows a real figure. Optional
// setCode scopes it to one set (e.g. Vendetta's "chase cards" on the homepage).
export async function getValuableCards(limit = 12, country: Country = "AU", setCode?: string): Promise<CardTileData[]> {
  const cards = (await prisma.card.findMany({
    where: buildCardWhere({ set: setCode, priced: "1" }, country),
    orderBy: buildCardOrderBy("price_desc", country),
    take: limit,
    select: cardTileSelect(country),
  })) as CardTileData[];
  return cards;
}

// Editorial display-order tiebreak among priced Signature Legends — these
// characters' Signatures are the bigger collector draw, so they lead the row
// when multiple Signatures are available. Never used to exclude anyone, only
// to order the same full list differently. Extend by hand as new sets add
// Signature Legends (checked against the FIRST name only, e.g. "Akali" out of
// "Akali, Rogue Assassin", so it survives subtitle/epithet changes).
const CHASE_PRIORITY_NAMES = new Set(["Akali", "Mel"]);
function chaseSortTier(name: string): number {
  return CHASE_PRIORITY_NAMES.has(name.split(",")[0].trim()) ? 0 : 1;
}

// "Chase cards" — the homepage Vendetta block's marquee cards. This is
// deliberately NOT just "highest priced" (that's getValuableCards above): the
// actual chase print for a Signature-eligible character is its Signature
// Legend (collector number carries a "*", e.g. "189*/166"), not the plain
// Overnumbered variant of the same character. Every Signature Legend in the
// set is shown here — priced or not (CardTile already renders an honest "No
// price yet" for the unpriced ones; a Signature is still the card, and
// standing it in for a differently-numbered Overnumbered dupe just because
// THAT one happens to have a price is the wrong tradeoff for a "chase cards"
// feature). Only tops up with the next most valuable (PRICED) non-signature
// cards if the set has fewer Signatures than `limit` — never invents a price,
// never hides a real Signature to make room for something else.
export async function getChaseCards(limit = 8, country: Country = "AU", setCode?: string): Promise<CardTileData[]> {
  const baseWhere = buildCardWhere({ set: setCode }, country);
  const signatures = (await prisma.card.findMany({
    where: { ...baseWhere, collectorNumber: { contains: "*" } },
    orderBy: buildCardOrderBy("price_desc", country),
    take: limit,
    select: cardTileSelect(country),
  })) as CardTileData[];
  // Array#sort is stable — this reorders by tier while preserving the
  // price-desc (nulls-last) order the query already gave within each tier.
  signatures.sort((a, b) => chaseSortTier(a.name) - chaseSortTier(b.name));
  if (signatures.length >= limit) return signatures;
  const pricedWhere = buildCardWhere({ set: setCode, priced: "1" }, country);
  const rest = (await prisma.card.findMany({
    where: { ...pricedWhere, id: { notIn: signatures.map((c) => c.id) } },
    orderBy: buildCardOrderBy("price_desc", country),
    take: limit - signatures.length,
    select: cardTileSelect(country),
  })) as CardTileData[];
  return [...signatures, ...rest];
}
