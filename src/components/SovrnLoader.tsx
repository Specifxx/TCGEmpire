"use client";

import Script from "next/script";
import { SOVRN_KEY } from "@/lib/affiliate";

// Sovrn Commerce (VigLink) auto-affiliate script — their standard install
// snippet, deferred to browser idle so it never touches the critical path
// (same policy as the AdSense loader).
//
// What it does: rewrites outbound merchant links to monetised redirects at
// click time, across Sovrn's ~30k-merchant network — covering the long tail of
// Shopify stores we compare. Per Sovrn's own policy it does NOT re-affiliate
// links that already carry affiliate tracking, so our higher-paying direct
// programs (eBay campid, Amazon tag, TCGplayer Impact deep links, and our own
// server-side Sovrn redirects) are left alone.
export function SovrnLoader() {
  if (!SOVRN_KEY) return null;
  return (
    <Script id="sovrn-vglnk" strategy="lazyOnload">
      {`var vglnk = {key: '${SOVRN_KEY}'};
(function(d, t) {var s = d.createElement(t);
  s.type = 'text/javascript';s.async = true;
  s.src = '//cdn.viglink.com/api/vglnk.js';
  var r = d.getElementsByTagName(t)[0];
  r.parentNode.insertBefore(s, r);
}(document, 'script'));`}
    </Script>
  );
}
