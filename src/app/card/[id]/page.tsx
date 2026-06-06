import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "@/components/Badge";
import { isOvernumbered, isSignature } from "@/lib/constants";
import { WishlistButton } from "@/components/WishlistButton";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { formatMoney, timeAgo } from "@/lib/format";
import { effectiveShippingCents } from "@/lib/retailers";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice } from "@/lib/country";

// ISR while AU-only; dynamic per-request once NZ mode is enabled (cookie-driven).
export const revalidate = 180;

// Accept either the slug ("vayne-hunter-sfd-223-221") or the legacy cuid.
const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const country = getCountry();
  const info = COUNTRIES[country];
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    select: { slug: true, name: true, setName: true, setCode: true, collectorNumber: true, lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, imageUrl: true, imageThumbUrl: true },
  });
  if (!card) return { title: "Card not found" };

  const lowest = pickPrice(card, country);
  const price = lowest != null ? ` from ${formatMoney(lowest, info.currency)}` : "";
  const title = `${card.name} (${card.setCode} ${card.collectorNumber}) — Riftbound price in ${info.label}`;
  const description = `Compare live ${info.label} prices for ${card.name}, Riftbound ${card.setName} ${card.collectorNumber}${price}. Find the cheapest store to buy this card in ${info.label}.`;
  const image = card.imageUrl ?? card.imageThumbUrl ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: `/card/${card.slug ?? params.id}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function CardPage({ params }: { params: { id: string } }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  const fmt = (cents: number) => formatMoney(cents, info.currency);
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    include: {
      // Only the selected market's store listings (AU stores + eBay AU, or NZ stores).
      retailerPrices: { where: { country }, orderBy: { priceCents: "asc" } },
    },
  });

  if (!card) notFound();

  const lowestPrice = pickPrice(card, country);

  // Rank by DELIVERED cost (item + shipping) so a listing isn't shown as cheapest
  // just because its postage reads as $0 — the common eBay case. Shipping is the
  // listing's real figure when known, otherwise an estimate (eBay tracked letter,
  // or the store's flat single-card rate). In-stock first, then sold-out.
  const all = card.retailerPrices
    .map((p) => {
      const ship = effectiveShippingCents(p.retailer, p.shippingCents);
      return { ...p, ship, shipEstimated: p.shippingCents == null, delivered: p.priceCents + ship };
    })
    .sort((a, b) => a.delivered - b.delivered);
  const prices = all.filter((p) => p.inStock);
  const outOfStock = all.filter((p) => !p.inStock);

  // Structured data so Google can show a rich price snippet ("$X, N stores").
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name,
    category: "Trading Card",
    description: `${card.name} — Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}. Compare ${info.label} prices.`,
    ...(card.imageUrl ? { image: card.imageUrl } : {}),
    ...(prices.length && lowestPrice != null
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: info.currency,
            lowPrice: (lowestPrice / 100).toFixed(2),
            highPrice: (prices[prices.length - 1].priceCents / 100).toFixed(2),
            offerCount: prices.length,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CardViewBeacon idOrSlug={card.slug ?? card.id} />
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
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
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
              <Metric label="Cheapest price" value={lowestPrice != null ? fmt(lowestPrice) : "—"} highlight />
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

            {prices.length === 0 && outOfStock.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                <p className="font-semibold text-white">No prices found yet</p>
                <p className="mt-1">
                  We haven&apos;t matched this card to a store listing. Check back soon —
                  our price feeds refresh regularly.
                </p>
              </div>
            ) : prices.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <p className="font-semibold text-white">Currently sold out everywhere</p>
                <p className="mt-1">
                  {outOfStock.length} {info.label} {outOfStock.length === 1 ? "store has" : "stores have"} listed
                  this card but it&apos;s out of stock right now. See them below.
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
                        <span>
                          {p.ship === 0 ? "+ free post" : `+ ${fmt(p.ship)} post${p.shipEstimated ? " est." : ""}`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${i === 0 ? "text-accent" : "text-white"}`}>
                        {fmt(p.priceCents)}
                      </div>
                      <div className="text-[11px] text-slate-400">≈ {fmt(p.delivered)} delivered</div>
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

            {outOfStock.length > 0 && (
              <div className="border-t border-ink-800">
                <div className="bg-ink-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Out of stock ({outOfStock.length}) · last listed price
                </div>
                <ul className="divide-y divide-ink-800">
                  {outOfStock.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 p-4 opacity-60">
                      <div className="w-6 text-center text-slate-600">—</div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-300">{p.retailerName}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {p.condition && <span className="chip bg-ink-800 text-slate-400">{p.condition}</span>}
                          <span className="text-slate-500">● Out of stock</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-400 line-through">{fmt(p.priceCents)}</div>
                      </div>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="nofollow sponsored noopener noreferrer"
                        className="btn-ghost"
                      >
                        Check →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="border-t border-ink-800 p-3 text-center text-[11px] text-slate-600">
              Prices are collected from public store listings and may change. RiftCompare
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
