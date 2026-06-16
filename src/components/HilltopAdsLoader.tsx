"use client";

import { useEffect } from "react";
import { HILLTOPADS_ENABLED, HILLTOPADS_ZONES } from "@/lib/ads";
import { usePremium } from "./PremiumProvider";

// Loads the HilltopAds zones — the site's primary ad network now that AdSense
// rejected the site. Injected once, site-wide, from the root layout so they run on
// every page. Guards:
//   • web only — skipped inside the Capacitor native-app WebView, where loading a
//     third-party ad-network script (popunder/popup) breaks app-store policy; the
//     native app shows AdMob banners instead (see NativeShell).
//   • premium members get an ad-free site, so it's skipped for them too.
// Each HilltopAds tag reads `document.currentScript.settings`, so we recreate the
// snippet per zone: build a <script>, set `.settings = {}`, async-load it.
export function HilltopAdsLoader() {
  const premium = usePremium();
  useEffect(() => {
    if (!HILLTOPADS_ENABLED || premium) return;
    if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
    HILLTOPADS_ZONES.forEach((src, i) => {
      const id = `hilltopads-zone-${i}`;
      if (document.getElementById(id)) return; // guard double-inject (strict mode / re-render)
      const s = document.createElement("script");
      s.id = id;
      (s as unknown as { settings: unknown }).settings = {};
      s.src = src;
      s.async = true;
      s.referrerPolicy = "no-referrer-when-downgrade";
      document.body.appendChild(s);
    });
  }, [premium]);
  return null;
}
