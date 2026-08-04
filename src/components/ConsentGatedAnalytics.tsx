"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useConsent } from "@/lib/use-consent";

// Vercel Analytics / Speed Insights, gated on the SAME consent signal as every
// other tag on the site. The decision logic lives in lib/use-consent.ts so the
// Meta Pixel can't drift onto a different rule — see that file's header.
//
// Analytics needs only the measurement grant, not the advertising one: Vercel
// Analytics is cookieless and does not fingerprint, so TCF purpose 1 is the
// right bar for it. The Meta Pixel asks for the stricter `ad` grant.
export function ConsentGatedAnalytics() {
  const { analytics } = useConsent();
  if (!analytics) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
