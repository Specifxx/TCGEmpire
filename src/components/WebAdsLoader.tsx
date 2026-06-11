"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/ads";

// Loads the Google AdSense script — but ONLY on the web.
//
// Inside the native app (Capacitor) the site shows native AdMob ads instead, and
// loading AdSense inside an app WebView violates AdSense program policy. We wait
// one tick to detect the Capacitor runtime, then skip the script entirely in-app.
export function WebAdsLoader() {
  const [decided, setDecided] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(!!(window as any).Capacitor?.isNativePlatform?.());
    setDecided(true);
  }, []);

  if (!ADSENSE_ENABLED || !decided || isNative) return null;

  return (
    <Script
      id="adsbygoogle-init"
      // lazyOnload (browser idle) instead of afterInteractive: AdSense is the
      // heaviest third-party script we load, and pulling it off the critical
      // path is the biggest mobile-PageSpeed lever we control. Ads paint a beat
      // later; the page becomes interactive sooner.
      strategy="lazyOnload"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
