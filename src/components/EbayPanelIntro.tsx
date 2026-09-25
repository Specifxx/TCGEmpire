"use client";

import { usePremium } from "./PremiumProvider";

// The line under "Also available on eBay" on a card page. A client island only
// so it can follow the viewer's ad-free state: for Plus and Premium the
// Listings tab is a plain link to the card's eBay listings, not the live
// listings carousel (an ad — EbayAdCarouselLive), so describing "live raw
// listings" to them described something they are not shown (QA, 2026-09-25).
export function EbayPanelIntro() {
  const adFree = usePremium();
  return (
    <p className="mt-1 text-xs text-slate-500">
      {adFree ? (
        <>
          Search this card&apos;s eBay listings, including used and international sellers — a useful cross-check on the store
          prices above, and often the only source for older printings. Graded slabs and live auctions each get their own
          tab, so neither distorts the raw price.
        </>
      ) : (
        <>
          Live raw listings, including used and international sellers — a useful cross-check on the store prices above, and
          often the only source for older printings. Graded slabs and live auctions each get their own tab, so neither
          distorts the raw price.
        </>
      )}
    </p>
  );
}
