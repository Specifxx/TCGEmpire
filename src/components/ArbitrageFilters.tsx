"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ArbSource } from "@/lib/arbitrage";
import { hrefFor, type DealFinderParams } from "@/lib/deal-finder-href";

// The Deal Finder's "Buy from" picker. Only the BUY side is selectable — every
// row is measured against TCGplayer's market price, which is fixed. Ticking and
// unticking changes a local draft; nothing reloads until Apply. It used to
// router.push on every checkbox, which made the picker lag a full server round
// trip per click and could cost a cold aggregate per intermediate selection.
// "only" is the exception: a deliberate one-click choice, applied at once.
//
// The URL is built by hrefFor() from the page's FULL parameter set, so applying
// a store change keeps the sort and the "Only my cards" choice and resets only
// the page.
export function buyLabel(selected: readonly string[], sources: readonly ArbSource[], defaults: readonly string[]): string {
  if (selected.length === 0) return "None selected";
  const same = (a: readonly string[]) => a.length === selected.length && a.every((k) => selected.includes(k));
  if (same(defaults)) return "Every store" + (defaults.some((k) => sources.find((s) => s.key === k)?.isEbay) ? " + eBay" : "");
  const stores = sources.filter((s) => !s.isEbay).map((s) => s.key);
  if (stores.length > 0 && same(stores)) return "Stores only";
  if (selected.length === 1) return sources.find((s) => s.key === selected[0])?.name ?? "1 source";
  if (selected.length === sources.length) return "All sources";
  return `${selected.length} sources`;
}

export function ArbitrageFilters({
  sources,
  buy,
  defaultBuy,
  params,
}: {
  sources: ArbSource[];
  buy: string[]; // the effective selection (params.buy, or the default when absent)
  defaultBuy: string[];
  params: DealFinderParams; // everything the current URL carries
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(buy);
  // A navigation (a preset chip, Back) changes `buy` under an open picker.
  const buyKey = buy.join(",");
  useEffect(() => setDraft(buyKey ? buyKey.split(",") : []), [buyKey]);

  function apply(next: string[]) {
    setOpen(false);
    router.push(hrefFor(params, { buy: next, page: 1 }), { scroll: false });
  }

  // A single checkbox click never reaches zero on its own — landing on "no
  // results" from one accidental last-uncheck has no explanation on screen. The
  // explicit, labelled "None" button below is a deliberate action, so it may
  // empty the selection (the results panel then explains why nothing matched).
  function toggle(key: string) {
    const next = draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key];
    if (!next.length) return;
    setDraft(next);
  }

  function selectAll() {
    setDraft(sources.map((s) => s.key));
  }

  function selectNone() {
    setDraft([]);
  }

  function selectOnly(key: string) {
    apply([key]);
  }

  const dirty = draft.length !== buy.length || draft.some((k) => !buy.includes(k));

  return (
    <div className="relative">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stores</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-0.5 flex min-h-11 min-w-[150px] items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:border-brand-500"
      >
        <span className="truncate">{buyLabel(buy, sources, defaultBuy)}</span>
        <span className="text-slate-500">▾</span>
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-64 rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-2xl">
            <div className="mb-1 flex items-center justify-between border-b border-ink-800 px-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{sources.length} sources</span>
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <button type="button" onClick={selectAll} className="text-brand-400 hover:underline">All</button>
                <span className="text-ink-700">·</span>
                <button type="button" onClick={selectNone} className="text-slate-500 hover:text-white hover:underline">None</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {sources.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={draft.includes(s.key)} onChange={() => toggle(s.key)} className="accent-brand-500" />
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
            <div className="mt-1.5 flex items-center justify-end gap-2 border-t border-ink-800 px-1 pt-2">
              <button type="button" onClick={() => { setDraft(buy); setOpen(false); }} className="text-xs font-semibold text-slate-500 hover:text-white">
                Cancel
              </button>
              <button type="button" onClick={() => apply(draft)} disabled={!dirty} className="btn-primary text-xs disabled:opacity-40">
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
