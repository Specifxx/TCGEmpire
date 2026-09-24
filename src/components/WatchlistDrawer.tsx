"use client";

import Link from "next/link";
import { Dialog } from "./ui/Dialog";
import { NavIcon } from "./NavIcon";
import { Watchlist } from "./Watchlist";
import { useMe } from "@/lib/use-me";
import { useWatchlistDrawer } from "./WatchlistDrawerProvider";

// The drawer body: same header copy as the /watching page it replaces as the
// header button's target, same <Watchlist> grid. Signed-out gets a sign-in
// prompt instead of a redirect — a drawer that immediately bounces you to
// /login is a worse surprise than a route redirect would have been, since
// nothing about opening it looked like navigation.
export function WatchlistDrawer() {
  const { open, setOpen } = useWatchlistDrawer();
  const { user, loaded } = useMe();
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onClose={close} placement="right" size="md" z="sheet" labelledBy="watchlist-drawer-title">
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-4 sm:px-5">
        <h2 id="watchlist-drawer-title" className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
          <NavIcon name="heart" className="h-5 w-5 shrink-0 text-brand-400" />
          My watchlist
        </h2>
        <button
          onClick={close}
          aria-label="Close watchlist"
          className="tap-icon rounded-lg text-lg text-slate-400 transition hover:bg-ink-800 hover:text-white"
          data-autofocus
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {!loaded ? null : !user ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <NavIcon name="heart" className="h-8 w-8 text-slate-600" />
            <p className="max-w-xs text-sm text-slate-400">
              Sign in to track cards and get an email when the price drops.
            </p>
            <Link href="/login?next=/watching" onClick={close} className="btn-primary">
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              We email <strong className="text-slate-300">{user.email}</strong> when one of these drops below the
              price you started tracking at — tap the heart on any card to stop watching it.
            </p>
            {/* `list`, not the page's grid: this panel is 448px wide, and the
                grid's viewport breakpoints gave it four 90px columns on every
                desktop. See Watchlist's header. Following a row closes the
                drawer, so the card page is not opened underneath it. */}
            <Watchlist layout="list" onNavigate={close} />
          </>
        )}
      </div>
    </Dialog>
  );
}
