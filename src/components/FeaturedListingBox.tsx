import { OutboundLink } from "./OutboundLink";
import { PaidLinkTag } from "./AffiliateDisclosure";
import { affiliateUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";
import type { FeaturedListing } from "@/lib/featured-listings";

const CHECKED_FMT = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });

// The featured eBay listing on its card's page (lib/featured-listings.ts).
// Labelled where it shows, set apart from the comparison below it, and honest
// about its price: the figure is eBay's at our check, with the date.
export function FeaturedListingBox({ listing, imageUrl }: { listing: FeaturedListing; imageUrl?: string | null }) {
  const href = affiliateUrl(listing.url, `${listing.retailer}-featured`, "/card");
  const checked = CHECKED_FMT.format(new Date(`${listing.checked}T00:00:00Z`));
  return (
    <aside
      data-featured-listing={listing.itemId}
      aria-label="Featured listing"
      className="mt-4 overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 sm:mt-6"
    >
      <div className="flex items-center gap-2 border-b border-gold/20 px-4 py-2 text-[11px]">
        <span className="shrink-0 whitespace-nowrap rounded bg-gold px-1.5 py-px font-extrabold uppercase tracking-wider text-ink-950">Featured listing</span>
        <PaidLinkTag className="shrink-0 whitespace-nowrap" />
        <span className="ml-auto text-right text-slate-500">Not part of the price comparison below</span>
      </div>
      <div className="flex items-center gap-4 px-4 py-3">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" aria-hidden="true" className="h-24 w-auto shrink-0 rounded-md shadow-lg shadow-black/50" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-white">{listing.title}</p>
          <p className="mt-1 text-xs text-slate-400">
            {listing.condition} · Buy It Now · seller {listing.seller} · ships from {listing.location}
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-xl font-extrabold text-gold">{formatMoney(listing.priceCents, listing.currency)}</span>
            <span className="text-[11px] text-slate-500">on eBay at our check on {checked}; open it for today&apos;s price</span>
          </p>
        </div>
        <OutboundLink
          href={href}
          retailer={listing.retailer}
          country="AU"
          kind="single"
          cardName={listing.title}
          price={listing.priceCents / 100}
          pageType="card_detail"
          surface="featured_listing"
          className="btn-ebay hidden shrink-0 px-4 py-2 text-sm sm:inline-flex"
        >
          View on eBay
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
          pageType="card_detail"
          surface="featured_listing"
          className="btn-ebay w-full px-4 py-2 text-sm"
        >
          View on eBay
        </OutboundLink>
      </div>
    </aside>
  );
}
