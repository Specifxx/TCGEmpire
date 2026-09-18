"use client";

import { NavIcon } from "./NavIcon";
import { useMegaMenu } from "./MegaMenuProvider";
import { useWatchlist } from "@/lib/use-watchlist";

/**
 * The phone/tablet navigation entry point, back in the header where it started.
 *
 * ── WHY IT IS HERE AGAIN ────────────────────────────────────────────────────
 * Below `lg` this opens CinematicNavMenu, the same overlay the ⌘K launcher
 * covers on desktop, and it is the ONLY control that does so at those widths —
 * the invariant `tests/single-menu-entry.test.ts` has always pinned. What
 * changed is where it lives. The overlay used to be opened by a fifth tab in a
 * fixed bottom bar, and that bar was removed outright after three consecutive
 * attempts to keep it pinned to the bottom of a phone screen:
 *
 *   1. `calc(100lvh - 100dvh)` in `bottom:` — produced a permanent gap on a
 *      Z Fold 7 and stuttered the whole page during scroll, because dvh/lvh are
 *      recomputed continuously while the browser's chrome animates and each
 *      recomputation invalidated a `:root` custom property.
 *   2. The same value moved to a compositor-only `translateY` — fixed the jank,
 *      kept the wrong number.
 *   3. A measured `visualViewport` version with a pinch-zoom gate, a
 *      geometry-change reset and a 25% clamp (`lib/chrome-lift.ts`) — the most
 *      correct of the three, and the bar still rode up the screen.
 *
 * The owner's call, and the right one: "the bottom part keeps rising up on the
 * phone I've given up fixing it. Let's get rid of it and add the menu bar back
 * to the top." A header button has none of that class of problem, because the
 * TOP edge of the layout viewport does not move when a mobile browser's chrome
 * collapses — only the bottom edge does, which is the entire reason the bar
 * needed compensating and this does not. `position: sticky; top: 0` on
 * NavbarShell is enough on its own.
 *
 * ── WHAT IT HAD TO ABSORB ───────────────────────────────────────────────────
 * The deleted bar carried five targets: Home, Search, Watch, Binder, Menu. Home
 * is the logo immediately to the left of this button; Search is the full-width
 * box on the header's second row plus the Database link; Watch and Binder are
 * both in the overlay this opens (nav-groups.ts), one tap further than before.
 * Nothing became unreachable.
 *
 * The WATCH COUNT badge moved here rather than being dropped, because it is the
 * one thing in that list that is not just navigation — it is the only ambient
 * signal that a price alert has fired, and a visitor who does not open the menu
 * would otherwise never learn there is something to look at. Same data source
 * (`useWatchlist`), same 9+ cap, now on the control that reveals the link.
 */
export function HeaderMenuButton({ className = "" }: { className?: string }) {
  const { setOpen, open } = useMegaMenu();
  const { watched } = useWatchlist();
  const count = watched?.size ?? 0;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`tap-icon relative rounded-lg text-slate-200 transition-colors hover:bg-ink-800 hover:text-white ${className}`}
    >
      <NavIcon name="menu" className="h-5 w-5" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="num absolute right-0.5 top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
      <span className="sr-only">{count > 0 ? `${count} watched cards` : ""}</span>
    </button>
  );
}
