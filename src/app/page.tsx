import Link from "next/link";
import { prisma } from "@/lib/db";
import { Filters } from "@/components/Filters";
import { SortSelect } from "@/components/SortSelect";
import { CardTile } from "@/components/CardTile";
import { AdSlot } from "@/components/AdSlot";
import {
  buildCardOrderBy,
  buildCardWhere,
  CARD_TILE_SELECT,
  CardQuery,
  CARD_PAGE_SIZE,
} from "@/lib/cards";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: CardQuery;
}) {
  const where = buildCardWhere(searchParams);
  const orderBy = buildCardOrderBy(searchParams.sort);
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [total, cards, pricedCount] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy,
      select: CARD_TILE_SELECT,
      skip: (page - 1) * CARD_PAGE_SIZE,
      take: CARD_PAGE_SIZE,
    }),
    prisma.card.count({ where: { lowestPriceCents: { not: null } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / CARD_PAGE_SIZE));

  function pageHref(p: number) {
    const next = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => v) as [string, string][]
    );
    next.set("page", String(p));
    return `/?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Filters />

      <section className="min-w-0 flex-1">
        {/* Hero */}
        <div className="card-surface mb-5 overflow-hidden">
          <div className="relative bg-gradient-to-r from-brand-600/30 via-ink-850 to-accent/10 p-6">
            <h1 className="text-2xl font-extrabold text-white">
              Riftbound Card Database &amp; Price Comparison · Australia
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Every Riftbound card with live prices compared across Australian
              stores. Find the cheapest place to buy — across{" "}
              <span className="font-semibold text-accent">
                {pricedCount.toLocaleString()}
              </span>{" "}
              priced cards and counting.
            </p>
          </div>
        </div>

        {/* Leaderboard ad */}
        <AdSlot className="mb-5" height={90} />

        {/* Toolbar */}
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
            <Link href="/" className="btn-primary mt-4">Reset</Link>
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
