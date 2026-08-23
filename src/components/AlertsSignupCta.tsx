"use client";

import Link from "next/link";
import { markSignupSource } from "@/lib/signup-source";

// The /alerts page's primary CTA. That page is the SEO explainer for the
// exact feature a free account unlocks, and it used to exit to "Browse cards"
// without a single login link — the highest-affinity page on the site sent
// its readers everywhere except the signup. Client component only for the
// attribution click; renders identically for everyone.
export function AlertsSignupCta() {
  return (
    <Link
      href="/login?next=/watching"
      rel="nofollow"
      onClick={() => markSignupSource("alerts_page")}
      className="btn-primary shrink-0 whitespace-nowrap"
    >
      Start your watchlist — free
    </Link>
  );
}
