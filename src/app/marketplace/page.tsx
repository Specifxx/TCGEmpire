import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { MarketplaceBuyButton } from "@/components/MarketplaceBuyButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace — buy & sell Riftbound cards",
  description:
    "The RiftCompare Marketplace: buy Riftbound cards directly from verified sellers, with prices listed right in the comparison. Coming soon.",
  // Coming-soon page — keep it out of the index until launch.
  robots: { index: false, follow: true },
};

export default async function MarketplacePage() {
  const [user, country] = [await getCurrentUser(), getCountry()];
  const info = COUNTRIES[country];

  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "ACTIVE", quantity: { gt: 0 }, country },
    orderBy: { priceCents: "asc" },
    take: 48,
    include: {
      card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true, variant: true, isPromo: true, rarity: true } },
      seller: { select: { displayName: true, sellerProfile: { select: { shopName: true, shippingNote: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Coming soon banner */}
      <div className="card-surface relative overflow-hidden border-brand-500/30 p-6 text-center sm:p-8">
        <span className="chip mb-3 inline-flex bg-brand-500/15 font-bold uppercase tracking-wide text-brand-300">
          🚧 Coming soon
        </span>
        <h1 className="font-display text-3xl font-extrabold text-white">RiftCompare Marketplace</h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-300">
          Buy Riftbound cards directly from <strong>verified sellers</strong> — their listings show up right in the
          price comparison, so you always see the cheapest option, ours included. We&apos;re building it now; checkout
          is in <strong>test mode</strong> while we finish secure payments and seller payouts.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {user?.isVerifiedSeller ? (
            <Link href="/marketplace/sell" className="btn-primary">Open your seller dashboard →</Link>
          ) : (
            <Link href="/contact" className="btn-ghost text-sm">Want to sell? Apply to be a verified seller</Link>
          )}
        </div>
      </div>

      {/* Live listings (beta) */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-xl font-extrabold text-white">Listings in {info.place}</h2>
          <span className="text-xs text-slate-500">{listings.length} live</span>
        </div>

        {listings.length === 0 ? (
          <div className="card-surface grid place-items-center p-12 text-center text-slate-400">
            <div>
              <p className="text-lg font-semibold text-white">No listings yet</p>
              <p className="mt-1 text-sm">Verified sellers&apos; cards will appear here — and in every card&apos;s price comparison.</p>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <li key={l.id} className="card-surface flex flex-col overflow-hidden">
                <Link href={cardHref(l.card)} className="flex items-center gap-2 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.card.imageThumbUrl ? (
                    <img src={l.card.imageThumbUrl} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-16 w-12 shrink-0 rounded bg-ink-800" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{cardDisplayName(l.card.name, l.card)}</div>
                    <div className="text-[11px] text-slate-500">{l.card.setCode} {l.card.collectorNumber} · {l.condition}{l.isFoil ? " · Foil" : ""}</div>
                  </div>
                </Link>
                <div className="mt-auto border-t border-ink-800 p-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-lg font-extrabold text-accent">{formatMoney(l.priceCents, l.currency)}</span>
                    <span className="truncate text-[11px] text-slate-500">{l.seller.sellerProfile?.shopName ?? l.seller.displayName}</span>
                  </div>
                  {user ? (
                    <MarketplaceBuyButton listingId={l.id} />
                  ) : (
                    <Link href="/login?next=/marketplace" className="btn-ghost block w-full text-center text-xs">Sign in to buy</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-center text-[11px] text-slate-600">
          Test mode: purchases settle against a demo wallet, not real money. Real payments &amp; seller payouts are coming.
        </p>
      </section>
    </div>
  );
}
