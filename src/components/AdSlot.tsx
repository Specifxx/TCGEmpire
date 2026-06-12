"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/ads";

declare global {
  interface Window {
    // The loader script sets `.loaded = true` when it runs; with an ad blocker the
    // request 404s/never fires, so the property stays undefined — our tell.
    adsbygoogle?: unknown[] & { loaded?: boolean };
  }
}

// ── House promos ─────────────────────────────────────────────────────────────────
// First-party fallback units shown wherever AdSense can't serve: no slot id
// configured yet, the script is blocked by an ad blocker (~30% of desktop), or
// the network returned no fill. First-party content sails through filter lists,
// so a blocked impression becomes a site promo instead of dead space.
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

export function HouseAd({ seed, height }: { seed: string; height: number }) {
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

// ── The ad placement ─────────────────────────────────────────────────────────────
// Renders a Google AdSense unit inside a FIXED-height, overflow-hidden frame:
// the box occupies exactly `height` px from first paint and never grows or
// collapses, whether the ad fills, no-fills, or is blocked — zero CLS by
// construction (ad injection into unreserved space was a top layout-shift
// source). If AdSense can't serve (no slot id, blocked, unfilled), the frame
// shows a first-party HouseAd instead of empty space.
export function AdSlot({
  slot,
  label = "Advertisement",
  height = 90,
  format = "auto",
  responsive = true,
  className,
}: {
  slot?: string;
  label?: string;
  height?: number;
  format?: string;
  responsive?: boolean;
  className?: string;
}) {
  const live = ADSENSE_ENABLED && !!slot;
  const boxRef = useRef<HTMLDivElement>(null);
  // Effects run twice under React strict mode in dev; guard the push so we never
  // call adsbygoogle twice for the same slot (which throws).
  const pushed = useRef(false);
  // House promo: immediate when AdSense can't serve here at all (no slot id —
  // also the local-dev state); otherwise flipped on once detection says the
  // script is blocked or the unit went unfilled.
  const [house, setHouse] = useState(!live);

  useEffect(() => {
    if (!live) return;
    if (!pushed.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        // adsbygoogle.js not loaded yet / blocked — detection below decides.
      }
    }
    let alive = true;
    const verdict = (final: boolean) => {
      if (!alive) return;
      const ins = boxRef.current?.querySelector("ins.adsbygoogle");
      const status = ins?.getAttribute("data-ad-status");
      if (status === "filled") return setHouse(false);
      if (status === "unfilled") return setHouse(true);
      // No verdict from AdSense yet. The loader uses lazyOnload (browser idle),
      // so only the FINAL check treats a script that never ran as blocked.
      if (final && !window.adsbygoogle?.loaded) setHouse(true);
    };
    const t1 = setTimeout(() => verdict(false), 4000);
    const t2 = setTimeout(() => verdict(true), 9000);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [live]);

  return (
    <div ref={boxRef} className={`relative overflow-hidden ${className ?? ""}`} style={{ height }}>
      {live && (
        <ins
          className="adsbygoogle block"
          style={{ display: "block", width: "100%", height }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive={responsive ? "true" : "false"}
          aria-label={label}
        />
      )}
      {house && (
        <div className="absolute inset-0">
          <HouseAd seed={slot || label} height={height} />
        </div>
      )}
    </div>
  );
}
