import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedCollection, shareUrlForCollection, collectionPostText } from "@/lib/share";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { CopyPostButton } from "@/components/CopyPostButton";
import { CONDITIONS } from "@/lib/constants";

// Reads the visitor's own market (a shared binder should be valued in the
// currency of whoever OPENED the link, not whoever posted it), which makes the
// route dynamic anyway.
export const dynamic = "force-dynamic";

// NEVER INDEXED, and this is not negotiable. The token in the URL is a
// capability — holding it is the whole authorisation check — so letting a
// crawler index the page would publish a link that was meant to be handed to
// specific people, and would keep serving it from a search result long after the
// owner rotated the token. `nofollow` too: every card link on the page is a
// normal indexable URL reachable elsewhere, so there is nothing here a crawler
// needs to follow, and following would associate this token with those pages.
export const metadata: Metadata = {
  title: "Shared collection",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedCollectionPage({ params }: { params: { token: string } }) {
  const country = getCountry();
  const shared = await getSharedCollection(params.token, country);
  // 404 for an unknown OR rotated token — never a "this link expired" page,
  // which would confirm the token had once been real.
  if (!shared) notFound();

  const info = COUNTRIES[country];
  const url = shareUrlForCollection(params.token);
  const priced = shared.holdings.filter((h) => h.unitCents != null).length;
  const post = collectionPostText({
    ownerName: shared.ownerName,
    distinctCards: shared.distinctCards,
    totalCopies: shared.totalCopies,
    totalCents: shared.totalCents,
    currency: shared.currency,
    top: shared.holdings.slice(0, 3).map((h) => ({ name: h.card.name, card: h.card, unitCents: h.unitCents })),
    url,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Shared collection</p>
        <h1 className="text-3xl font-extrabold text-white">{shared.ownerName}&apos;s Riftbound collection</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>
            <strong className="text-white">{shared.distinctCards}</strong> card{shared.distinctCards === 1 ? "" : "s"}
            {shared.totalCopies !== shared.distinctCards && <> · {shared.totalCopies} copies</>}
          </span>
          <span>
            Valued at <strong className="num text-brand-400">{formatMoney(shared.totalCents, shared.currency)}</strong> in{" "}
            {info.flag} {info.place}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Valued at today&apos;s cheapest in-stock store price in your market, adjusted for condition.
          {priced < shared.holdings.length && (
            <> {shared.holdings.length - priced} card{shared.holdings.length - priced === 1 ? " has" : "s have"} no live price and count as zero.</>
          )}
        </p>
        <CopyPostButton text={post} label="Copy share post" />
      </header>

      {shared.holdings.length === 0 ? (
        <p className="rounded-xl border border-ink-800 bg-ink-950/60 p-6 text-center text-slate-400">
          This collection is empty right now.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60">
          {shared.holdings.map((h, i) => (
            <li key={`${h.card.id}-${h.condition}-${h.isFoil}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <Link href={cardHref(h.card)} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand-300">
                {h.card.imageThumbUrl && (
                  // Empty alt + aria-hidden: the card name/set/collector text right
                  // beside it already describes this thumbnail — same convention as
                  // market/records/page.tsx's CardCell and UserMenu.tsx's avatar.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.card.imageThumbUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-12 w-9 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {cardDisplayName(h.card.name, h.card)}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {h.card.setCode} · {h.card.collectorNumber} · {CONDITIONS[h.condition]?.label ?? h.condition}
                    {h.isFoil && " · Foil"}
                    {h.quantity > 1 && ` · ×${h.quantity}`}
                  </span>
                </span>
              </Link>
              <div className="shrink-0 text-right">
                {h.unitCents != null ? (
                  <>
                    <div className="num text-sm font-extrabold text-white">
                      {formatMoney(h.unitCents * h.quantity, shared.currency)}
                    </div>
                    {h.quantity > 1 && (
                      <div className="text-[11px] text-slate-500">{formatMoney(h.unitCents, shared.currency)} each</div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-slate-600">No price yet</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-ink-800 bg-ink-950/60 p-5 text-center">
        <h2 className="font-bold text-white">Track your own collection</h2>
        <p className="mt-1 text-sm text-slate-400">
          Add your cards once and RiftCompare values them daily against live prices from every store we track.
        </p>
        <Link href="/portfolio" className="btn-primary mt-3 inline-flex">
          Start your collection
        </Link>
      </section>
    </div>
  );
}
