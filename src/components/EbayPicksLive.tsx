"use client";

import { OutboundLink } from "./OutboundLink";
import { EbayBuyCta } from "./EbayBuyCta";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";

export interface PickListing {
  country: string;
  cardId: string;
  /** OUR card name, not the eBay listing title — seller titles are keyword soup
   *  ("RIFTBOUND VENDETTA NASUS SIGNATURE PSA 10 RARE NM!!") and unreadable at
   *  tile width. The thumbnail and price come from the listing; the label doesn't. */
  cardName: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  title: string;
}

// eBay's multicolour wordmark, inline (matches EbayBuyCta / EbayAdCarouselLive).
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

/** Caps the grid at one tidy row everywhere: 6 at lg, 3 at sm, scrolling below. */
export const MAX_TILES = 6;

/**
 * Pick the tiles to show: this market only, ONE per card (the cheapest), cheapest
 * first, capped. One-per-card is the point — without it a card with several
 * captured listings would fill the strip with the same single at four prices,
 * which reads as a broken widget rather than a shopping surface.
 *
 * Exported and pure so tests/ebay-picks.test.ts can exercise it without React.
 */
export function selectPicks(listings: PickListing[], country: string, max = MAX_TILES): PickListing[] {
  const cheapestPerCard = new Map<string, PickListing>();
  for (const l of listings) {
    if (l.country !== country) continue;
    const held = cheapestPerCard.get(l.cardId);
    if (!held || l.priceCents < held.priceCents) cheapestPerCard.set(l.cardId, l);
  }
  return [...cheapestPerCard.values()].sort((a, b) => a.priceCents - b.priceCents).slice(0, max);
}

/**
 * Client half of the tailored eBay unit: real current listings for the cards this
 * page is actually about, one tile per card so the strip shows VARIETY rather
 * than four copies of the same single.
 *
 * Responsive by shape, not by hiding things — the same tiles are a snap-scrolling
 * strip on phones (thumb-friendly, no wasted vertical space on a page people are
 * scrolling anyway) and a grid from `sm:` up. Nothing is duplicated per breakpoint,
 * so there's one DOM and no double-counted impressions.
 */
export function EbayPicksLive({
  listings,
  fallbackQuery,
  heading = "Chase cards on eBay right now",
  className,
}: {
  listings: PickListing[];
  fallbackQuery: string;
  heading?: string;
  className?: string;
}) {
  const { country } = useCountry();
  const adFree = usePremium();
  // Premium is ad-free everywhere else on the site; this is an ad.
  if (adFree) return null;

  const items = selectPicks(listings, country, MAX_TILES);

  // The eBay buy-path must always be present: when this market has no fresh
  // cached listings (new set, or the daily import hasn't reached it), fall back
  // to the reliable generic search CTA rather than rendering nothing.
  if (items.length === 0) {
    return <EbayBuyCta query={fallbackQuery} className={className} />;
  }

  return (
    <section className={className} aria-label={heading}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <EbayMark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Ad · live listings on eBay
        </span>
        <span className="text-sm font-bold text-white">{heading}</span>
      </div>

      {/* Mobile: a snap-scrolling strip with a hinted next tile. From sm: a plain
          grid — overflow-visible so the scroll affordance doesn't linger. */}
      <ul
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6"
      >
        {items.map((l) => (
          <li key={l.cardId} className="w-[38vw] max-w-[150px] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <OutboundLink
              href={l.url}
              retailer="ebay_picks"
              country={country}
              className="flex h-full flex-col rounded-lg border border-ink-700 bg-ink-900 p-2 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800"
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
                {l.imageUrl && (
                  // Arbitrary eBay CDN hosts, so a plain lazy <img> rather than
                  // next/image (every host would need allow-listing). The fixed
                  // aspect box above reserves the space, so CLS stays at zero.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.imageUrl}
                    alt={`${l.cardName} — live eBay listing`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-slate-200">
                {l.cardName}
              </div>
              <div className="num mt-auto pt-1 text-sm font-extrabold text-white">
                {formatMoney(l.priceCents, l.currency)}
              </div>
              {l.shippingCents === 0 && <div className="text-[10px] text-brand-400">Free shipping</div>}
            </OutboundLink>
          </li>
        ))}
      </ul>

      {/* Directly beneath the listings. EPN has flagged surfaces carrying eBay
          affiliate links with no disclosure, so no path may render these tiles
          without this line under them. */}
      <AffiliateDisclosure partner="ebay" tight />
    </section>
  );
}
