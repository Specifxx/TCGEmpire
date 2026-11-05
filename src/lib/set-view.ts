// A set page's market view, computed on the server for ANY market (2026-11-05,
// DECISIONS.md "The set pages become one CDN copy per URL"). /sets/[set] renders
// the baseline market (DEFAULT_COUNTRY, the US, or the market a `?market=` link
// pins) into its HTML and Vercel's CDN keeps that one copy per URL; the client
// island (components/sets/SetMarketBoard.tsx) asks /api/set-view for the
// visitor's market when it differs, which the CDN also keeps. The page and the
// API share this, so the two can never disagree.
//
// Everything here is what the page computed in place until 2026-11-05: the
// set's totals, the filtered and paged grid (the default view memoised per set
// and market), the data-derived intro, the #price-guide rows and the facts the
// "How to read … prices" section reads off them. Server-only: it queries the
// database. The result is JSON-safe because the API route sends it over fetch.
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CONTENT_TAG } from "./revalidate-content";
import { COUNTRIES, priceField, type Country } from "./country";
import { buildCardOrderBy, buildCardWhere, cardTileSelect, parsePageNum, parsePageSize, trimTileArtFallback, type CardQuery } from "./cards";
import { storeCountsByCountry } from "./cards";
import { buildCollectionNarrative } from "./content/collection-narrative";
import { getSiteMedianCents } from "./content/site-median";
import { setPriceGuideRows, type SetPriceGuideRow } from "./set-price-guide";
import type { SetInfo } from "./constants";
import type { BrowseTile } from "./browse-view";

export { browseQuery as setQuery } from "./browse-shared";

/** The set's dearest or cheapest priced card, for the "How to read" prose. */
export interface SetGuideFact {
  name: string;
  priceCents: number;
}

export interface SetView {
  country: Country;
  currency: string;
  place: string;
  adjective: string;
  /** The filter panel's keyword, trimmed; empty means none. A set page is never metered. */
  q: string;
  /** Every card in the set, whatever the filters: the hero count and the empty state read it. */
  totalInSet: number;
  /** Cards with a live price in this market. */
  priced: number;
  total: number;
  totalPages: number;
  page: number;
  size: number;
  cards: BrowseTile[];
  /** The data-derived intro, default view only; empty otherwise. */
  intro: string[];
  /** Every card dearest first, default view only; empty otherwise. */
  priceGuide: SetPriceGuideRow[];
  guideTop: SetGuideFact | null;
  guideLow: SetGuideFact | null;
  /** The rarity filling the ten dearest cards, when one fills at least half of them. */
  topTenRarity: { rarity: string; n: number } | null;
}

export async function buildSetView(set: SetInfo, country: Country, searchParams: CardQuery): Promise<SetView> {
  // Unfiltered totals for the set (hero copy + the "not released yet" empty
  // state) — distinct from the filtered/paginated grid below.
  const where = { ...buildCardWhere(searchParams, country), setCode: set.code };
  // A-Z by default here (unlike /browse's "set & card number") — this page is
  // already scoped to one set, so a numeric ordering isn't the useful default.
  const orderBy = buildCardOrderBy(searchParams.sort ?? "name", country);
  const size = parsePageSize(searchParams.size);
  const page = parsePageNum(searchParams.page);
  // The words typed in the filter panel's search box, for the count line.
  const q = (searchParams.q ?? "").trim();

  // EGRESS: same fix as /browse (also force-dynamic, also both the landing page
  // for a set AND a deep crawl surface). The DEFAULT view — no filters, sort or
  // paging — is identical for every visitor in a market, so it's memoised per
  // (set, country). Any filtered/sorted/paged view still queries live (once per
  // six hours per URL and market, behind the CDN). Tagged CONTENT_TAG so the
  // price import purges it immediately.
  const isDefaultView = Object.values(searchParams).every((v) => v == null || v === "");
  const runQuery = () =>
    Promise.all([
      prisma.card.count({ where: { setCode: set.code } }),
      prisma.card.count({ where: { setCode: set.code, [priceField(country)]: { not: null } } }),
      prisma.card.count({ where }),
      prisma.card.findMany({
        where,
        orderBy,
        select: cardTileSelect(country),
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
  const [totalInSet, priced, totalFiltered, cardsFiltered] = isDefaultView
    ? await unstable_cache(runQuery, ["set-default", set.code, country], {
        revalidate: 3600,
        tags: [CONTENT_TAG],
      })()
    : await runQuery();
  const [total, cards] = totalInSet === 0 ? [0, []] : [totalFiltered, cardsFiltered];
  const totalPages = Math.max(1, Math.ceil(total / size));

  // ── Data-derived editorial intro (GROWTH-AUDIT.md § 3) ─────────────────────
  // This template measured 459 median prose words while carrying 347 inbound
  // internal links — the best-linked thin page on the site. buildCollectionNarrative
  // already supported kind: "set" and had simply never been called here; it is
  // the same generator the champion hubs and facets use, so the analytical tone
  // matches by construction.
  //
  // DEFAULT VIEW ONLY, and its own lean query. The grid above is one page of 60
  // cards, which cannot describe a set's price distribution — the narrative needs
  // every card's price, but only four scalar fields of each, so this pulls ~60
  // bytes a row instead of a full tile payload (see the egress rules in lib/db.ts).
  // Filtered and paged views skip it entirely: they canonicalise elsewhere, so
  // they are not the indexed page this prose exists for, and they must not pay
  // for a query they don't render.
  // ALSO THE PRICE GUIDE's source (2026-09-24): the same one read, widened by
  // the four fields the "#price-guide" table needs (id/slug to link, variant/
  // isPromo to name the printing), plus ONE grouped in-stock count over the
  // set's ids. Still ~100 bytes a row for a set of ~300, far under the 1.2 MB
  // unstable_cache ceiling (lib/db.ts rule 2).
  const narrativeMembers = isDefaultView
    ? await unstable_cache(
        async () => {
          const rows = (await prisma.card.findMany({
            where: { setCode: set.code },
            select: {
              id: true, slug: true, name: true, rarity: true, collectorNumber: true, setCode: true,
              variant: true, isPromo: true, [priceField(country)]: true,
            } as Prisma.CardSelect,
          })) as unknown as ({ id: string } & Record<string, unknown>)[];
          const counts = await storeCountsByCountry(rows.map((r) => r.id));
          return rows.map((r) => ({ ...r, stores: counts.get(r.id)?.[country] ?? 0 }));
        },
        ["set-narrative-guide", set.code, country],
        { revalidate: 3600, tags: [CONTENT_TAG] },
      )().catch((e) => {
        // A narrative is worth less than the page. Degrade to no intro.
        console.error(`sets/${set.slug}: narrative query failed, rendering without the intro:`, e);
        return [] as Record<string, unknown>[];
      })
    : [];
  const siteMedianCents = isDefaultView ? await getSiteMedianCents(country) : null;
  const intro =
    narrativeMembers.length > 0
      ? buildCollectionNarrative({
          kind: "set",
          label: set.name,
          currency: COUNTRIES[country].currency,
          place: COUNTRIES[country].place,
          members: narrativeMembers.map((c) => {
            const row = c as Record<string, unknown>;
            return {
              name: String(row.name),
              priceCents: (row[priceField(country)] as number | null) ?? null,
              rarity: row.rarity as string | undefined,
              collectorNumber: row.collectorNumber as string | undefined,
            };
          }),
          siteMedianCents,
        })
      : [];

  const priceGuide = setPriceGuideRows(narrativeMembers as Record<string, unknown>[], priceField(country));
  // Facts for "How to read … prices" that only this set has: its dearest and
  // cheapest priced cards, and which rarity fills its ten dearest. A sentence
  // that reads the same on every set page counts as template chrome in the
  // AdSense audit (scripts/adsense-audit.ts, sentences on >35% of a template).
  const pricedGuide = priceGuide.filter((r) => r.priceCents != null);
  const fact = (r: SetPriceGuideRow | undefined): SetGuideFact | null => (r && r.priceCents != null ? { name: r.name, priceCents: r.priceCents } : null);
  const guideTop = fact(pricedGuide[0]);
  const guideLow = pricedGuide.length > 1 ? fact(pricedGuide[pricedGuide.length - 1]) : null;
  const topTenRarity = (() => {
    const tally = new Map<string, number>();
    for (const r of pricedGuide.slice(0, 10)) if (r.rarity) tally.set(r.rarity, (tally.get(r.rarity) ?? 0) + 1);
    const [rarity, n] = [...tally].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
    return rarity && pricedGuide.length >= 10 && n >= 5 ? { rarity, n } : null;
  })();

  return {
    country,
    currency: COUNTRIES[country].currency,
    place: COUNTRIES[country].place,
    adjective: COUNTRIES[country].adjective,
    q,
    totalInSet,
    priced,
    total,
    totalPages,
    page,
    size,
    cards: cards.map((c) => trimTileArtFallback(c)),
    intro,
    priceGuide,
    guideTop,
    guideLow,
    topTenRarity,
  };
}
