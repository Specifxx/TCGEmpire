"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { CardsIcon } from "@/components/icons/HomeIcons";

// Riftle keeps its win-streak in localStorage under this key (see
// components/Riftle.tsx's private KEY_STATS/Stats). Read-only, and duplicated
// rather than imported: Riftle.tsx's constants aren't exported, and importing
// the game component itself here would pull its whole client bundle into a
// homepage teaser that only needs one number.
const RIFTLE_STATS_KEY = "rc_riftle_stats";

function readRiftleStreak(): number {
  try {
    const v = JSON.parse(localStorage.getItem(RIFTLE_STATS_KEY) || "") as { streak?: unknown } | null;
    const n = Number(v?.streak);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Return-visit hooks — Riftle, the pack simulator, and price alerts — moved up
// to directly after "Most popular cards" (were buried near the bottom). A
// client component (not plain server-rendered Links, like this row used to be)
// for two reasons: the Riftle streak badge needs localStorage, and every CTA
// here wants its own analytics event.
export function ReturnVisitCards({ newestSetName }: { newestSetName?: string }) {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    setStreak(readRiftleStreak());
  }, []);

  return (
    <>
      <Link
        href="/games/pack-sim"
        onClick={() => track("packsim_cta_click", { source: "home" })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-2xl leading-none" aria-hidden>
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Riftbound pack opening simulator</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Rip free virtual {newestSetName ?? "Riftbound"} packs — real pack odds, live prices on every pull.
          </p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Open →</span>
      </Link>

      <Link
        href="/riftle"
        onClick={() => track("riftle_cta_click", { source: "home", streak })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <CardsIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-white">
            Play today&apos;s Riftle
            {streak > 0 && <span className="chip bg-gold/20 text-[11px] font-bold text-gold">🔥 Day {streak} streak</span>}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">Guess the daily Riftbound card in 8 tries — a new puzzle every day.</p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Play →</span>
      </Link>

      <Link
        href="/alerts"
        onClick={() => track("alerts_cta_click", { source: "home" })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-2xl leading-none" aria-hidden>
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Watching a card?</h2>
          <p className="mt-0.5 text-sm text-slate-400">Get an alert the moment its price drops — free, no spam.</p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Start →</span>
      </Link>
    </>
  );
}
