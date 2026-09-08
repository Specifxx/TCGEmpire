"use client";

import Link from "next/link";
import { firePremiumClickBeacon } from "@/lib/analytics";

// A "✦ Premium" link that goes straight to /premium — no upsell dialog in
// between (retired 2026-09-06: "get rid of the pop up when you click premium
// and send them straight to the page"). Still fires the same premium-interest
// beacon PremiumDialog's open() used to fire on click, so the admin-facing
// signal survives losing the dialog — see firePremiumClickBeacon's own header.
//
// A thin Client Component wrapper so a plain "✦ Premium" link inside a Server
// Component (Navbar) can still fire that beacon without making the whole
// component client-side just for this one link.
export function PremiumNavLink({
  href = "/premium",
  className,
  children,
  onClick,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        firePremiumClickBeacon("button");
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
