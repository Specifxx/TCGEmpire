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
  if (selected.length === 0) return "None selected";
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

  function apply(next: string[]) {
    const params = new URLSearchParams({ buy: next.join(","), sort, ...(view ? { view } : {}) });
    router.push(`/tools/deal-finder?${params.toString()}`, { scroll: false });
  }

  // A single checkbox click never reaches zero on its own — that guard stays,
  // since landing on "no results" from one accidental last-uncheck has no
  // explanation on screen. The explicit, labelled "None" button below is a
  // different thing: a deliberate action, so it's allowed to zero the
  // selection (the results panel then explains why nothing matched).
  function toggle(key: string) {
    const next = buy.includes(key) ? buy.filter((k) => k !== key) : [...buy, key];
    if (!next.length) return;
    apply(next);
  }

  function selectAll() {
    apply(sources.map((s) => s.key));
  }

  function selectNone() {
    apply([]);
  }

  function selectOnly(key: string) {
    apply([key]);
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
            <div className="absolute z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-2xl">
              <div className="mb-1 flex items-center justify-between border-b border-ink-800 px-1 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{sources.length} sources</span>
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <button type="button" onClick={selectAll} className="text-brand-400 hover:underline">All</button>
                  <span className="text-ink-700">·</span>
                  <button type="button" onClick={selectNone} className="text-slate-500 hover:text-white hover:underline">None</button>
                </div>
              </div>
              {sources.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={buy.includes(s.key)} onChange={() => toggle(s.key)} className="accent-brand-500" />
                    <span className={`truncate ${s.isEbay ? "font-semibold text-sky-300" : "text-slate-200"}`}>{s.name}</span>
                  </span>
                  {/* Always visible, not hover-gated — a hover-only reveal would
                      make this unreachable on a touch device. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault(); // don't also toggle the checkbox under it
                      selectOnly(s.key);
                    }}
                    className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-600 hover:text-brand-400"
                  >
                    only
                  </button>
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
