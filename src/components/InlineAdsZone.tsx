"use client";

import { usePathname } from "next/navigation";
import { InlineAds } from "./InlineAds";
import { usePremium } from "./PremiumProvider";
import { adBlockAllowed, inlineAdsAllowed } from "@/lib/ad-routes";

// The one ad block on pages that do not place it themselves (owner, 2026-11-13: one subtle block per page; the footer leaderboard pair
// is gone). InlineAds carries its own "Ad" label and affiliate line, so nothing else renders here. Policy, trust, arcade and plans
// routes get nothing; ad-free members get nothing. The id is load-bearing: FeedbackWidget hides its launcher while this zone is on
// screen so the launcher never covers an ad (docs/adsense-remediation.md).
export function InlineAdsZone() {
  const pathname = usePathname();
  const adFree = usePremium();
  if (adFree || !adBlockAllowed(pathname) || !inlineAdsAllowed(pathname)) return null;
  return (
    <div id="rc-ad-zone" data-ad-placement="" className="container-app pb-8">
      <InlineAds pageType={`footer-${pathname?.split("/")[1] || "home"}`} className="w-full" />
    </div>
  );
}
