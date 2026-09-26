"use client";

import { OutboundLink } from "./OutboundLink";
import { ebayLabel, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";

// The primary singles buy-path. eBay is the one marketplace that ALWAYS has
// Riftbound singles inventory in every market (new, used & graded) AND pays us an
// EPN commission on the click-through, so — unlike the display banner in EbayAd —
// this is a first-class "buy this card" action, shown to everyone (Premium
// included) and NOT labelled as an ad. It's affiliate-tagged (ebayAffiliateUrl adds
// the mkevt/campid tracking params) and click-tracked via OutboundLink. Region-aware
// domain.
//
// This is deliberately additive to the honest local price comparison — it never
// replaces or outranks a genuinely-cheaper local listing; it's the always-present
// "widest selection" option beside it, and the funnel for the cards no local store
// stocks (which is most of the long tail).
//
// LABELS AND COPY (2026-09-26, "Pushing eBay clicks" in DECISIONS.md). The market
// label is lib/affiliate.ts's ebayLabel(), no longer a private map: the private
// one called Singapore's link "eBay Singapore" although the click lands on
// ebay.com (Singapore has no EPN program — see the SG reroute there). The generic
// sub-line lost "The widest selection anywhere", a superlative nobody measured,
// and the card sub-line says "Search …" because we do not know that listings
// exist for every card. A PRE-RELEASE card gets its own copy: nothing from an
// unreleased set ships yet, so the line says to check the seller's dispatch date
// rather than promising "new, used & graded" copies.
//
// MEASURED BY PLACEMENT. `source` reaches EPN's customid and `pageType` /
// `surface` reach buy_click, so the QuickView, the card panel, /browse and the
// set pages no longer all report as one "card-cta".

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// eBay's multicolour wordmark, inline.
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

export function EbayBuyCta({
  query,
  heading,
  sub,
  compact,
  className,
  bare = false,
  preRelease = false,
  freeText = false,
  source,
  pageType,
  surface = "ebay_cta",
}: {
  // A card name → "Buy <name> on eBay". Omit for the generic "shop all singles" CTA.
  query?: string;
  // Optional heading override (used by the /singles hub).
  heading?: string;
  // Optional sub-line override.
  sub?: string;
  // Tighter layout for the QuickView modal.
  compact?: boolean;
  className?: string;
  // Suppress the built-in disclosure because a PARENT renders one covering this
  // (EbayCardPanelLive; QuickView via EbayAdCarouselLive's fallback). Never set
  // this without one above - AffiliateDisclosure's rule is that if an affiliate
  // link renders, its disclosure renders.
  bare?: boolean;
  // The card belongs to a set that has not released: search copy, never "buy".
  preRelease?: boolean;
  // `query` is something a visitor typed (the /browse search), not a card name:
  // "Search eBay for “q”", never "Buy q on eBay".
  freeText?: boolean;
  // EPN customid segment. Defaults keep the historic ids ("card-cta" /
  // "shop-all") so older reports still line up.
  source?: string;
  pageType?: string;
  surface?: "ebay_cta" | "ebay_fallback" | "ebay_panel" | "ebay_search";
}) {
  const { country } = useCountry();
  const label = ebayLabel(country);
  const nkw = query ? riftboundEbayQuery(query) : "Riftbound cards";
  const href = ebaySearchUrl(country, nkw, source ?? (query ? "card-cta" : "shop-all"));
  const short = query ? truncate(query, 32) : "";
  const title =
    heading ??
    (!query
      ? "Shop Riftbound singles on eBay"
      : preRelease || freeText
        ? `Search ${label} for ${freeText ? `“${short}”` : short}`
        : `Buy ${short} on eBay`);
  const line =
    sub ??
    (!query
      ? `Riftbound singles from eBay sellers on ${label}.`
      : preRelease
        ? "This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing."
        : freeText
          ? `Listings from eBay sellers on ${label}.`
          : `Search new, used & graded listings on ${label}.`);

  return (
    <div className={className}>
      <OutboundLink
        href={href}
        retailer="ebay"
        country={country}
        kind="single"
        cardName={query && !freeText ? query : undefined}
        pageType={pageType}
        surface={surface}
        className={`group relative flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-[#0064d2]/40 bg-gradient-to-r from-[#0064d2]/15 via-ink-900 to-ink-900 transition-colors hover:border-[#0064d2]/70 hover:from-[#0064d2]/25 ${compact ? "p-3" : "p-4 sm:p-5"}`}
      >
        {/* flex-wrap + basis-56 (2026-09-23): flex-1 alone is a 0 basis, so the
            row never wrapped and the copy took all the squeeze beside the 147px
            button (67px wide, 276px tall box at 344). Below 14rem the button now
            wraps under the copy instead. */}
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex items-center gap-2">
            <EbayMark className={compact ? "text-base" : "text-lg"} />
            <span className={`font-extrabold text-white ${compact ? "text-sm" : "text-base sm:text-lg"}`}>{title}</span>
          </div>
          <p className={`mt-0.5 text-slate-400 ${compact ? "text-[11px]" : "text-xs sm:text-sm"}`}>{line}</p>
        </div>
        {/* text-[#ffffff], not text-white (2026-09-23): the fill is a fixed brand
            hex and white-on-eBay-blue is the brand's rule, not the theme's. The
            themed token is near-black in light: 3.44:1 here, against 5.59:1. */}
        <span
          className={`shrink-0 rounded-lg bg-[#0064d2] font-bold text-[#ffffff] transition-colors group-hover:bg-[#0079e6] ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
        >
          {preRelease || freeText ? "Search eBay →" : "Shop on eBay →"}
        </span>
      </OutboundLink>
      {/* Immediately beneath the CTA. This component is also the fallback the
          eBay carousel renders when no cached listings exist, so it discloses on
          its own unless a parent that discloses renders it `bare` (the card
          panel, and QuickView through the carousel's fallback). */}
      {!bare && <AffiliateDisclosure partner="ebay" tight />}
    </div>
  );
}
