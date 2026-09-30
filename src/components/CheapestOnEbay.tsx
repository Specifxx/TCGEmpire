import type { Country } from "@/lib/country";
import type { CheapestEbayDeal } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";
import { cardImageAlt } from "@/lib/image-alt";
import { cardThumbProps } from "@/lib/card-image-url";

// "Cheapest on eBay" (2026-09-26, "Pushing eBay clicks" in DECISIONS.md) — the
// owner's original deal feature. It sat at the top of the homepage's Today's Top
// Deals until 2026-09-30, when the owner moved it into Deal Finder ("Move
// cheapest on eBay inside of the deal finder"), where it is the whole
// ?view=ebay tab, paged (DECISIONS.md "Deal Finder: three views"). `bare` drops
// the block's own heading line for that tab, which has its h2 above it;
// `positionOffset` keeps positionInList counting across pages.
// FREE and ungated: each row is one eBay affiliate link to the cheapest tracked
// copy of that card in the visitor's market, so it is a buy path, not an ad —
// no "Ad" label, no ad-free gate, shown to paid tiers too. Honest by rule: the
// price reads "delivered" only when the seller stated postage; the gap is
// measured against the cheapest store we track (lib/arbitrage.ts
// rankCheapestOnEbay); no savings total, no percentage badge, no urgency, and
// no link to the locked Deal Finder list. eBay blue, never gold (gold marks Premium).
// The disclosure sits directly under the rows for every visitor.
export function CheapestOnEbay({
  rows,
  currency,
  country,
  pageType,
  className = "mb-4",
  bare = false,
  positionOffset = 0,
}: {
  rows: CheapestEbayDeal[];
  currency: string;
  country: Country;
  pageType: string;
  className?: string;
  bare?: boolean;
  positionOffset?: number;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Cheapest on eBay" className={`${className} rounded-xl border border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-3`}>
      {bare ? (
        <div className="mb-1 flex justify-end px-1">
          <PaidLinkTag />
        </div>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
            <h3 className="text-sm font-extrabold text-white">Cheapest on eBay</h3>
            <PaidLinkTag />
          </div>
          {/* No "today": in the UK, Singapore and the EU the eBay rows refresh
              every third day (lib/price-import.ts EBAY_ROTATING_MARKETS). */}
          <p className="mb-1 px-1 text-[11px] leading-snug text-slate-500">
            Cards where an eBay listing costs less than any store we track
          </p>
        </>
      )}
      <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {rows.map((d, i) => (
          <li key={d.cardId} className="min-w-0">
            <OutboundLink
              href={d.outboundUrl}
              retailer={d.outboundRetailer}
              country={country}
              kind="single"
              pageType={pageType}
              surface="cheapest_ebay"
              cardId={d.cardId}
              cardName={d.title}
              price={d.priceCents / 100}
              positionInList={positionOffset + i + 1}
              inStock
              className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-[#0064d2]/10"
            >
              <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
                {d.imageUrl && (
                  // Plain <img> for the same reasons as DealRow's thumbnail.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    {...cardThumbProps({ imageThumbUrl: d.imageUrl }, "32px")}
                    alt={cardImageAlt({ name: d.title })}
                    width={32}
                    height={44}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{d.title}</div>{" "}
                <div className="truncate text-[11px] text-slate-500">
                  <span className="num font-semibold text-up">{formatMoney(d.gapCents, currency)}</span> below the cheapest
                  store
                </div>
              </div>{" "}
              <div className="flex shrink-0 flex-col items-end">
                <span className="num text-sm font-bold text-accent">{formatMoney(d.priceCents, currency)}</span>{" "}
                <span className="text-[10px] text-slate-500">{d.postageKnown ? "delivered" : "+ postage"}</span>
              </div>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <AffiliateDisclosure partner="ebay" tight className="px-1" />
    </section>
  );
}
