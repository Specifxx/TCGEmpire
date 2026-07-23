"use client";

import type { ReactNode } from "react";
import { outboundRel } from "@/lib/affiliate";

// An outbound "buy" link. Used to also fire a click beacon (to /api/click) for
// eBay retailer keys so click counts could be verified in our own DB — that
// beacon has been turned off (it wrote a row per click to the already
// egress-strained history DB; see /api/click/route.ts, which is now a no-op
// kept only so any stale cached page still calling it doesn't 404/error). The
// link itself stays a normal direct <a> — keeping eBay's affiliate attribution
// clean and adding zero redirect latency.
export function OutboundLink({
  href,
  retailer,
  country,
  kind = "single",
  className,
  children,
}: {
  href: string;
  retailer: string;
  country: string;
  kind?: "single" | "sealed";
  className?: string;
  children: ReactNode;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Inside the native app, open retailer links in the system browser so the user
    // leaves our WebView (and can come back), instead of getting stuck on the
    // store's site. On the web this branch never runs — it's a normal link.
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      e.preventDefault();
      import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: href }))
        .catch(() => window.open(href, "_blank"));
    }
  }
  return (
    <a
      href={href}
      target="_blank"
      rel={outboundRel(href)}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
