import Link from "next/link";
import { prisma } from "@/lib/db";
import { Filters } from "@/components/Filters";
import { SortSelect } from "@/components/SortSelect";
import { BrowseGrid } from "@/components/BrowseGrid";
import {
  buildCardOrderBy,
  buildCardWhere,
  CARD_TILE_SELECT,
  CardQuery,
  CARD_PAGE_SIZE,
} from "@/lib/cards";

export const dynamic = "force-dynamic";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: CardQuery;
}) {
  const where = buildCardWhere(searchParams);
  const orderBy = buildCardOrderBy(searchParams.sort);

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy,
      select: CARD_TILE_SELECT,
      take: CARD_PAGE_SIZE,
    }),
  ]);

  // Serialize the active filters (minus page) so the infinite-scroll API gets the
  // same query. A key built from this also remounts the grid when filters change.
  const qs = new URLSearchParams(
    Object.entries(searchParams).filter(([k, v]) => v && k !== "page") as [string, string][]
  ).toString();

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Filters />

      <section className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-white">{total.toLocaleString()}</span>{" "}
            {total === 1 ? "card" : "cards"}
            {searchParams.q && (
              <> for <span className="text-brand-400">“{searchParams.q}”</span></>
            )}
          </p>
          <SortSelect />
        </div>

        {cards.length === 0 ? (
          <div className="card-surface grid place-items-center p-16 text-center">
            <p className="text-lg font-semibold text-white">No cards found</p>
            <p className="mt-1 text-sm text-slate-400">Try adjusting your filters or search.</p>
            <Link href="/browse" className="btn-primary mt-4">Reset</Link>
          </div>
        ) : (
          <BrowseGrid key={qs} initial={cards} total={total} query={qs} />
        )}
      </section>
    </div>
  );
}
