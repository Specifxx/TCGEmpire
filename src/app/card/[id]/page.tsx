import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge } from "@/components/Badge";
import { WishlistButton } from "@/components/WishlistButton";
import { formatAUD, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      retailerPrices: { orderBy: { priceCents: "asc" } },
    },
  });

  if (!card) notFound();

  // Rank by delivered cost where we KNOW the shipping (eBay), else by item price.
  // We never show estimated shipping — only an actual, confirmed shipping cost.
  const prices = card.retailerPrices
    .map((p) => ({ ...p, delivered: p.priceCents + (p.shippingCents ?? 0) }))
    .sort((a, b) => a.delivered - b.delivered);
  const lowest = prices[0];

  return (
    <div>
      <Link href="/browse" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Back to database
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Card visual */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card-surface mx-auto max-w-[320px] p-4">
            <CardImage card={card} full className="aspect-[5/7] w-full" />
          </div>
        </div>

        {/* Details + price comparison */}
        <div className="min-w-0">
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <DomainBadge domain={card.domain} />
              <RarityBadge rarity={card.rarity} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
              <VariantBadge variant={card.variant} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-white">{card.name}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {card.setName} ({card.setCode}) · {card.collectorNumber}
                </p>
              </div>
              <WishlistButton cardId={card.id} variant="full" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Cheapest price" value={lowest ? formatAUD(lowest.priceCents) : "—"} highlight />
              <Metric label="In stock at" value={`${prices.length} ${prices.length === 1 ? "store" : "stores"}`} />
              {card.energyCost != null && <Metric label="Energy" value={String(card.energyCost)} />}
              {card.might != null && <Metric label="Might" value={String(card.might)} />}
              {card.might == null && card.power != null && <Metric label="Power" value={String(card.power)} />}
            </div>
          </div>

          {/* Price comparison */}
          <div className="card-surface mt-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-700 p-4">
              <h2 className="font-bold text-white">
                Price comparison <span className="text-slate-500">({prices.length})</span>
              </h2>
              {prices[0] && (
                <span className="text-xs text-slate-500">updated {timeAgo(prices[0].lastSeen)}</span>
              )}
            </div>

            {prices.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                <p className="font-semibold text-white">No prices found yet</p>
                <p className="mt-1">
                  We haven&apos;t matched this card to a store listing. Check back soon —
                  our price feeds refresh regularly.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {prices.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 p-4 hover:bg-ink-900/50">
                    <div className="w-6 text-center text-sm font-bold text-slate-500">{i + 1}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{p.retailerName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>}
                        <span className="text-brand-400">● In stock</span>
                        {p.shippingCents != null && (
                          <span>
                            {p.shippingCents === 0 ? "+ free shipping" : `+ ${formatAUD(p.shippingCents)} shipping`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${i === 0 ? "text-accent" : "text-white"}`}>
                        {formatAUD(p.priceCents)}
                      </div>
                      {p.shippingCents != null && (
                        <div className="text-[11px] text-slate-400">
                          ≈ {formatAUD(p.delivered)} delivered
                        </div>
                      )}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="nofollow sponsored noopener noreferrer"
                      className="btn-primary"
                    >
                      View →
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-ink-800 p-3 text-center text-[11px] text-slate-600">
              Prices are collected from public store listings and may change. RiftCompareAU
              may earn a commission on some outbound links.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
