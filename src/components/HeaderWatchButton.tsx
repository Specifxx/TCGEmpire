"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { useWatchlist } from "@/lib/use-watchlist";

/**
 * The watchlist, as its own header control rather than a badge on the menu.
 *
 * WHY IT IS SEPARATE. When the bottom tab bar was deleted, its Watch tab's
 * count badge was folded onto HeaderMenuButton to keep the signal alive. That
 * conflated two unrelated things on one target: "open the navigation" and "you
 * have N watched cards, one of which may have moved". A badge belongs to the
 * thing it counts — tapping it has to reach the watchlist, not a menu you then
 * have to navigate — and a menu button that sometimes wears a number is a menu
 * button that reads as unread navigation. Reported as: "the watchlist and the
 * menu should be separate."
 *
 * So this is a LINK, straight to /watching, which is what the deleted Watch tab
 * was. HeaderMenuButton is back to being only a menu.
 *
 * THE COUNT IS THE POINT, not decoration: it is the only ambient signal on the
 * site that a price alert has fired. Same source (`useWatchlist`) and the same
 * 9+ cap the bar's badge used, so nothing about the number changed — only which
 * control carries it.
 *
 * THE BELL, BECAUSE THAT IS WHAT THE WATCHLIST IS EVERYWHERE ELSE.
 * `PriceWatchButton` (the watch toggle on every card tile and card page) draws a
 * bell, and `/watching`'s own heading is `<NavIcon name="bell">`. This shipped
 * as a star for one release on the reasoning that NavUser's NotificationBell
 * also uses a bell and two of them would be confusable — which was solving the
 * wrong problem: "it should be the same icon as the watch has", and an icon that
 * disagrees with the control it represents is worse than two bells that differ
 * in state. The star is gone.
 *
 * FILLED WHEN THERE IS SOMETHING IN IT, which is `PriceWatchButton`'s own
 * convention ("filled when watching — the state has to be legible at tile size")
 * and is also what separates this from NotificationBell in the one band where
 * both appear (sm to lg, signed in): this one is filled and carries a count, that
 * one is outline and carries an unread dot.
 *
 * `aria-current` lights it on /watching itself, matching how the deleted bar
 * marked its active tab.
 */
export function HeaderWatchButton({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { watched } = useWatchlist();
  const count = watched?.size ?? 0;
  const active = pathname?.startsWith("/watching");

  return (
    <Link
      href="/watching"
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `Watchlist, ${count} card${count === 1 ? "" : "s"}` : "Watchlist"}
      className={`tap-icon relative rounded-lg transition-colors hover:bg-ink-800 hover:text-white ${
        active ? "text-brand-400" : "text-slate-200"
      } ${className}`}
    >
      {/* Same two paths PriceWatchButton draws, via the shared icon. `fill`
          carries the "you have some" state exactly as it does there. */}
      <NavIcon name="bell" className="h-5 w-5" fill={count > 0 ? "currentColor" : "none"} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="num absolute right-0.5 top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
