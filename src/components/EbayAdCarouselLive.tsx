"use client";

import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { EbayBuyCta } from "./EbayBuyCta";
import { formatMoney } from "@/lib/format";

export interface AdListing {
  country: string;
  rank: number;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  title: string;
  imageUrl: string | null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// eBay's multicolour wordmark, inline (matches EbayBuyCta's).
function EbayMark({ className }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? ""}`} aria-label="eBay">
      <span className="text-[#e53238]">e</span>
      <span className="text-[#0064d2]">b</span>
      <span className="text-[#f5af02]">a</span>
      <span className="text-[#86b817]">y</span>
    </span>
  );
}

// A native-style "eBay Ad" carousel — real current listings (image, title,
// price, free-shipping badge), not a plain search link. Populated for free as
// a side effect of the daily per-card eBay Browse API call (see
// searchEbayLowest's captureAdListings param + EbayAdListing in schema.prisma),
// so it costs no extra API quota. Falls back to the reliable generic "search
// eBay" CTA when this market has no cached listings yet (new card, or the
// daily import hasn't reached it) — the eBay buy-path must always be present.
export function EbayAdCarouselLive({ listings, query, className }: { listings: AdListing[]; query: string; className?: string }) {
  const { country } = useCountry();
  const items = listings.filter((l) => l.country === country).sort((a, b) => a.rank - b.rank);

  if (items.length === 0) {
    return <EbayBuyCta query={query} className={className} />;
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <EbayMark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad · live listings on eBay</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((l) => (
          <OutboundLink
            key={l.rank}
            href={l.url}
            retailer="ebay"
            country={country}
            className="flex w-32 shrink-0 flex-col rounded-lg border border-ink-700 bg-ink-900 p-2 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800"
          >
            <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
              {l.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-slate-300">{truncate(l.title, 60)}</div>
            <div className="num mt-1 text-sm font-extrabold text-white">{formatMoney(l.priceCents, l.currency)}</div>
            {l.shippingCents === 0 && <div className="text-[10px] text-brand-400">Free shipping</div>}
          </OutboundLink>
        ))}
      </div>
    </div>
  );
}
