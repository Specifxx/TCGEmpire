import Link from "next/link";
import { prisma } from "@/lib/db";
import { Filters } from "@/components/Filters";
import { SortSelect } from "@/components/SortSelect";
import { CardTile } from "@/components/CardTile";
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
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy,
      select: CARD_TILE_SELECT,
      skip: (page - 1) * CARD_PAGE_SIZE,
      take: CARD_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / CARD_PAGE_SIZE));

  function pageHref(p: number) {
    const next = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => v) as [string, string][]
    );
    next.set("page", String(p));
    return `/browse?${next.toString()}`;
  }

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="btn-ghost">← Prev</Link>}
            <span className="px-3 text-sm text-slate-400">Page {page} of {totalPages}</span>
            {page < totalPages && <Link href={pageHref(page + 1)} className="btn-ghost">Next →</Link>}
          </div>
        )}
      </section>
    </div>
  );
}
