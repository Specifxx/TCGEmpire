"use client";

import { useMemo, useState } from "react";
import type { Mover, PriceMovers } from "@/lib/price-history";
import { MoverRow } from "./PriceWatch";

// One searchable list of this week's movers, sortable by % gain or loss
// (visitor feedback, 2026-11-18: "sort by % of gain or loss, better than just
// toggling the gainers or losers button"). No sparkline, so names keep
// their width on phones; the panels above keep theirs. It reads the same rows the three
// panels above already got from getPriceMovers (risers and drops, up to 50
// each): no new query, nothing fetched, and every % is the card's own 7-day move.
type Sort = "gain" | "loss" | "move" | "price-desc" | "price-asc" | "name";
const SORTS: [Sort, string][] = [
  ["gain", "Biggest % gain"],
  ["loss", "Biggest % loss"],
  ["move", "Biggest % move, up or down"],
  ["price-desc", "Price: high to low"],
  ["price-asc", "Price: low to high"],
  ["name", "Name A–Z"],
];

export function MoversTable({ movers, currency }: { movers: PriceMovers; currency: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("move");
  const [move, setMove] = useState<"all" | "up" | "down">("all");

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: Mover[] = [];
    for (const m of [...movers.spiking, ...movers.plummeting]) {
      if (m.pct === 0 || seen.has(m.card.id)) continue;
      seen.add(m.card.id);
      out.push(m);
    }
    return out;
  }, [movers]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((m) => {
      if (move === "up" && m.pct <= 0) return false;
      if (move === "down" && m.pct >= 0) return false;
      return !needle || `${m.card.name} ${m.card.setCode} ${m.card.collectorNumber}`.toLowerCase().includes(needle);
    });
    const by: Record<Sort, (a: Mover, b: Mover) => number> = {
      gain: (a, b) => b.pct - a.pct,
      loss: (a, b) => a.pct - b.pct,
      move: (a, b) => Math.abs(b.pct) - Math.abs(a.pct),
      "price-desc": (a, b) => b.nowCents - a.nowCents,
      "price-asc": (a, b) => a.nowCents - b.nowCents,
      name: (a, b) => a.card.name.localeCompare(b.card.name),
    };
    return list.sort(by[sort]);
  }, [all, q, move, sort]);

  if (all.length < 2) return null;

  // A Risers/Drops tap on the default order puts the biggest of that side first.
  function pickMove(k: "all" | "up" | "down") {
    setMove(k);
    if (sort === "move" && k !== "all") setSort(k === "up" ? "gain" : "loss");
  }

  return (
    <section id="all-movers" className="scroll-mt-40 xl:scroll-mt-36">
      <h2 className="mb-1 text-xl font-extrabold text-white">Search and sort every mover</h2>
      <p className="mb-3 text-sm text-slate-400">
        The {all.length} cards above in one list, by their 7-day % change. Tap a card for its price chart.
      </p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
          {/* text-base below sm: iOS Safari zooms in on a field under 16px. */}
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by card or set…"
            aria-label="Search the movers"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-base text-white placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:min-h-0 sm:text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="shrink-0 font-semibold">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort the movers"
            className="min-h-11 w-full min-w-0 rounded-lg border border-ink-700 bg-ink-900 px-2 text-base text-white focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:min-h-0 sm:w-auto sm:py-2 sm:text-sm"
          >
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {([["all", "All"], ["up", "▲ Risers"], ["down", "▼ Drops"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => pickMove(k)}
              aria-pressed={move === k}
              className={`inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold transition-colors sm:min-h-0 sm:py-1.5 ${
                move === k ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"
              } ${k === "up" && move === k ? "text-up" : ""} ${k === "down" && move === k ? "text-down" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-surface max-h-[34rem] overflow-auto overscroll-contain px-4">
        {rows.length ? (
          <ul className="divide-y divide-ink-800">
            {rows.map((m) => (
              <MoverRow key={m.card.id} m={m} up={m.pct > 0} currency={currency} spark={false} buy />
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No cards match that search.</p>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">Showing {rows.length} of {all.length}.</p>
    </section>
  );
}
