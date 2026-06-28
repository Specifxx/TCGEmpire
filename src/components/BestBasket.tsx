"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { BasketPlan } from "@/lib/basket";

// The Best-Basket tool UI: paste a decklist or use your wishlist, then see the
// cheapest way to buy it all across stores (postage and free-shipping thresholds
// included), grouped by store with direct buy links.
export function BestBasket({ currency }: { currency: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BasketPlan | null>(null);

  async function run(source: "text" | "wishlist") {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source === "wishlist" ? { wishlist: true } : { text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Something went wrong");
        return;
      }
      setPlan(d.plan as BasketPlan);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  const fmt = (c: number) => formatMoney(c, currency);

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <label className="mb-1 block text-xs font-medium text-slate-400">Paste a decklist (or any card list)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"3 Jinx, Loose Cannon\n2 Vayne, Hunter\n1 Yasuo, the Unforgiven"}
          className="input font-mono text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => run("text")} disabled={loading || !text.trim()} className="btn-primary text-sm disabled:opacity-50">
            {loading ? "Optimising…" : "🧺 Find the cheapest basket"}
          </button>
          <button onClick={() => run("wishlist")} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
            Use my wishlist
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}
      </div>

      {plan && (
        <>
          {/* Summary */}
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cheapest landed total</div>
                <div className="font-display text-4xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fmt(plan.itemsCents)} cards + {fmt(plan.shippingCents)} postage · {plan.storeCount} {plan.storeCount === 1 ? "store" : "stores"} · {plan.matchedCards} cards matched
                </div>
              </div>
              {plan.savedCents > 0 && (
                <div className="rounded-lg bg-brand-500/10 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">vs buying each cheapest</div>
                  <div className="text-lg font-extrabold text-brand-400">save {fmt(plan.savedCents)}</div>
                  <div className="text-[10px] text-slate-500">that way needs {plan.naiveStoreCount} stores ({fmt(plan.naiveTotalCents)})</div>
                </div>
              )}
            </div>
          </div>

          {/* Per-store shopping lists */}
          {plan.stores.map((s) => (
            <div key={s.key} className="card-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
                <h3 className="text-sm font-bold text-white">{s.name}</h3>
                <span className="text-xs text-slate-400">
                  {fmt(s.subtotalCents)}
                  {s.freeShipping ? <span className="ml-1 text-brand-400">+ free post</span> : <span className="ml-1 text-slate-500">+ {fmt(s.shippingCents)} post</span>}
                </span>
              </div>
              <ul className="divide-y divide-ink-800">
                {s.lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-8 shrink-0 text-slate-500">×{l.qty}</span>
                    <a href={l.url} target="_blank" rel="sponsored nofollow noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-white hover:text-brand-400">
                      {l.name}
                    </a>
                    <span className="shrink-0 text-slate-300">{fmt(l.unitCents)}{l.qty > 1 ? ` ea` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {plan.unbuyable.length > 0 && (
            <div className="card-surface p-4 text-sm">
              <p className="font-semibold text-amber-300">No in-stock store listing for:</p>
              <p className="mt-1 text-slate-400">
                {plan.unbuyable.map((u) => `${u.qty}× ${u.name}`).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-slate-600">These may be eBay-only right now — check each card page for the full list of options.</p>
            </div>
          )}

          <p className="text-center text-[11px] text-slate-600">
            Postage uses each store&apos;s typical single-card rate and free-shipping threshold (estimates). Always confirm at checkout.
          </p>
        </>
      )}
    </div>
  );
}
