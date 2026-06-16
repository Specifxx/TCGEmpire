"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArbSource } from "@/lib/arbitrage";

// Buy-side / sell-side source pickers (Pricempire-style). Each is a dropdown of
// checkboxes over the market's sources (stores + eBay). Changing a side updates the
// URL so the server re-ranks. Sell defaults to eBay, buy to every store (cheapest).
function sideLabel(side: "buy" | "sell", selected: string[], sources: ArbSource[]): string {
  const stores = sources.filter((s) => !s.isEbay);
  const ebay = sources.find((s) => s.isEbay);
  if (side === "buy" && stores.length > 0 && selected.length === stores.length && stores.every((s) => selected.includes(s.key))) return "Cheapest store";
  if (side === "sell" && ebay && selected.length === 1 && selected[0] === ebay.key) return "eBay";
  if (selected.length === 1) return sources.find((s) => s.key === selected[0])?.name ?? "1 source";
  if (selected.length === sources.length) return "All sources";
  return `${selected.length} sources`;
}

export function ArbitrageFilters({
  sources,
  buy,
  sell,
  sort,
}: {
  sources: ArbSource[];
  buy: string[];
  sell: string[];
  sort: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"buy" | "sell" | null>(null);

  function apply(nextBuy: string[], nextSell: string[]) {
    const params = new URLSearchParams({ buy: nextBuy.join(","), sell: nextSell.join(","), sort });
    router.push(`/tools/arbitrage?${params.toString()}`, { scroll: false });
  }
  function toggle(side: "buy" | "sell", key: string) {
    const cur = side === "buy" ? buy : sell;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    if (!next.length) return; // never allow an empty side
    if (side === "buy") apply(next, sell);
    else apply(buy, next);
  }

  const Picker = ({ side }: { side: "buy" | "sell" }) => {
    const selected = side === "buy" ? buy : sell;
    return (
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{side === "buy" ? "Buy from" : "Sell on"}</div>
        <button
          onClick={() => setOpen(open === side ? null : side)}
          className="mt-0.5 flex min-w-[140px] items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-semibold text-white hover:border-brand-500"
        >
          <span className="truncate">{sideLabel(side, selected, sources)}</span>
          <span className="text-slate-500">▾</span>
        </button>
        {open === side && (
          <>
            <button className="fixed inset-0 z-20 cursor-default" aria-hidden onClick={() => setOpen(null)} />
            <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-2xl">
              {sources.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.key)}
                    onChange={() => toggle(side, s.key)}
                    className="accent-brand-500"
                  />
                  <span className={s.isEbay ? "font-semibold text-sky-300" : "text-slate-200"}>{s.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Picker side="buy" />
      <span className="pb-2 text-lg text-slate-600">→</span>
      <Picker side="sell" />
    </div>
  );
}
