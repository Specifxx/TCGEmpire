"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import type { IndexConstituent } from "@/lib/market-index";
import { cardImageAlt } from "@/lib/image-alt";

type SortKey = "rank" | "name" | "weight" | "price" | "d1" | "d7";
type Dir = "asc" | "desc";

// Default direction when you first click a column (numbers → biggest first).
const DEFAULT_DIR: Record<SortKey, Dir> = { rank: "asc", name: "asc", weight: "desc", price: "desc", d1: "desc", d7: "desc" };

// Interactive constituents table: text filter + gainers/fallers filter, and every
// heading is a sort toggle (click to sort, click again to flip asc/descending).
export function IndexConstituents({ constituents, currency }: { constituents: IndexConstituent[]; currency: string }) {
  const [q, setQ] = useState("");
  const [move, setMove] = useState<"all" | "up" | "down">("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<Dir>("asc");

  const ranked = useMemo(() => constituents.map((c, i) => ({ c, rank: i + 1 })), [constituents]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = ranked.filter(({ c }) => {
      if (move === "up" && !(c.d7pct != null && c.d7pct > 0)) return false;
      if (move === "down" && !(c.d7pct != null && c.d7pct < 0)) return false;
      if (needle && !`${c.name} ${c.setCode} ${c.collectorNumber}`.toLowerCase().includes(needle)) return false;
      return true;
    });

    const val = (r: { c: IndexConstituent; rank: number }): number | string | null => {
      switch (sortKey) {
        case "rank": return r.rank;
        case "name": return r.c.name.toLowerCase();
        case "weight": return r.c.weightPct;
        case "price": return r.c.priceCents;
        case "d1": return r.c.d1pct;
        case "d7": return r.c.d7pct;
      }
    };
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      // Missing values (no price history) always sort to the bottom, either direction.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
      return ((va as number) - (vb as number)) * sign;
    });
  }, [ranked, q, move, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(DEFAULT_DIR[key]);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by card or set…"
            aria-label="Filter constituents"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 sm:min-h-0"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {([["all", "All"], ["up", "▲ Gainers"], ["down", "▼ Fallers"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMove(k)}
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

      <div className="card-surface max-h-[34rem] overflow-auto overscroll-contain">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b [&>th]:border-ink-700 [&>th]:bg-ink-900">
              <SortTh label="#" col="rank" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-4" />
              <SortTh label="Card" col="name" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-2" />
              <SortTh label="Weight" col="weight" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-2" align="right" />
              <SortTh label="Price" col="price" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-2" align="right" />
              <SortTh label="Latest" col="d1" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-2" align="right" />
              <SortTh label="7-day" col="d7" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-4" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No cards match that filter.</td>
              </tr>
            ) : (
              rows.map(({ c, rank }) => (
                <tr key={c.id} className="hover:bg-ink-800">
                  <td className="px-4 py-2 font-bold text-slate-500">
                    {rank <= 3 ? <span className="chip bg-gold/20 text-gold">{rank}</span> : rank}
                  </td>
                  <td className="px-2 py-2">
                    <Link href={cardHref(c)} className="flex min-h-11 items-center gap-2.5">
                      {c.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageThumbUrl} alt={cardImageAlt(c)} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{c.name}</span>
                        <span className="block text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-2 py-2 text-right text-xs text-slate-400">{c.weightPct}%</td>
                  <td className="num px-2 py-2 text-right font-semibold text-white">{formatMoney(c.priceCents, currency)}</td>
                  <PctCell pct={c.d1pct} className="px-2" />
                  <PctCell pct={c.d7pct} className="px-4" />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        Showing {rows.length} of {constituents.length} · click a heading to sort ▲▼.
      </p>
    </div>
  );
}

function SortTh({
  label, col, sortKey, dir, onSort, className = "", align = "left",
}: {
  label: string; col: SortKey; sortKey: SortKey; dir: Dir; onSort: (k: SortKey) => void; className?: string; align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th className={`py-2.5 font-semibold ${className} ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-200 ${active ? "text-brand-300" : ""}`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span className={active ? "opacity-100" : "opacity-30"}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </button>
    </th>
  );
}

function PctCell({ pct, className = "" }: { pct: number | null; className?: string }) {
  const cls = pct == null ? "text-slate-600" : pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-slate-400";
  return (
    <td className={`num py-2 text-right font-semibold ${cls} ${className}`}>
      {pct == null ? "—" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`}
    </td>
  );
}
