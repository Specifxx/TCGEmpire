import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedListing, shareUrlForListing, listingPostText } from "@/lib/share";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { CONDITIONS } from "@/lib/constants";
import { CopyPostButton } from "@/components/CopyPostButton";

export const dynamic = "force-dynamic";

// Noindex for the same reason as /c/<token>: the token is the authorisation, so
// a crawler must not turn a link handed to a Discord channel into a search
// result that outlives it. The listing is discoverable through /marketplace and
// the card page, both of which ARE indexed — nothing is lost.
export const metadata: Metadata = {
  title: "Marketplace listing",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedListingPage({ params }: { params: { token: string } }) {
  const l = await getSharedListing(params.token);
  if (!l) notFound();

  const info = COUNTRIES[l.country as Country];
  const url = shareUrlForListing(params.token);
  const available = l.status === "ACTIVE" && l.quantity > 0;
  const saving = l.marketCents != null && l.marketCents > l.priceCents ? l.marketCents - l.priceCents : null;
  const savingPct = saving != null && l.marketCents ? Math.round((saving / l.marketCents) * 100) : null;

  const post = listingPostText({
    cardName: cardDisplayName(l.card.name, l.card),
    cardSetCode: l.card.setCode,
    cardCollectorNumber: l.card.collectorNumber,
    condition: CONDITIONS[l.condition]?.full ?? l.condition,
    isFoil: l.isFoil,
    priceCents: l.priceCents,
    quantity: l.quantity,
    currency: l.currency,
    marketCents: l.marketCents,
    url,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-400">
        RiftCompare Marketplace · {info?.flag} {info?.place ?? l.country}
      </p>

      <div className="flex flex-col gap-5 rounded-xl border border-ink-800 bg-ink-950/60 p-5 sm:flex-row">
        <Link href={cardHref(l.card)} className="shrink-0 self-center sm:self-start">
          {l.card.imageUrl || l.card.imageThumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={l.card.imageUrl ?? l.card.imageThumbUrl ?? ""}
              alt={l.card.name}
              width={180}
              height={252}
              className="w-40 rounded-lg object-cover shadow-lg"
            />
          ) : null}
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-white">{cardDisplayName(l.card.name, l.card)}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {l.card.setCode} · {l.card.collectorNumber} · {l.card.setName}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-4xl font-extrabold text-white">{formatMoney(l.priceCents, l.currency)}</span>
            <span className="chip bg-ink-800 text-[11px] font-bold uppercase tracking-wide text-slate-300">
              {CONDITIONS[l.condition]?.full ?? l.condition}
            </span>
            {l.isFoil && (
              <span className="chip bg-gold/20 text-[11px] font-bold uppercase tracking-wide text-gold">Foil</span>
            )}
          </div>

          {savingPct != null && savingPct > 0 && l.marketCents != null && (
            <p className="mt-2 text-sm font-semibold text-brand-400">
              {savingPct}% under the cheapest store price{" "}
              <span className="font-normal text-slate-500">({formatMoney(l.marketCents, l.currency)})</span>
            </p>
          )}

          <p className="mt-3 text-sm text-slate-400">
            Sold by <strong className="text-slate-200">{l.shopName ?? l.sellerName}</strong>
            {l.quantity > 1 && available && <> · {l.quantity} available</>}
          </p>

          {/* A share link outlives the listing's availability by design — see
              getSharedListing's note on why a sold-out listing renders instead
              of 404ing. The state has to be unmissable, though: somebody
              following this from a chat message a week later must not think
              they can still buy it. */}
          {available ? (
            <Link href={`/marketplace?cardId=${l.card.id}`} className="btn-primary mt-4 inline-flex">
              View on the marketplace →
            </Link>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-semibold text-slate-300">
                {l.status === "SOLD_OUT" || l.quantity === 0 ? "This one has sold." : "This listing is paused."}
              </p>
              <Link href={cardHref(l.card)} className="btn-primary inline-flex">
                See every price for this card →
              </Link>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-ink-800 bg-ink-950/60 p-5">
        <h2 className="font-bold text-white">Share this listing</h2>
        <p className="mt-1 text-sm text-slate-400">
          Ready to paste into a Discord or Facebook trading group — including how it compares to store prices.
        </p>
        <CopyPostButton text={post} label="Copy post" className="mt-3" />
      </section>

      <p className="text-center text-xs text-slate-600">
        Every marketplace purchase is covered by{" "}
        <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">
          RiftCompare buyer protection
        </Link>
        .
      </p>
    </div>
  );
}
