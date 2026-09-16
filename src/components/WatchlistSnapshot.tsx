"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/use-watchlist";

// Client island beside the dashboard's server-rendered portfolio card — the
// count needs a signed-in fetch (/api/alerts/watchlist), which the dashboard
// route itself doesn't make (see egress rules at the top of lib/db.ts; the
// shared use-watchlist.ts store already does this fetch for the bell/tiles
// elsewhere on the page, so this reads it rather than adding a new one).
export function WatchlistSnapshot() {
  const { watched, loaded } = useWatchlist();
  const count = watched?.size ?? 0;

  return (
    <div className="card-surface flex flex-wrap items-center justify-between gap-4 border-l-2 border-brand-500 p-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Watching</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="num text-3xl font-extrabold text-white">{loaded ? count : "—"}</span>
          <span className="text-sm text-slate-400">{count === 1 ? "card" : "cards"}</span>
        </div>
      </div>
      <Link href="/watching" className="btn-ghost text-sm">
        {count > 0 ? "Open watchlist →" : "Start watching →"}
      </Link>
    </div>
  );
}
