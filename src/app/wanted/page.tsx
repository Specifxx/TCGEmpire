import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CardImage } from "@/components/CardImage";
import { ConditionBadge, DomainBadge, FoilBadge } from "@/components/Badge";
import { SellToBidButton } from "@/components/BuyOrderActions";
import { formatAUD, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function WantedPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string; sort?: string };
}) {
  const user = await getCurrentUser();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const q = searchParams.q?.trim();

  const where = {
    status: "OPEN" as const,
    ...(q ? { card: { name: { contains: q } } } : {}),
  };

  const orderBy =
    searchParams.sort === "newest"
      ? ({ createdAt: "desc" } as const)
      : ({ maxPriceCents: "desc" } as const);

  const [total, openValueAgg, buyOrders] = await Promise.all([
    prisma.buyOrder.count({ where: { status: "OPEN" } }),
    prisma.buyOrder.aggregate({
      where: { status: "OPEN" },
      _sum: { reservedCents: true },
    }),
    prisma.buyOrder.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        buyer: { select: { id: true, displayName: true } },
        card: {
          select: {
            id: true,
            name: true,
            domain: true,
            type: true,
            rarity: true,
            collectorNumber: true,
            energyCost: true,
            might: true,
            artSeed: true,
            orientation: true,
            imageUrl: true,
            imageThumbUrl: true,
            blurDataUrl: true,
            _count: { select: { listings: { where: { status: "ACTIVE" } } } },
          },
        },
      },
    }),
  ]);

  const matched = q ? buyOrders.length : total;
  const totalPages = Math.max(1, Math.ceil((q ? buyOrders.length : total) / PAGE_SIZE));
  const escrowed = openValueAgg._sum.reservedCents ?? 0;

  return (
    <div>
      {/* Hero */}
      <div className="card-surface mb-5 overflow-hidden">
        <div className="bg-gradient-to-r from-accent/15 via-ink-850 to-brand-600/20 p-6">
          <h1 className="text-2xl font-extrabold text-white">Wanted — Buy Orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Can&apos;t find stock? Buyers post what they&apos;ll pay and{" "}
            <span className="font-semibold text-accent">anyone can sell into it instantly</span>.
            This is live demand across TCGEmpire — if you own one of these cards,
            you have a guaranteed buyer.
          </p>
          <div className="mt-3 flex gap-6 text-sm">
            <div>
              <span className="font-bold text-white">{total.toLocaleString()}</span>{" "}
              <span className="text-slate-400">open buy orders</span>
            </div>
            <div>
              <span className="font-bold text-accent">{formatAUD(escrowed)}</span>{" "}
              <span className="text-slate-400">escrowed &amp; ready to pay out</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-400">
        Showing{" "}
        <span className="font-semibold text-white">{matched.toLocaleString()}</span>{" "}
        buy orders {q && <>for “{q}”</>} · highest bids first
      </p>

      {buyOrders.length === 0 ? (
        <div className="card-surface p-12 text-center text-slate-400">
          No open buy orders found.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {buyOrders.map((b) => {
            const isOwn = user?.id === b.buyer.id;
            const canSell = !!user && !isOwn;
            const reason = !user ? "Sign in" : isOwn ? "Your bid" : undefined;
            const inStock = b.card._count.listings > 0;
            const remaining = b.quantity - b.quantityFilled;
            return (
              <li key={b.id} className="card-surface flex gap-3 p-3">
                <Link href={`/card/${b.card.id}`} className="shrink-0">
                  <CardImage card={b.card} className="aspect-[5/7] w-20" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/card/${b.card.id}`}
                    className="truncate font-semibold text-white hover:text-brand-400"
                  >
                    {b.card.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <DomainBadge domain={b.card.domain} />
                    {b.condition === "ANY" ? (
                      <span className="chip bg-ink-800 text-slate-300">Any cond.</span>
                    ) : (
                      <ConditionBadge condition={b.condition} />
                    )}
                    {b.isFoil && <FoilBadge />}
                  </div>
                  <div className="mt-1 text-xs">
                    {inStock ? (
                      <span className="text-slate-500">{b.card._count.listings} in stock</span>
                    ) : (
                      <span className="font-medium text-gold">⚡ No stock — demand only</span>
                    )}
                  </div>

                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <div className="text-[11px] text-slate-500">bid{remaining > 1 ? ` · wants ${remaining}` : ""}</div>
                      <div className="text-lg font-bold text-accent">
                        {formatAUD(b.maxPriceCents)}
                      </div>
                    </div>
                    <SellToBidButton buyOrderId={b.id} canSell={canSell} reason={reason} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!q && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`/wanted?page=${page - 1}`} className="btn-ghost">← Prev</Link>
          )}
          <span className="px-3 text-sm text-slate-400">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/wanted?page=${page + 1}`} className="btn-ghost">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
