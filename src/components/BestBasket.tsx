"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { ebaySearchUrl } from "@/lib/affiliate";
import { pickPrice } from "@/lib/country";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { CardSearch, type SearchCard } from "./CardSearch";
import type { BasketPlan } from "@/lib/basket";

interface PickedLine {
  card: SearchCard;
  qty: number;
}

// The Best-Basket tool UI. Primary flow: search for a card, pick the exact
// printing, set a quantity — build up a list, then price it. Pasting a raw
// decklist is kept as a secondary "advanced" option for anyone who already
// has a list in TCGplayer Mass-Entry format (deck import links, etc.) rather
// than picking cards one at a time.
export function BestBasket({ currency, initialList }: { currency: string; initialList?: string }) {
  const { country } = useCountry();
  const [picked, setPicked] = useState<PickedLine[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState(initialList ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BasketPlan | null>(null);

  async function runLines(lines: { cardId: string; qty: number }[]) {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
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

  async function runPasted(listText: string) {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: listText }),
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

  // A list arriving via ?list= (e.g. "Price this deck in Best Basket" from a
  // deck page) runs automatically — someone who followed that link is trying
  // to SEE a result, not re-paste a list they already had priced elsewhere.
  // Guarded to fire once, and only when a real list was actually handed in.
  // The paste panel opens too, since the auto-priced list lives there.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !initialList?.trim()) return;
    autoRan.current = true;
    setShowPaste(true);
    void runPasted(initialList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (c: number) => formatMoney(c, currency);

  function addCard(c: SearchCard) {
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.card.id === c.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(99, next[i].qty + 1) };
        return next;
      }
      return [...prev, { card: c, qty: 1 }];
    });
  }

  function setQty(cardId: string, qty: number) {
    setPicked((prev) => prev.map((p) => (p.card.id === cardId ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p)));
  }

  function removeCard(cardId: string) {
    setPicked((prev) => prev.filter((p) => p.card.id !== cardId));
  }

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <label className="mb-1 block text-xs font-medium text-slate-400">Search for a card and add it to your basket</label>
        <CardSearch placeholder="e.g. Jinx, Loose Cannon" onPick={addCard} />

        {picked.length > 0 && (
          <ul className="mt-3 divide-y divide-ink-800 rounded-lg border border-ink-800">
            {picked.map((p) => (
              <li key={p.card.id} className="flex items-center gap-3 p-2.5">
                {p.card.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.card.imageThumbUrl} alt={cardImageAlt(p.card)} width={28} height={40} className="h-10 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-10 w-7 shrink-0 rounded bg-ink-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{cardDisplayName(p.card.name, p.card)}</div>
                  <div className="truncate text-xs text-slate-500">
                    {p.card.setCode} · {p.card.collectorNumber}
                    {(() => {
                      const c = pickPrice(p.card, country);
                      return c != null ? <> · <span className="text-accent">{fmt(c)}</span></> : null;
                    })()}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={p.qty}
                  onChange={(e) => setQty(p.card.id, parseInt(e.target.value, 10) || 1)}
                  aria-label={`Quantity for ${p.card.name}`}
                  className="input w-14 shrink-0 py-1 text-center text-sm"
                />
                <button
                  onClick={() => removeCard(p.card.id)}
                  aria-label={`Remove ${p.card.name}`}
                  className="shrink-0 text-slate-600 hover:text-rose-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void runLines(picked.map((p) => ({ cardId: p.card.id, qty: p.qty })))}
            disabled={loading || picked.length === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {loading ? "Optimising…" : "🧺 Find the cheapest basket"}
          </button>
          <button type="button" onClick={() => setShowPaste((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
            {showPaste ? "Hide" : "Advanced: paste a decklist instead"}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}

        {showPaste && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <label className="mb-1 block text-xs font-medium text-slate-400">Paste a decklist (or any card list)</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"3 Jinx, Loose Cannon\n2 Vayne, Hunter\n1 Yasuo, the Unforgiven"}
              className="input font-mono text-sm"
            />
            <div className="mt-3">
              <button
                onClick={() => void runPasted(pasteText)}
                disabled={loading || !pasteText.trim()}
                className="btn-ghost text-sm disabled:opacity-50"
              >
                {loading ? "Optimising…" : "🧺 Find the cheapest basket"}
              </button>
            </div>
          </div>
        )}
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
              {/* Each card is now a live eBay search. The old copy named eBay as
                  the answer — "These may be eBay-only right now" — and then asked
                  the reader to open each card page one at a time to find it, in
                  slate-600. Having identified both the need and the marketplace
                  that fills it, sending them off to look it up themselves was the
                  one thing left to fix. */}
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                {plan.unbuyable.map((u, i) => (
                  <li key={i}>
                    <OutboundLink
                      href={ebaySearchUrl(country, `${u.name} Riftbound`, "basket-unbuyable")}
                      retailer="ebay_basket"
                      country={country}
                      className="font-medium text-brand-400 hover:underline"
                    >
                      {u.qty}× {u.name} →
                    </OutboundLink>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                No tracked store has these in stock right now — eBay usually carries the long tail.
              </p>
              <AffiliateDisclosure partner="ebay" tight />
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
