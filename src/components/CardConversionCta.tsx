"use client";

import Link from "next/link";
import { useState } from "react";
import { usePremium } from "@/components/PremiumProvider";

// Conversion island for the card page (the site's biggest landing surface, which had
// no price-watch CTA and no Premium mention). Client-side so the route stays ISR.
//  1. "Watch this price" → opens the email-capture alert modal for this card
//     (the single highest-intent action for a land-and-leave price checker).
//  2. A contextual Value Finder teaser, hidden for members (usePremium).
export function CardConversionCta({ cardId }: { cardId: string }) {
  const premium = usePremium();
  const [watching, setWatching] = useState(false);

  function watch() {
    setWatching(true);
    window.dispatchEvent(new CustomEvent("price-alert-open", { detail: { cardId } }));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span aria-hidden>🔔</span> Watch this price
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {watching
            ? "Added — finish in the popup to get drop alerts."
            : "We'll email you when it drops — free, and with an account your watchlist syncs everywhere."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* btn-ghost, not btn-primary: this is another "watch this price"
            affordance (same family as PriceWatchButton above it on the page) —
            the in-stock retailer buy buttons are the page's only primary CTA. */}
        <button onClick={watch} className="btn-ghost text-sm">
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
