"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// A single ad placement.
//
// Renders a real Google AdSense unit when BOTH a publisher id (env) and a `slot`
// id are configured; otherwise it renders a styled placeholder so the layout and
// spacing look right while you wait for AdSense approval / before slots are set.
//
//   <AdSlot slot={ADSENSE_SLOTS.article} />        // responsive in-content unit
//   <AdSlot slot={ADSENSE_SLOTS.browse} format="horizontal" height={90} />
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
  // Effects run twice under React strict mode in dev; guard the push so we never
  // call adsbygoogle twice for the same slot (which throws).
  const pushed = useRef(false);

  useEffect(() => {
    if (!live || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // adsbygoogle.js not loaded yet / blocked — ignore, nothing we can do.
    }
  }, [live]);

  // No publisher id at all (e.g. local dev): show a styled placeholder so the
  // layout is visible while building. This is never reached in production.
  if (!ADSENSE_ENABLED) {
    return (
      <div
        className={`grid place-items-center rounded-xl border border-dashed border-ink-700 bg-ink-900/60 text-center ${className ?? ""}`}
        style={{ minHeight: height }}
        aria-label="advertisement"
      >
        <div className="text-xs uppercase tracking-widest text-slate-600">
          {label}
          <div className="mt-1 text-[10px] normal-case tracking-normal text-slate-700">
            Ad space — your sponsor here
          </div>
        </div>
      </div>
    );
  }

  // Live publisher id but no manual slot id for this placement yet: render NOTHING
  // (never an empty/placeholder box for real visitors). Auto ads, enabled in the
  // AdSense dashboard, fill the page automatically. Set the slot id to take manual
  // control of this exact spot.
  if (!live) return null;

  return (
    <ins
      className={`adsbygoogle block ${className ?? ""}`}
      style={{ display: "block", minHeight: height }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
      aria-label="advertisement"
    />
  );
}
