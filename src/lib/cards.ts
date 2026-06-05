import { Prisma } from "@prisma/client";
import { dollarsToCents } from "./format";

export interface CardQuery {
  q?: string;
  domain?: string;
  rarity?: string;
  type?: string;
  set?: string;
  variant?: string; // "alt" = alt-art only, "base" = base art only
  priced?: string; // "1" = only cards with a live price
  min?: string;
  max?: string;
  sort?: string;
  page?: string;
}

export const CARD_PAGE_SIZE = 36;

function csv(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(",").filter(Boolean);
  return arr.length ? arr : undefined;
}

export function buildCardWhere(query: CardQuery): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {};

  const domains = csv(query.domain);
  if (domains) where.domain = { in: domains };
  const rarities = csv(query.rarity);
  if (rarities) where.rarity = { in: rarities };
  const types = csv(query.type);
  if (types) where.type = { in: types };
  const sets = csv(query.set);
  if (sets) where.setCode = { in: sets };

  if (query.variant === "alt") where.variant = { not: null };
  else if (query.variant === "base") where.variant = null;

  if (query.q) {
    // SQLite LIKE is case-insensitive for ASCII, so no `mode` needed here.
    where.OR = [
      { name: { contains: query.q } },
      { tags: { contains: query.q } },
      { collectorNumber: { contains: query.q } },
    ];
  }

  const price: Prisma.IntNullableFilter = {};
  if (query.min) price.gte = dollarsToCents(query.min);
  if (query.max) price.lte = dollarsToCents(query.max);
  if (query.priced === "1" || price.gte != null || price.lte != null) {
    price.not = null;
    where.lowestPriceCents = price;
  }

  return where;
}

export function buildCardOrderBy(
  sort?: string
): Prisma.CardOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      // Nulls last so unpriced cards don't dominate the top.
      return [{ lowestPriceCents: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "price_desc":
      return [{ lowestPriceCents: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "name":
      return [{ name: "asc" }];
    case "number":
    default:
      return [{ setCode: "asc" }, { collectorNumber: "asc" }];
  }
}

export const CARD_TILE_SELECT = {
  id: true,
  name: true,
  domain: true,
  type: true,
  rarity: true,
  variant: true,
  setCode: true,
  setName: true,
  collectorNumber: true,
  energyCost: true,
  might: true,
  artSeed: true,
  orientation: true,
  imageUrl: true,
  imageThumbUrl: true,
  blurDataUrl: true,
  lowestPriceCents: true,
  _count: { select: { retailerPrices: true } },
} satisfies Prisma.CardSelect;
