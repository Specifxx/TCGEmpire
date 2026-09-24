"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RADIANCE_PREVIEW_START, RADIANCE_RELEASE_DATE } from "@/lib/sets/radiance";

// Slim, dismissible sitewide banner for Radiance preview season (2026-09-24
// growth pass). Decided on the CLIENT, after mount: the root layout is shared
// by ISR pages cached for up to a day, so a server-rendered date check would
// keep saying "previews start tomorrow" after they had started. Rendering
// nothing on the server also means no hydration mismatch and no layout shift
// for anyone who dismissed it (a returning dismissal never paints).
//
// Copy by date: before 25 Sep it announces the start; from 25 Sep it points at
// the reveals; from release day (23 Oct) it is gone for everyone.
const DISMISS_KEY = "rc_radiance_banner_dismissed";

export function RadianceSeasonBanner() {
  const [phase, setPhase] = useState<"soon" | "live" | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* storage blocked — show it; dismissal just won't persist */
    }
    const now = Date.now();
    if (now >= Date.parse(`${RADIANCE_RELEASE_DATE}T00:00:00Z`)) return;
    setPhase(now >= Date.parse(`${RADIANCE_PREVIEW_START}T00:00:00Z`) ? "live" : "soon");
  }, []);

  if (!phase) return null;
  const dismiss = () => {
    setPhase(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* fine */
    }
  };

  return (
    <div role="region" aria-label="Radiance preview season" className="mb-4 flex items-center gap-2 rounded-lg border border-gold/25 bg-gold/10 py-1 pl-3 pr-1 text-xs text-slate-200 sm:text-sm">
      <Link href="/sets/radiance" className="tap-link min-w-0 flex-1 hover:text-white">
        {/* One child: .tap-link is a flex row, which split the label into columns. */}
        <span>
          <span className="font-semibold text-gold">✦ Radiance</span>{" "}
          {phase === "live" ? "preview season is on — see every card revealed so far →" : "previews start 25 September — follow every reveal →"}
        </span>
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss the Radiance banner" className="tap-icon shrink-0 rounded-md text-slate-400 hover:bg-ink-800 hover:text-white">
        ✕
      </button>
    </div>
  );
}
