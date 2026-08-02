"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { META_PIXEL_ID } from "@/lib/site";
import { useConsent } from "@/lib/use-consent";

// Meta (Facebook) Pixel — injected once, site-wide, from the root layout so Meta
// can measure ad-driven visits and build retargeting / lookalike audiences.
// Guards:
//   • Production only — never fires on localhost dev, so the developer's own page
//     loads don't pollute the ad account's data.
//   • Web only — skipped inside the Capacitor native-app WebView (like the ad
//     loaders): the pixel is for web-ad attribution, and app sessions would muddy it.
//   • Empty META_PIXEL_ID disables it entirely.
//   • CONSENT — it does not load until lib/use-consent.ts reports an ADVERTISING
//     grant. This is the strict grant (TCF purposes 1 + 3 + 4), not the
//     measurement one: the pixel sets third-party advertising cookies and feeds
//     retargeting and lookalike audiences, which is exactly what a visitor is
//     declining when they decline personalised advertising. It previously loaded
//     unconditionally, which meant the site set Meta's cookies while its own
//     Consent Mode defaults said ad_storage was denied — and /privacy did not
//     name Meta at all. Both are fixed; see /privacy § Advertising.
// The base snippet fires the first PageView on load; App Router client-side
// navigations don't reload the page, so we fire a PageView on each pathname change
// (skipping the first, which the inline snippet already counted).
export function MetaPixel() {
  const pathname = usePathname();
  const firstLoad = useRef(true);
  const [allowed, setAllowed] = useState(false);
  const { ad: adConsent } = useConsent();

  useEffect(() => {
    if (!META_PIXEL_ID || process.env.NODE_ENV !== "production") return;
    // Skip inside the native app — web-ad attribution only.
    if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
    setAllowed(true);
  }, []);

  const enabled = allowed && adConsent;

  useEffect(() => {
    if (!enabled) return;
    if (firstLoad.current) {
      firstLoad.current = false; // the inline snippet already tracked this first view
      return;
    }
    (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq?.("track", "PageView");
  }, [pathname, enabled]);

  if (!META_PIXEL_ID) return null;
  return (
    <>
      {enabled && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
          }}
        />
      )}
      {/* The <noscript> 1×1 fallback was REMOVED, not gated. It fires from
          markup, before and regardless of any JavaScript, so there is no way to
          hold it behind a consent decision — it would have contacted Meta for
          every visitor including those who declined, and for every crawler. A
          no-JS visitor going unmeasured is the correct trade. */}
    </>
  );
}
