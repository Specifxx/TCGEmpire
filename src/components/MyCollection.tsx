"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { CONDITIONS, CONDITION_KEYS } from "@/lib/constants";
import { useCountry } from "./CountryProvider";

type CollCard = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsNz: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
};
type Item = {
  id: string;
  cardId: string;
  condition: string;
  isFoil: boolean;
  quantity: number;
  note: string | null;
  card: CollCard;
};

// "My Collection" — a personal, valued list of cards the user owns. Separate from
// the wishlist (want) and decks (play). Populated by the "Add to collection" button
// in the card pop-up. Shows the live value of the whole collection.
export function MyCollection() {
  const { fmt, price } = useCountry();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);

  const summary = useMemo(() => {
    if (!items) return { distinct: 0, total: 0, value: 0, priced: false };
    let total = 0, value = 0, priced = false;
    for (const it of items) {
      total += it.quantity;
      const p = price(it.card);
      if (p != null) { value += p * it.quantity; priced = true; }
    }
    return { distinct: items.length, total, value, priced };
  }, [items, price]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/collection/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.merged) {
        const fresh = await fetch("/api/collection").then((r) => r.json()).catch(() => null);
        if (fresh?.items) setItems(fresh.items);
        return;
      }
      setItems((prev) => {
        if (!prev) return prev;
        if (data.deleted) return prev.filter((x) => x.id !== id);
        if (data.item) return prev.map((x) => (x.id === id ? { ...x, ...data.item } : x));
        return prev;
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/collection/${id}`, { method: "DELETE" });
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="collection" className="card-surface mt-5 scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">My Collection</h2>
          <p className="text-sm text-slate-400">
            {items == null
              ? "Loading…"
              : items.length === 0
              ? "Your collection is empty."
              : `${summary.distinct} ${summary.distinct === 1 ? "card" : "cards"} · ${summary.total} total${summary.priced ? ` · worth ~${fmt(summary.value)}` : ""}`}
          </p>
        </div>
        <Link href="/browse" className="btn-primary">Browse cards →</Link>
      </div>

      {items != null && items.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Open any card and tap <span className="font-semibold text-brand-300">＋ Add to collection</span> to start tracking what you own — we&apos;ll value the whole thing live as prices move. It&apos;s separate from your{" "}
          <Link href="/wishlist" className="text-brand-400 hover:underline">wishlist</Link>.
        </p>
      )}

      {items != null && items.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-800">
          {items.map((it) => {
            const unit = price(it.card);
            const cond = CONDITIONS[it.condition];
            return (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <Link href={cardHref(it.card as any)} className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                  {it.card.imageThumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.card.imageThumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={cardHref(it.card as any)} className="block truncate text-sm font-semibold text-white hover:underline">
                    {cardDisplayName(it.card.name, it.card)}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{it.card.setCode} · {it.card.collectorNumber}</span>
                    {it.isFoil && <span className="chip bg-gold/15 text-gold">✦ Foil</span>}
                    {unit != null && <span>· {fmt(unit)} ea</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={it.condition}
                      onChange={(e) => patch(it.id, { condition: e.target.value })}
                      disabled={busy === it.id}
                      className="rounded-md border border-ink-700 bg-ink-900 px-1.5 py-1 text-xs text-white"
                      style={{ color: cond?.color }}
                      aria-label="Condition"
                    >
                      {CONDITION_KEYS.map((k) => (
                        <option key={k} value={k} style={{ color: "#fff" }}>{CONDITIONS[k].full}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => patch(it.id, { isFoil: !it.isFoil })}
                      disabled={busy === it.id}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${it.isFoil ? "bg-gold/20 text-gold" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      ✦ Foil
                    </button>
                    <div className="flex items-center overflow-hidden rounded-md border border-ink-700">
                      <button onClick={() => patch(it.id, { quantity: Math.max(0, it.quantity - 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Decrease quantity">−</button>
                      <span className="min-w-8 px-2 text-center text-sm font-semibold text-white">{it.quantity}</span>
                      <button onClick={() => patch(it.id, { quantity: Math.min(999, it.quantity + 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Increase quantity">+</button>
                    </div>
                    <button onClick={() => remove(it.id)} disabled={busy === it.id} className="ml-auto text-xs text-slate-500 hover:text-red-400">Remove</button>
                  </div>
                </div>

                <div className="shrink-0 self-start text-right">
                  <div className="text-sm font-bold text-accent">{unit != null ? fmt(unit * it.quantity) : "—"}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
