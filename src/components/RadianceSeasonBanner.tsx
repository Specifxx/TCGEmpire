"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RADIANCE_PREVIEW_END, RADIANCE_PREVIEW_START, RADIANCE_RELEASE_DATE } from "@/lib/sets/radiance";
import { REGION_HOME_PATH } from "@/lib/seo";

// Slim, dismissible sitewide banner for Radiance preview season (2026-09-24
// growth pass). Decided on the CLIENT, after mount: the root layout is shared
// by ISR pages cached for up to a day, so a server-rendered date check would
// keep saying "previews start tomorrow" after they had started. Rendering
// nothing on the server also means no hydration mismatch and no layout shift
// for anyone who dismissed it (a returning dismissal never paints).
//
// Copy by date: before 25 Sep it announces the start; from 25 Sep it points at
// the reveals; once previews end (after 9 Oct) it points at the pre-order prices
// for launch week; from release day (23 Oct) it is gone for everyone. The launch
// phase has its own dismissal key: someone who closed "preview season is on" has
// not seen the pre-order message (2026-10-15, owner).
const DISMISS_KEY = "rc_radiance_banner_dismissed";
const LAUNCH_DISMISS_KEY = "rc_radiance_launch_banner_dismissed";

type Phase = "soon" | "live" | "launch";

function phaseAt(now: number): Phase | null {
  if (now >= Date.parse(`${RADIANCE_RELEASE_DATE}T00:00:00Z`)) return null;
  // The day after the last preview day.
  if (now >= Date.parse(`${RADIANCE_PREVIEW_END}T00:00:00Z`) + 86_400_000) return "launch";
  return now >= Date.parse(`${RADIANCE_PREVIEW_START}T00:00:00Z`) ? "live" : "soon";
}

// On the six market homepages the banner lives INSIDE the hero (2026-10-16,
// owner: "fix this annoying overlap, can we bring it inside the hero"). Above
// it, in <main>, the full-bleed hero's -mt-6 slid over the banner's bottom edge.
// So the layout's copy steps aside on those paths and CinematicHero renders its
// own with placement="hero". Every other page keeps it at the top of <main>.
const HERO_HOME_PATHS: readonly string[] = Object.values(REGION_HOME_PATH);

export function RadianceSeasonBanner({ placement = "page" }: { placement?: "page" | "hero" }) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const p = phaseAt(Date.now());
    if (!p) return;
    try {
      if (localStorage.getItem(p === "launch" ? LAUNCH_DISMISS_KEY : DISMISS_KEY)) return;
    } catch {
      /* storage blocked — show it; dismissal just won't persist */
    }
    setPhase(p);
  }, []);

  if (!phase) return null;
  if (placement === "page" && pathname && HERO_HOME_PATHS.includes(pathname)) return null;
  const dismiss = () => {
    const was = phase;
    setPhase(null);
    try {
      localStorage.setItem(was === "launch" ? LAUNCH_DISMISS_KEY : DISMISS_KEY, "1");
    } catch {
      /* fine */
    }
  };

  return (
    <div
      role="region"
      aria-label="Radiance preview season"
      className={
        placement === "hero"
          ? // In the hero: centred and narrower, a dark glass strip so it reads
            // over the hero band; on sm+ it starts below CreatorsCornerBadge,
            // which sits absolute in the hero's top-right corner.
            "relative z-20 mx-auto mb-4 flex max-w-xl items-center gap-2 rounded-lg border border-gold/30 bg-ink-950/85 py-1 pl-3 pr-1 text-left text-xs text-slate-200 backdrop-blur sm:mt-8 sm:text-sm"
          : "mb-4 flex items-center gap-2 rounded-lg border border-gold/25 bg-gold/10 py-1 pl-3 pr-1 text-xs text-slate-200 sm:text-sm"
      }
    >
      <Link href={phase === "launch" ? "/radiance-preorders" : "/sets/radiance"} className="tap-link min-w-0 flex-1 hover:text-white">
        {/* One child: .tap-link is a flex row, which split the label into columns. */}
        <span>
          <span className="font-semibold text-gold">✦ Radiance</span>{" "}
          {phase === "launch"
            ? "is out 23 October — compare every store's pre-order price →"
            : phase === "live"
              ? "preview season is on — see every card revealed so far →"
              : "previews start 25 September — follow every reveal →"}
        </span>
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss the Radiance banner" className="tap-icon shrink-0 rounded-md text-slate-400 hover:bg-ink-800 hover:text-white">
        ✕
      </button>
    </div>
  );
}
