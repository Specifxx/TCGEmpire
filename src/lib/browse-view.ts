// The /browse page's market view, computed on the server for ANY market
// (2026-11-05, DECISIONS.md "The card list becomes one CDN copy per URL"). The
// page renders the baseline market (DEFAULT_COUNTRY, the US) into its HTML, or
// the market a `?market=` link pins, and Vercel's CDN keeps that one copy per
// URL; the client island (components/browse/BrowseMarketBoard.tsx) asks
// /api/browse-view for the visitor's market when it differs, which the CDN also
// keeps. A text search (`?q=`) is rewritten to app/browse/search/page.tsx, which
// meters it and renders the visitor's market directly (pinned): the search API
// stays private, so this view's API refuses `q`.
//
// Server-only: it queries the database. The result is JSON-safe (a sealed
// group's firstSeenAt as ISO) because the API route sends it over fetch.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CONTENT_TAG } from "./revalidate-content";
import { COUNTRIES, type Country } from "./country";
import { buildCardOrderBy, buildCardWhere, cardTileSelect, parsePageNum, parsePageSize, trimTileArtFallback, type CardQuery } from "./cards";
import { getSealedGroups } from "./sealed-import";
import { loadSealedForSearch, matchSealedGroups } from "./sealed-search";
import { soldOutEverywhere } from "./sealed-offers";
import type { SealedViewGroup } from "./sealed-view";
import type { CardTileData } from "@/components/CardTile";
import { BROWSE_DEFAULT_SORT, BROWSE_SEALED_SHOWN, CARD_ONLY_FILTERS } from "./browse-shared";

export { browseQuery, type BrowseParams } from "./browse-shared";

/** A tile as the island ships it: cardTileSelect's row with the art fallback trimmed. */
export type BrowseTile = Omit<CardTileData, "energyCost" | "might" | "artSeed"> & Partial<Pick<CardTileData, "energyCost" | "might" | "artSeed">>;

export interface BrowseView {
  country: Country;
  currency: string;
  place: string;
  /** The search words, trimmed; empty means no search. */
  q: string;
  total: number;
  totalPages: number;
  page: number;
  size: number;
  cards: BrowseTile[];
  /** Sealed products matching the same words (a plain text search's first page only). */
  sealedMatches: number;
  sealedShown: SealedViewGroup[];
  /** The currency the sealed tiles are in: the market's, or the default market's when it has no sealed. */
  sealedCurrency: string;
  /** groupKeys of the shown sealed products every store we track says are sold out. */
  soldOutKeys: string[];
}

export async function buildBrowseView(country: Country, sp: CardQuery): Promise<BrowseView> {
  const where = buildCardWhere(sp, country);
  // Default sort is "Most popular" (2026-09-26): set-and-number put US$0.01
  // commons on page 1. The demand counters it ranks by are still written
  // (api/card/[id]/view). ?sort=number etc. keep working for shared links.
  const orderBy = buildCardOrderBy(sp.sort || BROWSE_DEFAULT_SORT, country);
  const size = parsePageSize(sp.size);
  const page = parsePageNum(sp.page);

  // EGRESS: WITHOUT this every visitor and every crawler hit ran two Postgres
  // queries — and /browse is both the site's main landing page and the deepest
  // crawl surface. That made it the largest consumer of a Neon network-transfer
  // allowance this project has already exhausted three times.
  //
  // The DEFAULT view (no filters, no sort, no paging — the one crawlers and most
  // visitors actually get) is identical for every visitor in a given market, so
  // it's memoised per country. Any filtered/sorted/paged view still queries live
  // (now once per six hours per URL, behind the CDN). Tagged CONTENT_TAG so the
  // price import purges it immediately rather than serving stale prices.
  //
  // Payload is ~100 rows of cardTileSelect (tens of KB) — comfortably under the
  // size ceiling above which Next's Data Cache silently declines to store an
  // entry and every request falls through to the database (see lib/db.ts).
  const isDefaultView = Object.values(sp).every((v) => v == null || v === "");
  const runQuery = () =>
    Promise.all([
      prisma.card.count({ where }),
      prisma.card.findMany({
        where,
        orderBy,
        select: cardTileSelect(country),
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
  const [total, rows] = isDefaultView
    ? await unstable_cache(runQuery, ["browse-default-popular", country], {
        revalidate: 3600,
        tags: [CONTENT_TAG],
      })()
    : await runQuery();
  const totalPages = Math.max(1, Math.ceil(total / size));
  const cards = rows.map((c) => trimTileArtFallback(c));

  // The visitor's own words, for the eBay search beside the results
  // (2026-09-26). Trimmed like generateMetadata's; empty means no search.
  const q = (sp.q ?? "").trim();
  // SEALED PRODUCTS MATCHING THE SAME WORDS, on a plain text search's first page
  // (not under a card-only filter, which a box cannot satisfy, and not repeated on
  // page 2+). The same matcher the navbar dropdown uses (lib/sealed-search.ts), so
  // what the dropdown offered is what Enter shows. getSealedGroups caches itself
  // (memo + data cache), is called here at page level and never from inside an
  // unstable_cache callback (egress rule 6), and a failure only drops the section.
  const wantsSealed = q.length >= 2 && page === 1 && CARD_ONLY_FILTERS.every((k) => !sp[k]);
  const sealedRead = wantsSealed
    ? await loadSealedForSearch(country, getSealedGroups).catch(() => null)
    : null;
  const sealedMatches = sealedRead ? matchSealedGroups(sealedRead.groups, q) : [];
  const sealedShown = sealedMatches.slice(0, BROWSE_SEALED_SHOWN);
  const sealedCurrency = sealedRead ? COUNTRIES[sealedRead.priceCountry].currency : COUNTRIES[country].currency;

  return {
    country,
    currency: COUNTRIES[country].currency,
    place: COUNTRIES[country].place,
    q,
    total,
    totalPages,
    page,
    size,
    cards,
    sealedMatches: sealedMatches.length,
    sealedShown: sealedShown.map((g) => ({ ...g, firstSeenAt: g.firstSeenAt ? g.firstSeenAt.toISOString() : null })),
    sealedCurrency,
    soldOutKeys: sealedShown.filter((g) => soldOutEverywhere(g.listings)).map((g) => g.groupKey),
  };
}
