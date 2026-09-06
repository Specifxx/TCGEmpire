import { Prisma } from "@prisma/client";
import { dollarsToCents, normalizeSearch } from "./format";
import { DEFAULT_COUNTRY, priceField, type Country } from "./country";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import type { CardTileData } from "@/components/CardTile";

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

export function buildCardWhere(query: CardQuery, country: Country = DEFAULT_COUNTRY): Prisma.CardWhereInput {
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
    // Filter on the selected market's price column.
    where[field] = price;
  }

  return where;
}

export function buildCardOrderBy(
  sort?: string,
  country: Country = DEFAULT_COUNTRY
): Prisma.CardOrderByWithRelationInput[] {
  const field = priceField(country);
  switch (sort) {
    case "price_asc":
      // Nulls last so unpriced cards don't dominate the top. Sort on the selected
      // market's price column.
      return [{ [field]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput, { name: "asc" }];
    case "price_desc":
      return [{ [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput, { name: "asc" }];
    case "name":
      return [{ name: "asc" }];
    // Card.createdAt is set once on insert and never touched again (cards are
    // always update/create, never wholesale delete+recreate like SealedListing —
    // see the sealed importer for why that table needed a separate tracking model
    // instead of just sorting on a column it already had), so it's a stable,
    // accurate "when did this printing first appear in our catalogue" signal.
    case "new":
      return [{ createdAt: "desc" }];
    case "number":
    default:
      return [{ setCode: "asc" }, { collectorNumber: "asc" }];
  }
}

export { cardSlug, cardHref } from "./card-url";

// Tile select for a given market. Both price columns are always selected (so client
// components can switch instantly), but the "N stores" count is filtered to the
// selected country's in-stock listings.
export function cardTileSelect(country: Country = DEFAULT_COUNTRY) {
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
    lowestPriceCentsUs: true,
    lowestPriceCentsUk: true,
    lowestPriceCentsSg: true,
    lowestPriceCentsCa: true,
    lowestPriceCentsEu: true,
    // Count only in-stock listings for this market for the "N stores" tile label
    // (out-of-stock listings are shown on the card page but shouldn't inflate it).
    // Converted reference rows are excluded for the same reason they are excluded
    // from the price above and from computeMarket() on the card page: the tile
    // promises a number of BUYABLE stores. Counting them made every AU/UK/SG/CA
    // tile claim one store more than the card page could then show — "2 stores"
    // on the grid, one row after the click.
    _count: {
      select: { retailerPrices: { where: { inStock: true, country, retailer: { notIn: [...ALL_FALLBACK_RETAILERS] } } } },
    },
  } satisfies Prisma.CardSelect;
}

// Default (Australia) tile select, kept for callers that don't vary by market.
export const CARD_TILE_SELECT = cardTileSelect("AU");

/**
 * Drops energyCost/might/artSeed from a CardTile row when it has a real image.
 *
 * CardImage (components/CardImage.tsx) only ever reads those three fields in
 * its fallback branch — generated SVG art for a card with NO imageUrl AND NO
 * imageThumbUrl. On a card that has a real photo, they cross the server/client
 * boundary into CardTile's props, get serialized into the page's RSC hydration
 * payload, and are never read: genuinely dead weight, not a legitimately-used
 * field like the five per-market price columns (which stay, because instant
 * currency switching on the client needs all of them). Same "strip what this
 * render never reads" pattern as toPulseMovers() in lib/price-history.ts,
 * applied where a page renders enough tiles for the bytes to matter — see its
 * use in /browse and /sets/[set]/gallery, the two heaviest CardTile grids.
 */
export function trimTileArtFallback<T extends Pick<CardTileData, "imageUrl" | "imageThumbUrl" | "energyCost" | "might" | "artSeed">>(
  card: T
): Omit<T, "energyCost" | "might" | "artSeed"> {
  if (card.imageUrl || card.imageThumbUrl) {
    const { energyCost: _energyCost, might: _might, artSeed: _artSeed, ...rest } = card;
    return rest;
  }
  return card;
}

/**
 * In-stock store counts per card PER MARKET.
 *
 * WHY THIS EXISTS. `cardTileSelect(country)`'s `_count` is filtered to ONE
 * country and baked into the payload at render time — but a tile's PRICE is
 * localised on the CLIENT (CountryProvider geo-switches the market after
 * hydration and CardTile re-prices through pickPrice). On a page rendered with
 * DEFAULT_COUNTRY and then ISR-cached — the homepage, and every other
 * cardTileSelect(DEFAULT_COUNTRY) caller — those two describe DIFFERENT markets
 * for anyone outside Australia: the visitor read a US price next to Australia's
 * store count. Reported from production as "it says 3 stores when there is only
 * 1, and 10 when there are 3", which is exactly the shape of a count taken from
 * the wrong market.
 *
 * Shipping every market's count fixes it at the source, and the earlier note on
 * cardTileSelect — that a per-market count would mean one row per in-stock
 * listing — does not apply to this shape. GROUP BY does the counting IN
 * POSTGRES and returns one small row per (card, market) that actually has
 * stock: at most cards x 5, tens of bytes each, versus the thousands of listing
 * rows that idea would have moved. That distinction matters on a project that
 * has exhausted its Neon transfer allowance repeatedly (see lib/db.ts).
 *
 * Same filters as the `_count` above — in-stock only, converted reference rows
 * excluded — so a market's number here equals what the card page will show.
 */
export async function storeCountsByCountry(
  cardIds: string[]
): Promise<Map<string, Partial<Record<Country, number>>>> {
  const out = new Map<string, Partial<Record<Country, number>>>();
  if (!cardIds.length) return out;
  const { prisma } = await import("./db");
  const rows = await prisma.retailerPrice.groupBy({
    by: ["cardId", "country"],
    where: { cardId: { in: cardIds }, inStock: true, retailer: { notIn: [...ALL_FALLBACK_RETAILERS] } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const per = out.get(r.cardId) ?? {};
    per[r.country as Country] = r._count._all;
    out.set(r.cardId, per);
  }
  return out;
}

/**
 * Attach per-market store counts to a page of tiles, so CardTile can show the
 * count for whichever market the visitor is actually in. One extra grouped
 * query per page — never per card.
 */
export async function withStoreCounts<T extends { id: string }>(cards: T[]): Promise<T[]> {
  if (!cards.length) return cards;
  const counts = await storeCountsByCountry(cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, storeCounts: counts.get(c.id) ?? {} }));
}
