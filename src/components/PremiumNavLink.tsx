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
  // Accessible name + tooltip, needed since 2026-09-18: below `sm` the phone
  // copy of this link renders as a bare gold "✦" with no text (see Navbar's
  // comment on why), so it needs a name of its own. Both are optional and
  // unset on every other caller, whose visible "✦ Premium" text is its name.
  "aria-label": ariaLabel,
  title,
  // Which link this is, for attribution (lib/premium-surface.ts). Every caller
  // names itself; the default only covers a future caller that forgets.
  surface = "nav:link",
}: {
  surface?: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={() => {
        firePremiumClickBeacon(surface);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
