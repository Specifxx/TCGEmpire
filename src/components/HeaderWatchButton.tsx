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
 * A STAR, NOT A BELL, and that is not cosmetic. NavUser renders a
 * NotificationBell from `sm` up for signed-in visitors, so a bell here would
 * have put two near-identical bells side by side in a row where every control
 * is icon-only. The deleted bottom bar could use a bell for its Watch tab
 * because that tab carried the word "Watch" underneath it; this has no label to
 * disambiguate it. See NavIcon's "star" entry.
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
      <NavIcon name="star" className="h-5 w-5" />
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
