"use client";

import Link from "next/link";
import { useState } from "react";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-client";
import { usePremium } from "@/components/PremiumProvider";

// Conversion island for the card page (the site's biggest landing surface, which had
// no price-watch CTA and no Premium mention). Client-side so the route stays ISR.
//  1. "Watch this price" → wishlists the card + opens the email-capture alert modal
//     (the single highest-intent action for a land-and-leave price checker).
//  2. A contextual Value Finder teaser, hidden for members (usePremium).
export function CardConversionCta({ cardId }: { cardId: string }) {
  const premium = usePremium();
  const [watching, setWatching] = useState(false);

  function watch() {
    if (!isWishlisted(cardId)) toggleWishlist(cardId);
    setWatching(true);
    // Open the email-capture modal directly (bypasses the once-ever auto-prompt gate).
    window.dispatchEvent(new CustomEvent("price-alert-open"));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span aria-hidden>🔔</span> Watch this price
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {watching
            ? "Added — enter your email in the popup to get drop alerts."
            : "We'll email you when it drops. No account needed."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button onClick={watch} className="btn-primary text-sm">
          {watching ? "✓ Watching" : "Email me when it drops"}
        </button>
        {!premium && (
          <Link href="/tools/value-finder" className="btn-ghost text-sm">
            💎 Find undervalued cards →
          </Link>
        )}
      </div>
    </div>
  );
}
