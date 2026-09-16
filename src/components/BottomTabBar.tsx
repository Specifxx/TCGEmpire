"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NavIcon, type NavIconName } from "./NavIcon";
import { useMegaMenu } from "./MegaMenuProvider";
import { useWatchlist } from "@/lib/use-watchlist";

/**
 * Measures how much of the screen a mobile browser's own collapsible chrome
 * is covering RIGHT NOW, and writes it to `--chrome-lift` for both this bar
 * and `.above-bottombar` (globals.css) to read.
 *
 * SELF-CONSISTENT ON PURPOSE. The first version of this computed the lift in
 * pure CSS as `100lvh - 100dvh`, and that caused two new bugs on a Z Fold 7: a
 * persistent gap under the bar (the value read nonzero with no chrome actually
 * covering anything) and a stutter across the WHOLE page during scroll,
 * including the unrelated sticky header — see globals.css's own doc comment on
 * `--chrome-lift` for the full diagnosis. This measures instead of trusting a
 * CSS unit: it tracks the LARGEST `visualViewport.height` seen so far this
 * session (that is the screen with chrome fully retracted, i.e. `lvh`) and
 * reports `max - current` (`current` is `dvh` — chrome however far out right
 * now). Both numbers come from the SAME API, so they can never disagree about
 * what "the viewport" means the way two different browser features might.
 * `Math.max(0, …)` is a pure formality — the subtraction is >= 0 by
 * construction — but costs nothing to keep honest.
 *
 * DEGRADES TO "NO LIFT", NEVER TO A WRONG ONE. No `visualViewport` (very old
 * WebViews): the effect never runs, `--chrome-lift` stays the 0px in
 * globals.css, and the bar behaves exactly as it did before any of this
 * existed — hidden behind an expanded address bar until the visitor scrolls,
 * the ORIGINAL bug, which is a far smaller failure than a wrong nonzero lift.
 * Before the first chrome-retracting scroll this SESSION: `max` is whatever
 * `visualViewport.height` happened to be on mount, which may be smaller than
 * the device's true full height if the address bar was already showing — the
 * same graceful floor, corrected the moment a scroll reveals more screen.
 *
 * rAF-THROTTLED, SO THIS FILE CONTROLS THE UPDATE RATE. `resize`/`scroll` on
 * `visualViewport` can fire faster than the browser can usefully repaint; at
 * most one `--chrome-lift` write happens per animation frame, both here and
 * consumed downstream only as a compositor-only `transform` (see the bar's own
 * className comment) — never as a layout property again.
 */
function useChromeLift() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // globals.css's 0px default stands — see the doc comment above.
    let maxHeight = vv.height;
    let raf = 0;
    function apply() {
      raf = 0;
      if (vv!.height > maxHeight) maxHeight = vv!.height;
      const lift = Math.max(0, Math.round(maxHeight - vv!.height));
      document.documentElement.style.setProperty("--chrome-lift", `${lift}px`);
    }
    function onChange() {
      if (!raf) raf = requestAnimationFrame(apply);
    }
    apply();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

// SideNav's complement below `lg` — the rail is `hidden lg:flex`, this is
// `lg:hidden`, one breakpoint decision either way (see --bottombar-h /
// --sidenav-w in globals.css, which are never allowed to disagree). Five
// fixed targets, so the active-tab indicator is plain CSS math (translateX in
// 20% steps) rather than the measured, arbitrary-width version ui/SegmentedTabs
// needs for a tab COUNT that isn't fixed.
const TABS: { label: string; icon: NavIconName; href?: string }[] = [
  { label: "Home", icon: "home", href: "/" },
  // A real page link now, not an in-place focus trick — reported directly:
  // "the search bar should open to like a new page… just like when you click
  // on portfolio, it opens to a new page… we should keep that consistent so
  // the feel is the same." /browse is the same full card+sealed database
  // page the header's own search box navigates to on submit
  // (SearchBar.tsx's commitSearch), so this tab and the header box land in
  // the identical place rather than two different "search" experiences.
  { label: "Search", icon: "browse", href: "/browse" },
  { label: "Watch", icon: "bell", href: "/watching" },
  { label: "Binder", icon: "collection", href: "/portfolio" },
  { label: "Menu", icon: "menu" },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const { setOpen: setMenuOpen, open: menuOpen } = useMegaMenu();
  const { watched } = useWatchlist();
  const watchCount = watched?.size ?? 0;
  useChromeLift();

  // Only a real PAGE match lights up the sliding indicator — Menu opens an
  // overlay, it is never the "current page".
  const activeIndex = TABS.findIndex((t) => t.href && (t.href === "/" ? pathname === "/" : pathname?.startsWith(t.href)));

  return (
    <nav
      aria-label="Primary"
      // `bottom` is STATIC (native-banner-h only — that changes once, on native
      // app detection, never mid-scroll). The chrome-lift compensation moves
      // through `translateY` instead, on its own line below, and that split is
      // the whole fix for a second bug this bar shipped with.
      //
      // Reported on a Z Fold 7 (cover screen): "the bottom is glitched … should
      // not be able to move or lag when I scroll down." The previous version
      // put --chrome-lift straight into `bottom`, and `bottom` is a LAYOUT
      // property — every recalculation of that calc() (and dvh/lvh are
      // deliberately DYNAMIC, so the browser recomputes them continuously while
      // its own chrome animates) forced a full reflow of this element, PLUS a
      // repaint of `backdrop-blur` at its new position, on every single frame
      // of that animation. Layout thrash plus a backdrop-filter repaint on
      // every frame is a textbook jank source — web.dev's own performance
      // guidance is to animate `transform`/`opacity` and nothing else, for
      // exactly this reason. A foldable's chrome is also one of the more
      // unusual/actively-changing ones out there, so it is a plausible
      // candidate for showing this worst.
      //
      // `translate-y-[calc(var(--chrome-lift)*-1)]` carries the identical
      // value but as a compositor-only transform: the browser can reposition
      // the already-painted layer on the GPU without touching layout or
      // repainting the page underneath. `will-change-transform` asks the
      // browser to promote this to its own layer up front rather than
      // discovering the need mid-animation, which is when a promotion itself
      // can cause a visible hitch.
      //
      // --chrome-lift's VALUE comes from useChromeLift() above, not from CSS —
      // see that function's doc comment for why a measured value replaced the
      // dvh/lvh arithmetic this comment was originally written against.
      className="fixed inset-x-0 bottom-[var(--native-banner-h)] z-bottombar flex h-[var(--bottombar-h)] translate-y-[calc(var(--chrome-lift)*-1)] will-change-transform border-t border-ink-800 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          className="motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-out absolute left-0 top-0 h-0.5 w-1/5 bg-brand-400"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
      )}

      {TABS.map((tab) => {
        const isActive = tab.href ? (tab.href === "/" ? pathname === "/" : pathname?.startsWith(tab.href)) : tab.label === "Menu" && menuOpen;
        const cls = `relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 ${
          isActive ? "text-brand-400" : "text-slate-300"
        }`;

        const content = (
          <>
            <span className="relative">
              <NavIcon name={tab.icon} className="h-5 w-5" />
              {tab.label === "Watch" && watchCount > 0 && (
                <span className="num absolute -right-1.5 -top-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950">
                  {watchCount > 9 ? "9+" : watchCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </>
        );

        if (tab.href) {
          return (
            <Link key={tab.label} href={tab.href} aria-current={isActive ? "page" : undefined} className={cls}>
              {content}
            </Link>
          );
        }

        // Only "Menu" ever reaches here now — every other tab is a real page link above.
        return (
          <button key={tab.label} type="button" onClick={() => setMenuOpen(true)} className={cls}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
