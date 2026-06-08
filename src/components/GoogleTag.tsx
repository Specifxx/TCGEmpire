"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import {
  GA_ENABLED,
  GA_MEASUREMENT_ID,
  GOOGLE_ADS_ENABLED,
  GOOGLE_ADS_ID,
  GOOGLE_TAG_BOOTSTRAP_ID,
  GOOGLE_TAG_ENABLED,
} from "@/lib/google-ads";

// Loads the Google tag (gtag.js) — but ONLY on the web.
//
// This is the foundation for PAID Google Ads (conversion tracking + remarketing)
// and, optionally, GA4 analytics. Inside the native app (Capacitor) we skip it:
// app installs already report via AdMob/native analytics, and the gtag conversion
// model is built for web sessions. Mirrors WebAdsLoader's native-detection guard.
export function GoogleTag() {
  const [decided, setDecided] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(!!(window as any).Capacitor?.isNativePlatform?.());
    setDecided(true);
  }, []);

  if (!GOOGLE_TAG_ENABLED || !decided || isNative) return null;

  return (
    <>
      <Script
        id="gtag-js"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_BOOTSTRAP_ID}`}
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${GOOGLE_ADS_ENABLED ? `gtag('config', '${GOOGLE_ADS_ID}');` : ""}
          ${GA_ENABLED ? `gtag('config', '${GA_MEASUREMENT_ID}');` : ""}
        `}
      </Script>
    </>
  );
}
