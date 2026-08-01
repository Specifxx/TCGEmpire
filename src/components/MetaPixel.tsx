"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { META_PIXEL_ID } from "@/lib/site";

// Meta (Facebook) Pixel — injected once, site-wide, from the root layout so Meta
// can measure ad-driven visits and build retargeting / lookalike audiences.
// Guards:
//   • Production only — never fires on localhost dev, so the developer's own page
//     loads don't pollute the ad account's data.
//   • Web only — skipped inside the Capacitor native-app WebView (like the ad
//     loaders): the pixel is for web-ad attribution, and app sessions would muddy it.
//   • Empty META_PIXEL_ID disables it entirely.
// The base snippet fires the first PageView on load; App Router client-side
// navigations don't reload the page, so we fire a PageView on each pathname change
// (skipping the first, which the inline snippet already counted).
export function MetaPixel() {
  const pathname = usePathname();
  const firstLoad = useRef(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!META_PIXEL_ID || process.env.NODE_ENV !== "production") return;
    // Skip inside the native app — web-ad attribution only.
    if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
    setEnabled(true);
  }, []);

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
      {/* No-JS fallback: a 1×1 tracking image so pixel-less visits still register. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
