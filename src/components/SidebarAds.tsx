"use client";

import { EbayAd } from "./EbayAd";
import { TcgplayerAd } from "./TcgplayerAd";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";

// Flanking skyscraper ads (eBay left, TCGplayer right) in the gutters either
// side of the centred content column. `container-app` caps content at 1400px
// (see globals.css), so half of that is 700px from viewport centre — the
// calc()s below sit each 160px-wide skyscraper just outside that, with a 24px
// gap, computed from viewport centre so they never depend on the container's
// own box (a plain sibling of it, not a child — see layout.tsx).
//
// Gated to `min-[1800px]` (a one-off breakpoint, not one of Tailwind's named
// ones): 1400 content + 2 × (160 ad + 24 gap) + a safety margin needs real
// width to avoid ever overlapping content, so this is a bonus placement for
// wide/ultrawide monitors only — most visitors (laptop, tablet, phone) never
// see it, which is the point; it should never compete for space with anything
// in the normal, narrower layout.
//
// `position: fixed` + vertical centring (not scrolling with the page) is the
// standard, highest-performing skyscraper treatment — safe here specifically
// BECAUSE the gutter is empty at this breakpoint (verified: no other
// fixed/decorative element reaches out that far), so there's nothing for it to
// cover. z-30 stays under the sticky nav (z-40) and every overlay/modal (60+).
export function SidebarAds() {
  const { country } = useCountry();
  const adFree = usePremium();
  if (adFree) return null;
  return (
    <>
      <div
        className="fixed top-1/2 z-30 hidden -translate-y-1/2 min-[1800px]:block"
        style={{ left: "calc(50vw - 884px)" }}
      >
        <EbayAd size="skyscraper" country={country} />
      </div>
      <div
        className="fixed top-1/2 z-30 hidden -translate-y-1/2 min-[1800px]:block"
        style={{ left: "calc(50vw + 724px)" }}
      >
        <TcgplayerAd size="skyscraper" country={country} />
      </div>
    </>
  );
}
