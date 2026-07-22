"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArbSource } from "@/lib/arbitrage";

// Buy-side source picker, shared by both flip views. Sell is always fixed (eBay
// for the main flip view, TCGplayer's reference price for the other), so only
// the BUY side is selectable — and it already includes the RiftCompare
// Marketplace alongside every other store. Defaults to every store (cheapest
// store). Changing it updates the URL so the server re-ranks.
function buyLabel(selected: string[], sources: ArbSource[]): string {
  const stores = sources.filter((s) => !s.isEbay);
  if (stores.length > 0 && selected.length === stores.length && stores.every((s) => selected.includes(s.key))) return "Cheapest store";
  if (selected.length === 1) return sources.find((s) => s.key === selected[0])?.name ?? "1 source";
  if (selected.length === sources.length) return "All sources";
  return `${selected.length} sources`;
}

export function ArbitrageFilters({
  sources,
  buy,
  sellLabel,
  sort,
  view,
}: {
  sources: ArbSource[];
  buy: string[];
  sellLabel: string; // the fixed sell side's display name (not selectable)
  sort: string;
  view?: "tcg"; // omit for the default "Worth more on eBay" view
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    const next = buy.includes(key) ? buy.filter((k) => k !== key) : [...buy, key];
    if (!next.length) return; // never allow an empty buy side
    const params = new URLSearchParams({ buy: next.join(","), sort, ...(view ? { view } : {}) });
    router.push(`/tools/arbitrage?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Buy from</div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 flex min-w-[150px] items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:border-brand-500"
        >
          <span className="truncate">{buyLabel(buy, sources)}</span>
          <span className="text-slate-500">▾</span>
        </button>
        {open && (
          <>
            <button className="fixed inset-0 z-20 cursor-default" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-2xl">
              {sources.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                  <input type="checkbox" checked={buy.includes(s.key)} onChange={() => toggle(s.key)} className="accent-brand-500" />
                  <span className={s.isEbay ? "font-semibold text-sky-300" : "text-slate-200"}>{s.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <span className="pb-2 text-lg text-slate-600">→</span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sell on</div>
        <div className="mt-0.5 flex min-w-[110px] items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-300">
          {sellLabel}
        </div>
      </div>
    </div>
  );
}
