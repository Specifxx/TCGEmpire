"use client";

import { useEffect, useState } from "react";

// The public leaderboard on /giveaway (owner, 2026-11-19): the top 100 entrants by entries, first name and last
// initial only (or "Anonymous entrant"), from the CDN-held /api/giveaway/leaderboard, refreshed every six hours.
type Board = { entrants: number; entries: number; top: { name: string; entries: number }[]; at: string };

export function GiveawayLeaderboard() {
  const [b, setB] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/giveaway/leaderboard")
      .then((r) => r.json())
      .then(setB)
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="mt-3 text-sm opacity-70">The leaderboard didn&apos;t load. Try again later.</p>;
  if (!b) return <div className="mt-3 min-h-[120px] rounded-xl border border-white/10" aria-busy="true" />;
  return (
    <div className="mt-3">
      <p className="text-sm opacity-80">
        {b.entrants.toLocaleString("en-AU")} {b.entrants === 1 ? "person has" : "people have"} entered, holding {b.entries.toLocaleString("en-AU")}{" "}
        {b.entries === 1 ? "entry" : "entries"}. Updated every few hours.
      </p>
      {b.top.length === 0 ? (
        <p className="mt-3 text-sm">No entries yet. Be the first.</p>
      ) : (
        <ol className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 text-sm">
          {b.top.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate">
                <span className="mr-2 inline-block w-7 text-right opacity-60">{i + 1}.</span>
                {r.name}
              </span>
              <span className="shrink-0 font-semibold">
                {r.entries} {r.entries === 1 ? "entry" : "entries"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
