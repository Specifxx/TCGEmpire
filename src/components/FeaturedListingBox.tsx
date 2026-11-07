"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { PaidLinkTag } from "./AffiliateDisclosure";
import { affiliateUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";
import { convertCents } from "@/lib/fx";
import { currencyOf } from "@/lib/country";
import { useCountryMaybe } from "./CountryProvider";
import { featuredLapsesAt, type FeaturedListing } from "@/lib/featured-listings";

const CHECKED_FMT = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });
// The end time in the seller's own zone (every featured listing so far is eBay
// AU), so the server and the browser print the same words.
const ENDS_FMT = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
  timeZoneName: "short",
});

/** "2d 5h", "5h 12m", "12m": what is left of an auction. */
export function timeLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * The pages that show this box are cached for hours (the homes six, the card
 * page six at the CDN), so the server's own "is it still on?" check can be
 * hours late. The browser checks again against the listing's end time and
 * removes the box the moment it passes, and keeps an auction's time left
 * current. Null before hydration, so the server HTML carries no clock.
 */
function useNow(endAt: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    const left = endAt - Date.now();
    const end = left > 0 && left < 2 ** 31 - 1 ? window.setTimeout(() => setNow(Date.now()), left) : undefined;
    return () => {
      window.clearInterval(id);
      if (end) window.clearTimeout(end);
    };
  }, [endAt]);
  return now;
}

// The featured eBay listing on its card's page (lib/featured-listings.ts).
// Labelled where it shows, set apart from the comparison below it, and honest
// about its price: the figure is eBay's at our check, with the date.
// Also in the card quick view (2026-10-19, owner), with the margin passed in
// and no image (the quick view already shows the card).
export function FeaturedListingBox({
  listing,
  imageUrl,
  className = "mt-4 sm:mt-6",
  pageType = "card_detail",
}: {
  listing: FeaturedListing;
  imageUrl?: string | null;
  className?: string;
  pageType?: string;
}) {
  const endAt = featuredLapsesAt(listing);
  const now = useNow(endAt);
  // The visitor's region (owner, 2026-11-07: "should also convert prices if I
  // switch region"). The listing's own price stays beside it: the conversion is
  // the site's reference rate (lib/fx.ts), marked ≈, never what eBay charges.
  const region = useCountryMaybe()?.country;
  const toCurrency = region ? currencyOf(region) : listing.currency;
  const converted = toCurrency !== listing.currency ? convertCents(listing.priceCents, listing.currency, toCurrency) : null;
  if (now !== null && now >= endAt) return null;
  const href = affiliateUrl(listing.url, `${listing.retailer}-featured`, pageType === "homepage" ? "/" : "/card");
  const checked = CHECKED_FMT.format(new Date(`${listing.checked}T00:00:00Z`));
  const auction = listing.format === "auction";
  const endsAt = listing.endsAt ? Date.parse(listing.endsAt) : null;
  return (
    <aside
      data-featured-listing={listing.itemId}
      aria-label="Featured listing"
      className={`${className} overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950`}
    >
      <div className="flex items-center gap-2 border-b border-gold/20 px-4 py-2 text-[11px]">
        <span className="shrink-0 whitespace-nowrap rounded bg-gold px-1.5 py-px font-extrabold uppercase tracking-wider text-ink-950">Featured listing</span>
        <PaidLinkTag className="shrink-0 whitespace-nowrap" />
        <span className="ml-auto text-right text-slate-500">Not part of the comparison</span>
      </div>
      <div className="flex items-center gap-4 px-4 py-3">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={listing.title} aria-hidden="true" className="h-24 w-auto shrink-0 rounded-md shadow-lg shadow-black/50" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-white">{listing.title}</p>
          <p className="mt-1 text-xs text-slate-400">
            {listing.condition} · {auction ? "Auction" : "Buy It Now"} · seller {listing.seller} · ships from {listing.location}
          </p>
          {auction && endsAt !== null && (
            <p className="mt-1.5 text-xs font-semibold text-slate-200">
              <span className="text-gold">Ends {ENDS_FMT.format(new Date(endsAt))}</span>
              {now !== null && <span className="num text-slate-400"> · {timeLeft(endsAt - now)} left</span>}
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            {converted !== null ? (
              <>
                <span className="num text-xl font-extrabold text-gold">≈ {formatMoney(converted, toCurrency)}</span>
                <span className="num text-sm font-semibold text-slate-300">{formatMoney(listing.priceCents, listing.currency)}</span>
              </>
            ) : (
              <span className="num text-xl font-extrabold text-gold">{formatMoney(listing.priceCents, listing.currency)}</span>
            )}
            {auction ? (
              <span className="text-[11px] text-slate-500">
                bid{listing.bids ? ` after ${listing.bids} bids` : ""} at our check on {checked}; open it for the current bid{converted !== null ? "; ≈ at our reference rate" : ""}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">on eBay at our check on {checked}; open it for today&apos;s price{converted !== null ? "; ≈ at our reference rate" : ""}</span>
            )}
          </p>
        </div>
        <OutboundLink
          href={href}
          retailer={listing.retailer}
          country="AU"
          kind="single"
          cardName={listing.title}
          price={listing.priceCents / 100}
          pageType={pageType}
          surface="featured_listing"
          className="btn-ebay hidden shrink-0 px-4 py-2 text-sm sm:inline-flex"
        >
          {auction ? "Bid on eBay" : "View on eBay"}
        </OutboundLink>
      </div>
      <div className="px-4 pb-3 sm:hidden">
        <OutboundLink
          href={href}
          retailer={listing.retailer}
          country="AU"
          kind="single"
          cardName={listing.title}
          price={listing.priceCents / 100}
          pageType={pageType}
          surface="featured_listing"
          className="btn-ebay w-full px-4 py-2 text-sm"
        >
          {auction ? "Bid on eBay" : "View on eBay"}
        </OutboundLink>
      </div>
    </aside>
  );
}
