import { Prisma } from "@prisma/client";
import { dollarsToCents, normalizeSearch } from "./format";
import { parseSearchQuery } from "./search-query";
import { DEFAULT_COUNTRY, priceField, type Country } from "./country";
import { ALL_FALLBACK_RETAILERS, ULTIMATE_PRINTS } from "./constants";
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
  ult?: string; // "1" = Ultimate-rarity prints only (constants.ts ULTIMATE_PRINTS)
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

  // A typed phrase can name a printing ("akali overnumbered", "alt art jinx").
  // Those words become the same filters the browse chips set — but ONLY where the
  // caller left the filter unset. An explicit URL parameter is a deliberate
  // choice by someone looking at the chips; a word inferred from free text is a
  // guess, and a guess must never overrule the choice. `printing=normal` plus a
  // typed "signature" is the case that matters: the block further down still
  // wins, and the visitor keeps the base prints they asked for.
  const parsed = parseSearchQuery(query.q ?? "");
  const eff: CardQuery = { ...query };
  for (const [k, v] of Object.entries(parsed.filters)) {
    const key = k as keyof CardQuery;
    if (eff[key] === undefined) eff[key] = v;
  }

  const domains = csv(eff.domain);
  if (domains) where.domain = { in: domains };
  const rarities = csv(eff.rarity);
  if (rarities) where.rarity = { in: rarities };
  const types = csv(eff.type);
  if (types) where.type = { in: types };
  const sets = csv(eff.set);
  if (sets) where.setCode = { in: sets };

  if (eff.variant === "alt") where.variant = { not: null };
  else if (eff.variant === "base") where.variant = null;

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

  if (eff.sig === "1") where.collectorNumber = { contains: "*" };
  if (eff.over === "1") where.isOvernumbered = true;
  if (eff.promo === "1") where.isPromo = true;
  // Ultimate is a curated list, not a column: one clause per listed print,
  // matched on set code plus the number before the slash. AND-ed so it narrows
  // alongside the name search's own OR further down rather than replacing it.
  if (eff.ult === "1") {
    const prints = Object.entries(ULTIMATE_PRINTS).flatMap(([setCode, nums]) =>
      nums.map((n) => ({ setCode, collectorNumber: { startsWith: `${n}/` } })),
    );
    where.AND = [{ OR: prints.length ? prints : [{ id: "__none__" }] }];
  }

  // "Normal only" — hide the special prints (alt-art, signature, promo) so players
  // browsing for the standard card aren't shown showcase/promo variants.
  if (query.printing === "normal") {
    where.variant = null;
    where.isPromo = false;
    where.isOvernumbered = false;
    where.collectorNumber = { not: { contains: "*" } };
  }

  // Facet words that also occur inside card names ("legend", "fury", "epic") —
  // see ScopedFilters in lib/search-query.ts for the collision counts. A
  // dimension the caller set explicitly in the URL always wins, so an inferred
  // word never contradicts a chip the visitor actually clicked.
  const scopedClauses: Prisma.CardWhereInput[] = [];
  if (parsed.scoped.type && query.type === undefined) scopedClauses.push({ type: parsed.scoped.type });
  if (parsed.scoped.domain && query.domain === undefined) scopedClauses.push({ domain: parsed.scoped.domain });
  if (parsed.scoped.rarity && query.rarity === undefined) scopedClauses.push({ rarity: parsed.scoped.rarity });

  const strippedName = normalizeSearch(parsed.name);

  // THE WHOLE QUERY WAS FACET WORDS ("legend", "epic fury spell"). There is no
  // name left to protect, so they become ordinary top-level filters and the
  // visitor gets the whole shelf — which is what they asked for.
  if (query.q && !strippedName) {
    for (const clause of scopedClauses) Object.assign(where, clause);
  }

  if (query.q && strippedName) {
    // Search the normalised name so "kaisa" matches "Kai'Sa". Also match number —
    // against the RAW string, which keeps the case and the "*" that a collector
    // number needs ("193*/166", "SP1"); the name half is normalised instead.
    const raw = normalizeSearch(query.q);
    const or: Prisma.CardWhereInput[] = [
      // ALTERNATIVE ONE, AND IT COMES FIRST ON PURPOSE: the entire typed phrase,
      // compared against the name as typed. This is the clause that makes the
      // scoped words safe. "Rune Prison" and "Hall of Legends" are real cards
      // whose names contain a facet word, and this alternative never consults
      // the tokeniser, so searching for one by name can never be turned into a
      // filtered search that misses it.
      { nameNormalized: { contains: raw } },
      { collectorNumber: { contains: query.q } },
    ];
    if (scopedClauses.length) {
      // ALTERNATIVE TWO: what is left of the name, of the kind the phrase named.
      // "kennen legend" → a card called Kennen that is a Legend. Every column
      // here is indexed (prisma/schema.prisma), so this is not a scan.
      or.push({ AND: [{ nameNormalized: { contains: strippedName } }, ...scopedClauses] });
    } else if (strippedName !== raw) {
      // No scoped words, but printing words were stripped ("akali overnumbered"):
      // match the remaining name, narrowed by the top-level printing filters.
      or.push({ nameNormalized: { contains: strippedName } });
    }
    // A community nickname resolves to specific printings by slug — a unique
    // column, so this is an indexed lookup of a handful of ids, not a scan.
    if (parsed.aliasSlugs.length) or.push({ slug: { in: parsed.aliasSlugs } });
    where.OR = or;
  } else if (query.q && parsed.aliasSlugs.length) {
    where.OR = [{ slug: { in: parsed.aliasSlugs } }];
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
    // "Most popular" (2026-09-26, /browse's default): the demand counters the
    // card-view beacon and search still write (Card.searchCount / viewCount —
    // the same ranking as the homepage price table), then price so a dead heat
    // lists the card a buyer is likelier to look up, then name for stable paging.
    case "popular":
      return [
        { searchCount: "desc" },
        { viewCount: "desc" },
        { [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
        { name: "asc" },
      ];
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
 * render never reads" pattern lib/price-history.ts's toPulseMovers() used for
 * the homepage's Market Pulse marquee until both were removed on 2026-09-17 —
 * this is now the only instance of it, applied where a page renders enough
 * tiles for the bytes to matter: /browse and /sets/[set]/gallery, the two
 * heaviest CardTile grids.
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
