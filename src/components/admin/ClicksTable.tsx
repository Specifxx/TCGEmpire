"use client";

import { useMemo, useState } from "react";

export type ClickRow = {
  retailer: string;
  country: string;
  kind: string;
  path: string | null;
  createdAt: string; // ISO
};

type SortKey = "createdAt" | "retailer" | "path" | "country" | "kind";
type Dir = "asc" | "desc";
const DEFAULT_DIR: Record<SortKey, Dir> = { createdAt: "desc", retailer: "asc", path: "asc", country: "asc", kind: "asc" };

// Detailed, sortable list of individual outbound clicks — which store, which page
// (card/product), which market, and when. Click any heading to sort; click again to
// flip. Also filterable by store/page text.
export function ClicksTable({ events }: { events: ClickRow[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [dir, setDir] = useState<Dir>("desc");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? events.filter((e) => `${e.retailer} ${e.path ?? ""} ${e.country} ${e.kind}`.toLowerCase().includes(needle))
      : events;
    const val = (e: ClickRow): string | number =>
      sortKey === "createdAt" ? new Date(e.createdAt).getTime() : (e[sortKey] ?? "").toString().toLowerCase();
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    });
  }, [events, q, sortKey, dir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(DEFAULT_DIR[k]);
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by store or page…"
          aria-label="Filter clicks"
          className="w-full max-w-xs rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
        <span className="shrink-0 text-xs text-slate-500">{rows.length} shown</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <Th label="Time" col="createdAt" sortKey={sortKey} dir={dir} onSort={toggle} />
              <Th label="Store" col="retailer" sortKey={sortKey} dir={dir} onSort={toggle} />
              <Th label="Page (card / product)" col="path" sortKey={sortKey} dir={dir} onSort={toggle} />
              <Th label="Market" col="country" sortKey={sortKey} dir={dir} onSort={toggle} />
              <Th label="Type" col="kind" sortKey={sortKey} dir={dir} onSort={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No clicks match.</td></tr>
            ) : (
              rows.map((e, i) => (
                <tr key={i} className="hover:bg-ink-800/50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmtTime(e.createdAt)}</td>
                  <td className="px-3 py-2 font-medium text-white">{e.retailer}</td>
                  <td className="px-3 py-2">
                    {e.path ? (
                      <a href={e.path} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{e.path}</a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{e.country}</td>
                  <td className="px-3 py-2 text-slate-400">{e.kind}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label, col, sortKey, dir, onSort,
}: {
  label: string; col: SortKey; sortKey: SortKey; dir: Dir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-3 py-2.5 font-semibold">
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-200 ${active ? "text-brand-300" : ""}`}>
        {label}
        <span className={active ? "opacity-100" : "opacity-30"}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </button>
    </th>
  );
}
