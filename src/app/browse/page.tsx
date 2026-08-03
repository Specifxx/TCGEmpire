import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { getCountry } from "@/lib/get-country";
import { Filters } from "@/components/Filters";
import { ActiveFilters } from "@/components/ActiveFilters";
import { SortSelect } from "@/components/SortSelect";
import { CardTile } from "@/components/CardTile";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { AdSlot } from "@/components/AdSlot";
import {
  buildCardOrderBy,
  buildCardWhere,
  cardTileSelect,
  CardQuery,
  parsePageNum,
  parsePageSize,
} from "@/lib/cards";
import { SITE_URL } from "@/lib/site";

// searchParams-driven (filters/pagination), so the route stays dynamic.
export const dynamic = "force-dynamic";

// Browse is the main "buy Riftbound cards" landing page, so give it a strong title
// and description. Metadata is market-neutral: Googlebot crawls mostly from US IPs,
// so geo-derived copy would index the US variant for every market. Internal
// search-result views (?q=) are noindex'd (Google discourages indexing site-search
// results) and canonicalise to the clean /browse.
//
// Pagination canonicals: ONLY the clean default view (?page=N and nothing else)
// self-canonicalises — per Google's guidance paginated pages are not duplicates of
// page 1, and folding them into /browse discards the card links only those pages
// carry. Any sized/sorted/filtered variant still canonicalises to /browse (its
// content is a permutation, and /browse?page=2&size=10 shows entirely different
// cards than /browse?page=2 — they must never share a canonical). Out-of-range
// pages are noindex'd so the scheme can't manufacture indexable empty soft-404s.
const isCleanPagination = (searchParams: CardQuery) =>
  Object.entries(searchParams).every(([k, v]) => k === "page" || v == null || v === "");

export async function generateMetadata({ searchParams }: { searchParams: CardQuery }): Promise<Metadata> {
  const q = (searchParams.q ?? "").trim();
  const page = parsePageNum(searchParams.page);
  const base = {
    title: q ? `${q} — Riftbound cards & prices` : "Riftbound Card Database — All Cards & Prices",
    description:
      "Browse every Riftbound TCG card and compare live prices across local stores in AU, NZ, US, UK & SG to find the cheapest place to buy singles. Updated daily.",
  };
  if (q) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
  if (page > 1 && isCleanPagination(searchParams)) {
    // Guard the self-canonical against out-of-range pages (a 200 with an empty
    // grid must not become an indexable canonical target). Default page size —
    // the clean view has no size param by definition.
    const total = await prisma.card.count().catch(() => 0);
    const totalPages = Math.max(1, Math.ceil(total / parsePageSize(undefined)));
    if (page > totalPages) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
    return { ...base, alternates: { canonical: `/browse?page=${page}` } };
  }
  return { ...base, alternates: { canonical: "/browse" } };
}

export default async function BrowsePage({ searchParams }: { searchParams: CardQuery }) {
  // The route reads searchParams so it is per-request dynamic regardless — the
  // cookie read costs nothing extra here, and sort/filter MUST use the visitor's
  // market or the grid renders local prices in AU-column order (US$12 above US$3)
  // and price filters drop cards with no AU listing. Only the METADATA is
  // market-neutral (that's what Googlebot indexes).
  const country = getCountry();
  const where = buildCardWhere(searchParams, country);
  const orderBy = buildCardOrderBy(searchParams.sort, country);
  const size = parsePageSize(searchParams.size);
  const page = parsePageNum(searchParams.page);

  // EGRESS: this route is force-dynamic (searchParams), so WITHOUT this every
  // single visitor and every crawler hit ran two Postgres queries — and /browse
  // is both the site's main landing page and the deepest crawl surface. That made
  // it the largest consumer of a Neon network-transfer allowance this project has
  // already exhausted three times.
  //
  // The DEFAULT view (no filters, no sort, no paging — the one crawlers and most
  // visitors actually get) is identical for every visitor in a given market, so
  // it's memoised per country. Any filtered/sorted/paged view still queries live:
  // those are long-tail, per-user, and caching the full permutation space would
  // be pointless. Tagged CONTENT_TAG so the price import purges it immediately
  // rather than serving up to an hour of stale prices.
  //
  // Payload is ~100 rows of cardTileSelect (tens of KB) — comfortably under the
  // size ceiling above which Next's Data Cache silently declines to store an
  // entry and every request falls through to the database (see lib/db.ts).
  const isDefaultView = Object.values(searchParams).every((v) => v == null || v === "");
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
  const [total, cards] = isDefaultView
    ? await unstable_cache(runQuery, ["browse-default", country], {
        revalidate: 3600,
        tags: [CONTENT_TAG],
      })()
    : await runQuery();
  const totalPages = Math.max(1, Math.ceil(total / size));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Browse Cards", item: `${SITE_URL}/browse` },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Riftbound Card Database — All Cards & Prices",
    // Matches the page's canonical: clean paginated views self-canonicalise, so
    // their structured data must not contradict that with a bare /browse url.
    url:
      page > 1 && isCleanPagination(searchParams) && page <= totalPages
        ? `${SITE_URL}/browse?page=${page}`
        : `${SITE_URL}/browse`,
    description:
      "Browse every Riftbound TCG card and compare live prices across stores to find the cheapest place to buy Riftbound singles. Updated daily.",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    // ItemList of the cards actually rendered on this page (ranked positionally).
    ...(cards.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: cards.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              url: `${SITE_URL}/card/${c.slug ?? c.id}`,
            })),
          },
        }
      : {}),
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, collectionLd]) }}
      />
      <Filters />

      <section className="min-w-0 flex-1">
        {!searchParams.q && (
          <div className="mb-4">
            <h1 className="font-display text-2xl font-extrabold text-white">Buy Riftbound Cards</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Browse every Riftbound TCG single and compare live prices across local stores in AU, NZ,
              US &amp; UK to find the cheapest place to buy.
            </p>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-white">{total.toLocaleString()}</span>{" "}
            {total === 1 ? "card" : "cards"}
            {searchParams.q && (
              <> for <span className="text-brand-400">“{searchParams.q}”</span></>
            )}
            {total > 0 && <span className="text-slate-600"> · page {page} of {totalPages}</span>}
          </p>
          <div className="flex items-center gap-3">
            <PageSizeSelect size={size} />
            <SortSelect />
          </div>
        </div>

        <ActiveFilters />

        <AdSlot format="horizontal" height={90} className="mb-4" />

        {cards.length === 0 ? (
          <div className="card-surface grid place-items-center p-16 text-center">
            <p className="text-lg font-semibold text-white">
              {total > 0 ? "Nothing on this page" : "No cards found"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {total > 0 ? "Try an earlier page." : "Try adjusting your filters or search."}
            </p>
            <Link href="/browse" className="btn-primary mt-4">Reset</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {cards.map((c) => (
                <CardTile key={c.id} card={c} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} params={searchParams as Record<string, string | undefined>} />
          </>
        )}
      </section>
    </div>
  );
}
