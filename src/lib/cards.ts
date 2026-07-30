import { Prisma } from "@prisma/client";
import { dollarsToCents, normalizeSearch } from "./format";
import { priceField, type Country } from "./country";

export interface CardQuery {
  q?: string;
  domain?: string;
  rarity?: string;
  type?: string;
  set?: string;
  variant?: string; // "alt" = alt-art only, "base" = base art only
  tag?: string; // keyword tag (from a card page's tag chip)
  rules?: string; // rules-text substring (e.g. "[Empower]") — from a guide's contextual CTA
  rulesSet?: string; // optional set-code scope for `rules` (e.g. "VEN")
  sig?: string; // "1" = signature ("*") cards only
  over?: string; // "1" = overnumbered printings only (number beyond the set total)
  promo?: string; // "1" = promo printings only
  printing?: string; // "normal" = base prints only (no alt-art / signature / promo)
  priced?: string; // "1" = only cards with a live price
  min?: string;
  max?: string;
  sort?: string;
  page?: string;
  size?: string;
}

export const CARD_PAGE_SIZE = 36; // legacy (infinite-scroll API)

// Paginated browse: user-selectable page size, default 10.
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export function parsePageSize(v?: string): number {
  const n = parseInt(v ?? "", 10);
  // Default 100 (user feedback: 10 felt like a static list, not a database).
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 100;
}
export function parsePageNum(v?: string): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function csv(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(",").filter(Boolean);
  return arr.length ? arr : undefined;
}

export function buildCardWhere(query: CardQuery, country: Country = "AU"): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {};
  const field = priceField(country);

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

  // Keyword tag filter (tags is a comma-separated string; substring match is fine for
  // the distinct word-tags we store). Powers the crawlable tag chips on card pages.
  if (query.tag) where.tags = { contains: query.tag };

  // Rules-text substring filter (e.g. "[Empower]") — same semantics as the article
  // embed's `rulesContain`, so a guide's "browse these cards" CTA and its own embed
  // gallery always show the identical set of cards.
  if (query.rules) {
    where.description = { contains: query.rules };
    if (query.rulesSet) where.setCode = query.rulesSet;
  }

  if (query.sig === "1") where.collectorNumber = { contains: "*" };
  if (query.over === "1") where.isOvernumbered = true;
  if (query.promo === "1") where.isPromo = true;

  // "Normal only" — hide the special prints (alt-art, signature, promo) so players
  // browsing for the standard card aren't shown showcase/promo variants.
  if (query.printing === "normal") {
    where.variant = null;
    where.isPromo = false;
    where.isOvernumbered = false;
    where.collectorNumber = { not: { contains: "*" } };
  }

  if (query.q) {
    // Search the normalised name so "kaisa" matches "Kai'Sa". Also match number.
    where.OR = [
      { nameNormalized: { contains: normalizeSearch(query.q) } },
      { collectorNumber: { contains: query.q } },
    ];
  }

  const price: Prisma.IntNullableFilter = {};
  if (query.min) price.gte = dollarsToCents(query.min);
  if (query.max) price.lte = dollarsToCents(query.max);
  if (query.priced === "1" || price.gte != null || price.lte != null) {
    price.not = null;
    // Filter on the selected market's price column (AU vs NZ).
    where[field] = price;
  }

  return where;
}

export function buildCardOrderBy(
  sort?: string,
  country: Country = "AU"
): Prisma.CardOrderByWithRelationInput[] {
  const field = priceField(country);
  switch (sort) {
    case "price_asc":
      // Nulls last so unpriced cards don't dominate the top. Sort on the selected
      // market's price column (AU vs NZ).
      return [{ [field]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput, { name: "asc" }];
    case "price_desc":
      return [{ [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput, { name: "asc" }];
    case "name":
      return [{ name: "asc" }];
    case "number":
    default:
      return [{ setCode: "asc" }, { collectorNumber: "asc" }];
  }
}

export { cardSlug, cardHref } from "./card-url";

// Tile select for a given market. Both price columns are always selected (so client
// components can switch instantly), but the "N stores" count is filtered to the
// selected country's in-stock listings.
export function cardTileSelect(country: Country = "AU") {
  return {
    id: true,
    slug: true,
    name: true,
    domain: true,
    type: true,
    rarity: true,
    variant: true,
    isPromo: true,
    setCode: true,
    setName: true,
    collectorNumber: true,
    energyCost: true,
    might: true,
    artSeed: true,
    orientation: true,
    imageUrl: true,
    imageThumbUrl: true,
    lowestPriceCents: true,
    lowestPriceCentsNz: true,
    lowestPriceCentsUs: true,
    lowestPriceCentsUk: true,
    lowestPriceCentsSg: true,
    lowestPriceCentsCa: true,
    // Count only in-stock listings for this market for the "N stores" tile label
    // (out-of-stock listings are shown on the card page but shouldn't inflate it).
    _count: { select: { retailerPrices: { where: { inStock: true, country } } } },
  } satisfies Prisma.CardSelect;
}

// Default (Australia) tile select, kept for callers that don't vary by market.
export const CARD_TILE_SELECT = cardTileSelect("AU");
