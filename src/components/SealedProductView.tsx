"use client";

import type { SealedGroup } from "@/lib/sealed-import";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { sealedImageAlt } from "@/lib/image-alt";
import { useCountry } from "./CountryProvider";
import { SealedOffers } from "./SealedQuickView";
import { SealedWatchButton } from "./SealedWatchButton";
import { MiniPicks } from "./MiniPicks";

// The market-dependent half of a sealed product's page, /sealed/<slug> (2026-11-03). The page is one CDN copy for every
// visitor (no cookie or header read on the server, like /card/[id]), so it hands this island the product's group in
// EVERY market and the island picks the visitor's (CountryProvider: the US baseline on the server, their market after
// hydration). A market that does not list the product shows the US board, in US$, and says so. The board is the quick
// view's (SealedOffers) plus Amazon as the third pinned row, after eBay and TCGplayer (owner, 2026-11-03).
export function SealedProductView({ byMarket }: { byMarket: Partial<Record<Country, SealedGroup>> }) {
  const { country } = useCountry();
  const own = byMarket[country] ?? null;
  const shownMarket: Country | null = own ? country : byMarket[DEFAULT_COUNTRY] ? DEFAULT_COUNTRY : ((Object.keys(byMarket)[0] as Country | undefined) ?? null);
  const group = shownMarket ? byMarket[shownMarket]! : null;
  if (!group || !shownMarket) return null;
  const currency = COUNTRIES[shownMarket].currency;
  const fmt = (cents: number) => formatMoney(cents, currency);
  const lowest = group.lowestPriceCents;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="card-surface flex gap-4 p-4 lg:flex-col">
        <div className="grid aspect-square w-28 shrink-0 self-start place-items-center sm:w-40 lg:w-full overflow-hidden rounded-lg border border-ink-800 bg-ink-950 p-3">
          {group.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.imageUrl} alt={sealedImageAlt(group.name)} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-sm font-bold text-slate-600">{group.productType}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {lowest != null ? (
            <>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest price in {COUNTRIES[shownMarket].place}</div>
              <div className="num text-3xl font-extrabold text-accent">{fmt(lowest)}</div>
            </>
          ) : (
            <div className="text-lg font-extrabold text-down">Currently unavailable</div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {group.storeCount} {group.storeCount === 1 ? "store" : "stores"} in stock
          </p>
          {lowest != null && group.msrpCents != null && (
            <div className="mt-2">
              {group.atMsrp ? (
                <span className="chip bg-emerald-500/15 font-semibold text-emerald-400">✓ In stock at MSRP ({fmt(group.msrpCents)})</span>
              ) : group.overMsrpPct != null && group.overMsrpPct > 0 ? (
                <span className="chip bg-red-500/15 font-semibold text-red-400">
                  {Math.round(group.overMsrpPct)}% over MSRP ({fmt(group.msrpCents)})
                </span>
              ) : null}
            </div>
          )}
          <SealedWatchButton groupKey={group.groupKey} name={group.name} market={shownMarket} className="mt-3" />
        </div>
      </div>
      <div className="card-surface min-w-0 p-4 sm:p-5">
        {!own && (
          <p className="mb-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-slate-400">
            No store we track in {COUNTRIES[country].place} lists this right now. These are {COUNTRIES[shownMarket].place} prices, in {currency}.
          </p>
        )}
        <SealedOffers key={`${group.groupKey}-${shownMarket}`} group={group} currency={currency} amazon source="sealed-page" />
        <MiniPicks setCode={group.setCode ?? ""} pageType="sealed_page" className="mt-4" />
      </div>
    </div>
  );
}
