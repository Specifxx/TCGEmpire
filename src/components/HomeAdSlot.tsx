"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { BANNER_H, InlineAds } from "./InlineAds";

// The home pages' banner-position test (coordinator, 2026-11-18). EPN's eBay clicks from Rift fell about 45% per visitor from 15 Nov, the
// day the big banners moved to the top of the home pages (#443); a clean split replaces a blind revert. Half the visitors see the pair
// first (arm "top", under the hero), half see it below the chase cards and Today's Top Deals (arm "low"). The arm is drawn in the browser
// (HOME_AB_BOOT_SCRIPT in the layout head, kept in localStorage), so the page stays one CDN copy and never reads a cookie or header; CSS
// hides the other slot from the first paint, so nothing shifts. Each arm's eBay and TCGplayer links carry it: EPN customid `…-inlinetop_…`
// or `…-inlinelow_…`, buy_click pageType `homepage-top` / `homepage-low`, and a `home_ab` event per page view for the visitors per arm.
// Read: clicks per visitor per arm; keep the arm that earns more. Nothing else on the page changes between the arms.

export function HomeAdSlot({ arm }: { arm: "top" | "low" }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const a = document.documentElement.getAttribute("data-rc-ab") === "low" ? "low" : "top";
    setActive(a);
    if (a === arm) track("home_ab", { arm: a });
  }, [arm]);
  return (
    <div data-ab-slot={arm}>
      {active === arm ? (
        <InlineAds pageType="homepage" arm={arm} />
      ) : active === null ? (
        <div className="grid gap-3 lg:grid-cols-2" aria-hidden="true" data-ad-placement="">
          <div style={{ height: BANNER_H }} />
          <div style={{ height: BANNER_H }} />
        </div>
      ) : null}
    </div>
  );
}
