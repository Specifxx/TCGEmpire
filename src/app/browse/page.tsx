import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { COUNTRIES } from "@/lib/country";
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
import { getCountry } from "@/lib/get-country";

export const dynamic = "force-dynamic";

// Browse is the main "buy Riftbound cards" landing page, so give it a strong title
// and description. Internal search-result views (?q=) are noindex'd (Google
// discourages indexing site-search results) and all variants canonicalise to the
// clean /browse so crawl signals concentrate on the one page we want ranked.
export async function generateMetadata({ searchParams }: { searchParams: CardQuery }): Promise<Metadata> {
  const info = COUNTRIES[getCountry()];
  const q = (searchParams.q ?? "").trim();
  return {
    title: q ? `${q} — Riftbound cards & prices` : "Buy Riftbound Cards — Browse Every Single & Compare Prices",
    description: `Browse every Riftbound TCG card and compare live ${info.adjective} prices across stores to find the cheapest place to buy Riftbound singles in ${info.place}. Updated daily.`,
    alternates: { canonical: "/browse" },
    robots: q ? { index: false, follow: true } : undefined,
  };
}

export default async function BrowsePage({ searchParams }: { searchParams: CardQuery }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  const where = buildCardWhere(searchParams, country);
  const orderBy = buildCardOrderBy(searchParams.sort, country);
  const size = parsePageSize(searchParams.size);
  const page = parsePageNum(searchParams.page);

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy,
      select: cardTileSelect(country),
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Filters />

      <section className="min-w-0 flex-1">
        {!searchParams.q && (
          <div className="mb-4">
            <h1 className="font-display text-2xl font-extrabold text-white">Buy Riftbound Cards</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Browse every Riftbound TCG single and compare live {info.adjective} prices across stores to
              find the cheapest place to buy in {info.place}.
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
