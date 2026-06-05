import Link from "next/link";
import { prisma } from "@/lib/db";
import { Filters } from "@/components/Filters";
import { SortSelect } from "@/components/SortSelect";
import { ListingCard } from "@/components/ListingCard";
import {
  buildOrderBy,
  buildWhere,
  LISTING_TILE_SELECT,
  ListingQuery,
  PAGE_SIZE,
} from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: ListingQuery;
}) {
  const where = buildWhere(searchParams);
  const orderBy = buildOrderBy(searchParams.sort);
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [total, listings, openBuyOrders] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      select: LISTING_TILE_SELECT,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.buyOrder.count({ where: { status: "OPEN" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {/* Hero strip */}
        <div className="card-surface mb-5 overflow-hidden">
          <div className="relative bg-gradient-to-r from-brand-600/30 via-ink-850 to-accent/10 p-6">
            <h1 className="text-2xl font-extrabold text-white">
              Riftbound Marketplace · Australia
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Buy and sell Riftbound singles in AUD with real card images. Browse{" "}
              {total.toLocaleString()} live listings — filter by domain, rarity,
              condition and price.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href="/wanted" className="btn-accent">
                ⚡ {openBuyOrders.toLocaleString()} buy orders waiting →
              </Link>
              <p className="text-xs text-slate-400">
                Out of stock? Post a buy order and any seller can fill it.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-white">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "listing" : "listings"}
            {searchParams.q && (
              <>
                {" "}
                for <span className="text-brand-400">“{searchParams.q}”</span>
              </>
            )}
          </p>
          <SortSelect />
        </div>

        {/* Grid */}
        {listings.length === 0 ? (
          <div className="card-surface grid place-items-center p-16 text-center">
            <p className="text-lg font-semibold text-white">No listings found</p>
            <p className="mt-1 text-sm text-slate-400">
              Try clearing some filters or searching for a different card.
            </p>
            <Link href="/" className="btn-primary mt-4">
              Reset filters
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="btn-ghost">
                ← Prev
              </Link>
            )}
            <span className="px-3 text-sm text-slate-400">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="btn-ghost">
                Next →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
