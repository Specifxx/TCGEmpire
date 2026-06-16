"use client";

import { useEffect } from "react";
import { HILLTOPADS_ENABLED, HILLTOPADS_SRC } from "@/lib/ads";
import { usePremium } from "./PremiumProvider";

// Loads the HilltopAds MultiTag zone — the site's primary ad network. Injected
// once, site-wide, from the root layout so it runs on every page. Guards:
//   • web only — skipped inside the Capacitor native-app WebView, where loading a
//     third-party ad-network script (popunder/popup) breaks app-store policy; the
//     native app shows AdMob banners instead (see NativeShell).
//   • premium members get an ad-free site, so it's skipped for them too.
// HilltopAds' own snippet reads `document.currentScript.settings`, so we recreate
// it faithfully: build the <script>, set `.settings = {}`, async-load the zone.
export function HilltopAdsLoader() {
  const premium = usePremium();
  useEffect(() => {
    if (!HILLTOPADS_ENABLED || premium) return;
    if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
    if (document.getElementById("hilltopads-zone")) return; // guard double-inject (strict mode / re-render)
    const s = document.createElement("script");
    s.id = "hilltopads-zone";
    (s as unknown as { settings: unknown }).settings = {};
    s.src = HILLTOPADS_SRC;
    s.async = true;
    s.referrerPolicy = "no-referrer-when-downgrade";
    document.body.appendChild(s);
  }, [premium]);
  return null;
}
