import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CardImage } from "@/components/CardImage";
import {
  ConditionBadge,
  DomainBadge,
  FoilBadge,
  RarityBadge,
} from "@/components/Badge";
import { BuyButton } from "@/components/BuyButton";
import {
  PlaceBuyOrderForm,
  SellToBidButton,
} from "@/components/BuyOrderActions";
import { formatAUD, timeAgo } from "@/lib/format";
import { conditionInfo } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: { id: string } }) {
  const [card, user] = await Promise.all([
    prisma.card.findUnique({
      where: { id: params.id },
      include: {
        listings: {
          where: { status: "ACTIVE", quantity: { gt: 0 } },
          orderBy: { priceCents: "asc" },
          include: { seller: { select: { id: true, displayName: true } } },
        },
        buyOrders: {
          where: { status: "OPEN" },
          orderBy: { maxPriceCents: "desc" },
          include: { buyer: { select: { id: true, displayName: true } } },
        },
      },
    }),
    getCurrentUser(),
  ]);

  if (!card) notFound();

  const listings = card.listings;
  const buyOrders = card.buyOrders;
  const lowestAsk = listings[0]?.priceCents;
  const highestBid = buyOrders[0]?.maxPriceCents;
  const spread =
    lowestAsk != null && highestBid != null ? lowestAsk - highestBid : null;

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        ← Back to marketplace
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Card visual + facts */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card-surface mx-auto max-w-[320px] p-4">
            <CardImage
              card={card}
              full
              className="aspect-[5/7] w-full"
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <DomainBadge domain={card.domain} />
              <RarityBadge rarity={card.rarity} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-white">{card.name}</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {card.setName} ({card.setCode}) · {card.collectorNumber}
            </p>

            {/* Order-book metrics */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Lowest ask" value={lowestAsk != null ? formatAUD(lowestAsk) : "—"} tone="ask" />
              <Metric label="Highest bid" value={highestBid != null ? formatAUD(highestBid) : "—"} tone="bid" />
              <Metric
                label="Spread"
                value={spread != null ? formatAUD(Math.abs(spread)) : "—"}
              />
              <Metric label="Reference" value={formatAUD(card.marketPriceCents)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {card.energyCost != null && <Stat label="Energy" value={String(card.energyCost)} />}
              {card.might != null && <Stat label="Might" value={String(card.might)} />}
              {card.power != null && <Stat label="Power" value={String(card.power)} />}
              <Stat label="For sale" value={String(listings.length)} />
              <Stat label="Buy orders" value={String(buyOrders.length)} />
            </div>
          </div>

          {/* Order book: asks + bids */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* ASKS */}
            <div className="card-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-700 p-4">
                <h2 className="font-bold text-white">
                  For sale <span className="text-slate-500">({listings.length})</span>
                </h2>
                <Link href="/sell" className="btn-ghost text-xs">+ Sell yours</Link>
              </div>
              {listings.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  <p className="font-semibold text-white">Out of stock</p>
                  <p className="mt-1">
                    No one is selling this card right now — place a buy order on
                    the right and a seller can fill it.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {listings.map((l) => {
                    const isOwn = user?.id === l.seller.id;
                    const canBuy = !!user && !isOwn && user.balanceCents >= l.priceCents;
                    const reason = !user
                      ? "Sign in"
                      : isOwn
                      ? "Yours"
                      : user.balanceCents < l.priceCents
                      ? "Low bal."
                      : undefined;
                    return (
                      <li key={l.id} className="flex items-center gap-2 p-3">
                        <div className="flex flex-1 flex-wrap items-center gap-1.5">
                          <ConditionBadge condition={l.condition} />
                          {l.isFoil && <FoilBadge />}
                          <span className="text-xs text-slate-500">
                            {l.seller.displayName} · {timeAgo(l.createdAt)}
                          </span>
                        </div>
                        <span className="font-bold text-white">{formatAUD(l.priceCents)}</span>
                        <div className="w-24 text-right">
                          <BuyButton listingId={l.id} canBuy={canBuy} reason={reason} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* BIDS */}
            <div className="card-surface overflow-hidden">
              <div className="border-b border-ink-700 p-4">
                <h2 className="font-bold text-white">
                  Buy orders <span className="text-slate-500">({buyOrders.length})</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  What buyers will pay. Sell into any of these instantly.
                </p>
              </div>

              <div className="p-3">
                <PlaceBuyOrderForm
                  cardId={card.id}
                  marketPriceCents={card.marketPriceCents}
                  signedIn={!!user}
                />
              </div>

              {buyOrders.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-slate-400">
                  No buy orders yet. Be the first to set a price you&apos;ll pay.
                </p>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {buyOrders.map((b) => {
                    const isOwn = user?.id === b.buyer.id;
                    const canSell = !!user && !isOwn;
                    const reason = !user ? "Sign in" : isOwn ? "Your bid" : undefined;
                    const remaining = b.quantity - b.quantityFilled;
                    return (
                      <li key={b.id} className="flex items-center gap-2 p-3">
                        <div className="flex flex-1 flex-wrap items-center gap-1.5">
                          {b.condition === "ANY" ? (
                            <span className="chip bg-ink-800 text-slate-300">Any cond.</span>
                          ) : (
                            <ConditionBadge condition={b.condition} />
                          )}
                          {b.isFoil && <FoilBadge />}
                          <span className="text-xs text-slate-500">
                            {b.buyer.displayName}
                            {remaining > 1 ? ` · wants ${remaining}` : ""}
                          </span>
                        </div>
                        <span className="font-bold text-accent">{formatAUD(b.maxPriceCents)}</span>
                        <div className="w-24 text-right">
                          <SellToBidButton buyOrderId={b.id} canSell={canSell} reason={reason} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ask" | "bid";
}) {
  const color = tone === "ask" ? "text-white" : tone === "bid" ? "text-accent" : "text-slate-200";
  return (
    <div className="rounded-lg bg-ink-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-white">{value}</div>
    </div>
  );
}
