import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Deal } from "@/lib/top-deals";
import { CtaZone } from "./PremiumPageClient";

// /premium's live deals teaser (2026-10-23, DECISIONS.md "/premium, rebuilt to
// convert, honestly"). The top three below-market cards from getCachedTopDeals
// (the homepage's own feed, already cached at its sources; read once by the
// page, never wrapped) — the same three the Deal Finder gives everyone free.
//
// THE LOCKED ROWS ARE NOT DATA. The rest of the list is withheld server-side,
// as on the Deal Finder: the blurred rows under the three are empty
// placeholder shapes, aria-hidden, so nothing gated reaches the HTML. The
// count on the overlay is the real total (savingsVsMarketTotal).
//
// HONEST PRICE LABEL. The feed's price is the cheapest LISTING (a store's item
// price, or an eBay listing with its stated postage when known), not a
// delivered total, so it is labelled that way: "+ postage" unless the row
// already includes it. Delivered totals are what Best Basket computes, below.
//
// Members never see this: /premium shows them their account card and the
// dashboard / Deal Finder links instead.

export function PremiumDealsTeaser({
  deals,
  total,
  currency,
}: {
  deals: Deal[];
  total: number;
  currency: string;
}) {
  if (!deals.length) return null;
  const fmt = (c: number) => formatMoney(c, currency);
  const locked = Math.max(0, total - deals.length);
  return (
    <section aria-labelledby="premium-deals" className="mx-auto mt-10 max-w-2xl" data-premium-deals-teaser>
      <h2 id="premium-deals" className="text-center font-display text-xl font-extrabold text-white sm:text-2xl">
        {total > 0 ? `${total.toLocaleString()} cards are below market right now` : "Below market right now"}
      </h2>
      <p className="mt-1 text-center text-sm text-slate-400">Live from today&apos;s prices, against TCGplayer&apos;s market price. The top 3 are free for everyone.</p>
      <ol className="mt-4 space-y-2">
        {deals.map((d, i) => (
          <li key={`${d.title}-${i}`} className="card-surface flex items-center gap-3 rounded-xl border border-ink-700 p-2.5 sm:p-3">
            <div className="h-[70px] w-[50px] shrink-0 overflow-hidden rounded-md bg-ink-800">
              {d.imageUrl && (
                // Plain <img>, same reason as TodaysTopDeals: deal images come from hosts next/image has no entry for.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.imageUrl} alt={d.title} width={50} height={70} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {d.href ? (
                <Link href={d.href} className="block truncate text-sm font-bold text-white hover:underline">
                  {d.title}
                </Link>
              ) : (
                <span className="block truncate text-sm font-bold text-white">{d.title}</span>
              )}
              <p className="truncate text-xs text-slate-400">
                {d.storeName ? <>at {d.storeName}</> : d.subtitle}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-base font-extrabold text-white">
                {fmt(d.priceCents)}
                {!d.postageIncluded && <span className="ml-1 text-[10px] font-semibold text-slate-400">+ postage</span>}
              </div>
              {d.pctLabel != null && d.refCents != null && (
                <div className="text-[11px] font-semibold text-up">
                  {d.pctLabel}% below {fmt(d.refCents)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {locked > 0 ? (
        <div className="relative mt-2" data-premium-deals-locked>
          {/* Placeholder shapes only, never data (see the header). */}
          <div aria-hidden className="space-y-2 select-none blur-[3px]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-surface flex h-[70px] items-center gap-3 rounded-xl border border-ink-700 p-3 opacity-70">
                <div className="h-[46px] w-[33px] rounded bg-ink-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-2/3 rounded bg-ink-700" />
                  <div className="h-2 w-1/3 rounded bg-ink-700" />
                </div>
                <div className="h-3 w-12 rounded bg-up/30" />
              </div>
            ))}
          </div>
          <CtaZone location="deals-teaser" className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <a href="#top-pricing" className="btn-buy px-5 py-2.5 text-sm">
              See all {total.toLocaleString()} deals with Premium&nbsp;→
            </a>
            <span className="text-[11px] font-semibold text-slate-300">{locked.toLocaleString()} more below market, filtered to the cards you watch</span>
          </CtaZone>
        </div>
      ) : null}
    </section>
  );
}
