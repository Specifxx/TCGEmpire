"use client";

import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { EbayBuyCta } from "./EbayBuyCta";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
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
export function EbayAdCarouselLive({
  listings,
  query,
  className,
  compact,
}: {
  listings: AdListing[];
  query: string;
  className?: string;
  // Tighter tiles + fewer items for space-constrained surfaces (the quick-view
  // popup) — same live data and links as the full-size carousel.
  compact?: boolean;
}) {
  const { country } = useCountry();
  const items = listings
    .filter((l) => l.country === country)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, compact ? 4 : undefined);

  if (items.length === 0) {
    return <EbayBuyCta query={query} compact={compact} className={className} />;
  }

  return (
    <div className={className}>
      <div className={`mb-1.5 flex items-center gap-2 ${compact ? "" : "mb-2"}`}>
        <EbayMark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad · live listings on eBay</span>
      </div>
      <div className={`flex overflow-x-auto pb-1 ${compact ? "gap-2" : "gap-3"}`}>
        {items.map((l) => (
          <OutboundLink
            key={l.rank}
            href={l.url}
            retailer="ebay"
            country={country}
            className={`flex shrink-0 flex-col rounded-lg border border-ink-700 bg-ink-900 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800 ${compact ? "w-20 p-1.5" : "w-32 p-2"}`}
          >
            <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
              {l.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt={`${l.title} — live eBay listing`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
            </div>
            {!compact && <div className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-slate-300">{truncate(l.title, 60)}</div>}
            <div className={`num mt-1 font-extrabold text-white ${compact ? "text-xs" : "text-sm"}`}>{formatMoney(l.priceCents, l.currency)}</div>
            {!compact && l.shippingCents === 0 && <div className="text-[10px] text-brand-400">Free shipping</div>}
          </OutboundLink>
        ))}
      </div>
      {/* Directly under the listings, in BOTH the full card page and the compact
          quick-view popup — EPN specifically flagged the popup as carrying eBay
          affiliate links with no disclosure. */}
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
