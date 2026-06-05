import { Prisma } from "@prisma/client";
import { dollarsToCents } from "./format";

export interface ListingQuery {
  q?: string;
  domain?: string;
  rarity?: string;
  type?: string;
  condition?: string;
  foil?: string;
  min?: string;
  max?: string;
  sort?: string;
  page?: string;
}

export const PAGE_SIZE = 24;

function csv(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(",").filter(Boolean);
  return arr.length ? arr : undefined;
}

// Translate URL search params into a Prisma `where` clause for active listings.
export function buildWhere(query: ListingQuery): Prisma.ListingWhereInput {
  const cardWhere: Prisma.CardWhereInput = {};

  const domains = csv(query.domain);
  if (domains) cardWhere.domain = { in: domains };
  const rarities = csv(query.rarity);
  if (rarities) cardWhere.rarity = { in: rarities };
  const types = csv(query.type);
  if (types) cardWhere.type = { in: types };

  if (query.q) {
    cardWhere.OR = [
      { name: { contains: query.q } },
      { tags: { contains: query.q } },
      { type: { contains: query.q } },
    ];
  }

  const where: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    quantity: { gt: 0 },
  };

  if (Object.keys(cardWhere).length) where.card = cardWhere;

  const conditions = csv(query.condition);
  if (conditions) where.condition = { in: conditions };
  if (query.foil === "1") where.isFoil = true;

  const priceFilter: Prisma.IntFilter = {};
  if (query.min) priceFilter.gte = dollarsToCents(query.min);
  if (query.max) priceFilter.lte = dollarsToCents(query.max);
  if (priceFilter.gte != null || priceFilter.lte != null)
    where.priceCents = priceFilter;

  return where;
}

export function buildOrderBy(
  sort?: string
): Prisma.ListingOrderByWithRelationInput | Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return { priceCents: "asc" };
    case "price_desc":
      return { priceCents: "desc" };
    case "name":
      return { card: { name: "asc" } };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

export const LISTING_TILE_SELECT = {
  id: true,
  condition: true,
  isFoil: true,
  priceCents: true,
  seller: { select: { displayName: true } },
  card: {
    select: {
      id: true,
      name: true,
      domain: true,
      type: true,
      rarity: true,
      energyCost: true,
      might: true,
      collectorNumber: true,
      artSeed: true,
      orientation: true,
      imageUrl: true,
      imageThumbUrl: true,
      blurDataUrl: true,
      marketPriceCents: true,
    },
  },
} satisfies Prisma.ListingSelect;
