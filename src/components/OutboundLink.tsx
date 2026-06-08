"use client";

import type { ReactNode } from "react";

// An outbound "buy" link that fires a click beacon before navigating, so we can
// count how many times each store/eBay link is used (verified in our own DB, no
// dependency on the partner's dashboard). The link itself stays a normal direct
// <a> — keeping eBay's affiliate attribution clean and adding zero redirect latency.
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
  function log() {
    try {
      const blob = new Blob([JSON.stringify({ retailer, country, kind })], { type: "application/json" });
      navigator.sendBeacon("/api/click", blob);
    } catch {
      /* sendBeacon unsupported or blocked — ignore, never block the click */
    }
  }
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    log();
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
      rel="nofollow sponsored noopener noreferrer"
      className={className}
      onClick={onClick}
      onAuxClick={log}
    >
      {children}
    </a>
  );
}
