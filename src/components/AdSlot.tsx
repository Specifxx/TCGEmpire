"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePremium } from "./PremiumProvider";
import { AD_STRATEGY, AD_UNITS_ENABLED, ADSENSE_CLIENT_ID } from "@/lib/adsense";

// ─────────────────────────────────────────────────────────────────────────────
// One in-content slot. Renders exactly one of three things:
//   • a real AdSense <ins> unit   — only when every gate below is open
//   • a first-party house promo   — the default today
//   • nothing at all              — Premium members, thin/noindex pages
//
// THE GATES, and why each exists:
//
//   AD_UNITS_ENABLED   false while ADSENSE_REVIEW_MODE is on (an unfilled unit
//                      shows a reviewer a blank reserved box), false under
//                      AD_STRATEGY="auto" (Google places its own; running both
//                      stacks placements and produces the ad density that trips
//                      the Better Ads Standards half of the Publisher Policies),
//                      and false without a configured publisher id.
//   pageIsThin /       no ad may render on a page we have ourselves judged too
//   pageIsNoindex      thin to index — monetising a page you are simultaneously
//                      telling Google not to index is the definition of a
//                      made-for-advertising page. The same two flags are what
//                      error pages, empty search results, auth pages and the
//                      marketplace checkout flow pass in.
//   Premium            paid members get an ad-free site.
//
// THE LOADER SCRIPT IS NOT GATED BY ANY OF THIS. It ships from the root layout
// on every page, including all of the above — see components/AdSenseLoader.tsx.
// These flags decide whether a UNIT fills, never whether the account's
// verification and consent transport is present.
//
// ZERO CLS BY CONSTRUCTION: the frame is a fixed-height, overflow-hidden box, so
// whatever lands inside it — house promo, filled ad, or an unfilled unit that
// collapses — the surrounding layout never moves. Reserving that height is the
// reason this is a wrapper at all rather than a bare <ins>.

// ── House promos ─────────────────────────────────────────────────────────────
// First-party units: links to our own tools, no third-party network and no
// tracking. This is what a slot shows before — and instead of — real ads.
const HOUSE_ADS = [
  { emoji: "📈", title: "Today's biggest price moves", sub: "Risers, drops and best-value buys — updated daily", cta: "See the movers", href: "/movers" },
  { emoji: "🎲", title: "Is that booster box worth opening?", sub: "Run the numbers against live singles prices", cta: "Box EV calculator", href: "/tools/box-ev" },
  { emoji: "📊", title: "The RiftCompare Index", sub: "The whole Riftbound market in one number", cta: "View the index", href: "/market" },
  { emoji: "🔔", title: "Never overpay for a card again", sub: "Free price alerts when a card hits your target", cta: "Browse & set an alert", href: "/browse" },
];

// Deterministic pick so server render === hydration (no Math.random) and each
// placement keeps a stable promo.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function HouseAd({ seed, height }: { seed: string; height: number }) {
  const ad = HOUSE_ADS[hashStr(seed) % HOUSE_ADS.length];
  return (
    <Link
      href={ad.href}
      className="relative flex h-full w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-ink-700 bg-gradient-to-r from-ink-900 to-ink-850 px-4 transition-colors hover:border-brand-500"
      style={{ height }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-2xl" aria-hidden>{ad.emoji}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{ad.title}</span>
          <span className="block truncate text-xs text-slate-400">{ad.sub}</span>
        </span>
      </span>
      <span className="hidden shrink-0 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-400 sm:block">
        {ad.cta} →
      </span>
      <span className="absolute right-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        RiftCompare
      </span>
    </Link>
  );
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// A real AdSense display unit. Pushed to the adsbygoogle queue once per mount;
// the ref guard matters because React 18 StrictMode double-invokes effects in
// development, and a double push throws "All ins elements … already have ads in
// them" — which kills every later slot on the page, not just this one.
function AdSenseUnit({ slot, height }: { slot: string; height: number }) {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      /* loader blocked or not yet present — the slot simply stays empty */
    }
  }, []);
  return (
    <ins
      className="adsbygoogle block"
      style={{ display: "block", height, width: "100%" }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

export function AdSlot({
  slot,
  label = "Advertisement",
  height = 90,
  className,
  /** True on a page we have judged thin, or are not indexing. No unit may render. */
  pageIsThin = false,
  pageIsNoindex = false,
}: {
  slot?: string;
  label?: string;
  height?: number;
  format?: string;
  responsive?: boolean;
  className?: string;
  pageIsThin?: boolean;
  pageIsNoindex?: boolean;
}) {
  const premium = usePremium();
  if (premium) return null;

  // Nothing at all on a page not worth indexing — not even a house promo. The
  // point is that such a page stays as bare as possible.
  if (pageIsThin || pageIsNoindex) return null;

  const canServeUnit = AD_UNITS_ENABLED && AD_STRATEGY === "manual" && Boolean(slot);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ height }}>
      {canServeUnit ? (
        <>
          {/* Google requires ad units to be distinguishable from content. */}
          <span className="absolute left-1 top-1 z-10 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </span>
          <AdSenseUnit slot={slot!} height={height} />
        </>
      ) : (
        <HouseAd seed={slot || `${label}-${height}-${className ?? ""}`} height={height} />
      )}
    </div>
  );
}
