"use client";

import { NavIcon } from "./NavIcon";
import { useWatchlist } from "@/lib/use-watchlist";
import { useWatchlistDrawer } from "./WatchlistDrawerProvider";

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
 * A BUTTON THAT OPENS A DRAWER, NOT A LINK TO /watching (2026-09-22, owner:
 * "the watchlist button should open a side tab not go to a separate page").
 * This used to be `<Link href="/watching">`, matching the deleted bottom
 * bar's Watch tab. A full navigation drops whatever the visitor was browsing
 * — browse filters, a card page's scroll position — for a page whose only
 * job is the same grid of CardTiles the drawer now renders in place.
 * /watching itself is unchanged and still the deep-link target (bookmarks,
 * the login redirect) — see WatchlistDrawerProvider's own doc comment.
 *
 * THE COUNT IS THE POINT, not decoration: it is the only ambient signal on the
 * site that a price alert has fired. Same source (`useWatchlist`) and the same
 * 9+ cap the bar's badge used, so nothing about the number changed — only which
 * control carries it.
 *
 * A HEART, AND THE SAME HEART EVERYWHERE ELSE (2026-09-21, owner: "the
 * wishlist icon should be a heart and not a bell"). It was a bell, and before
 * that briefly a star — that star shipped in this control ALONE and was
 * reverted with "it should be the same icon as the watch has", because an icon
 * that disagrees with the control it represents is worse than any particular
 * choice of glyph. So the heart was applied in one pass to every surface that
 * stands for the watchlist: this control, `PriceWatchButton` (the toggle on
 * every card tile and card page), `/watching`'s own heading, the card page's
 * "Watch this price" block and the homepage's "Watching a card?" card.
 *
 * It also ends the confusion the star was reaching for: a heart cannot be
 * mistaken for a notification bell.
 *
 * FILLED WHEN THERE IS SOMETHING IN IT, which is `PriceWatchButton`'s own
 * convention ("filled when watching — the state has to be legible at tile size")
 * and is also what separates this from NotificationBell in the one band where
 * both appear (sm to lg, signed in): this one is filled and carries a count, that
 * one is outline and carries an unread dot.
 *
 * `aria-current` used to light this when `pathname === /watching` (the old
 * link's active-tab styling). There is no route to be "on" any more — the
 * drawer opens over whatever page you're already on — so that's gone; `open`
 * from the shared drawer state drives the same highlight instead.
 */
export function HeaderWatchButton({ className = "" }: { className?: string }) {
  const { watched } = useWatchlist();
  const { open, setOpen } = useWatchlistDrawer();
  const count = watched?.size ?? 0;

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={count > 0 ? `Watchlist, ${count} card${count === 1 ? "" : "s"}` : "Watchlist"}
      className={`tap-icon relative rounded-lg transition-colors hover:bg-ink-800 hover:text-white ${
        open ? "text-brand-400" : "text-slate-200"
      } ${className}`}
    >
      {/* Same two paths PriceWatchButton draws, via the shared icon. `fill`
          carries the "you have some" state exactly as it does there. */}
      <NavIcon name="heart" className="h-5 w-5" fill={count > 0 ? "currentColor" : "none"} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="num absolute right-0.5 top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
