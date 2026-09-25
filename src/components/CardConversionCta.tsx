"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { NavIcon } from "@/components/NavIcon";

// Conversion island for the card page (the site's biggest landing surface, which had
// no price-watch CTA and no Premium mention). Client-side so the route stays ISR.
//  1. "Watch this price" → opens the email-capture alert modal for this card
//     (the single highest-intent action for a land-and-leave price checker).
//  2. A pointer to Deal Finder (every card below TCGplayer market), hidden for
//     members. It pointed at the Value Finder until that left the product
//     (2026-09-25); /tools/value-finder now 301s to /movers.
export function CardConversionCta({ cardId }: { cardId: string }) {
  // Membership, not ad-free: useMe().premium, not usePremium().
  const { premium } = useMe();
  const [watching, setWatching] = useState(false);

  function watch() {
    setWatching(true);
    window.dispatchEvent(new CustomEvent("price-alert-open", { detail: { cardId } }));
  }

  // A wrapping row, not flex-col → sm:flex-row (2026-09-23). The button group
  // was shrink-0 inside that row, so it could never wrap: a 424px group in the
  // card page's 360px details column gave a 1093px document at 1024. Now the
  // text and the buttons share a row only when both fit, and the buttons stack
  // only when even one row of them does not fit.
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="flex items-center gap-1.5 text-sm font-bold text-white">
          <NavIcon name="heart" className="h-4 w-4 text-brand-400" />
          Watch this price
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {watching
            ? "Added — finish in the popup to get drop alerts."
            : "We'll email you when it drops — free, and with an account your watchlist syncs everywhere."}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* btn-ghost, not btn-primary: this is another "watch this price"
            affordance (same family as PriceWatchButton above it on the page) —
            the in-stock retailer buy buttons are the page's only primary CTA. */}
        <button onClick={watch} className="btn-ghost text-sm">
          {watching ? "✓ Watching" : "Email me when it drops"}
        </button>
        {!premium && (
          <Link href="/tools/deal-finder" className="btn-ghost text-sm">
            See every card below TCGplayer market →
          </Link>
        )}
      </div>
    </div>
  );
}
