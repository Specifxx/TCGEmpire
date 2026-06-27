"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CardImage } from "./CardImage";
import {
  CONDITION_KEYS,
  CONDITION_MULTIPLIER,
  conditionInfo,
  rarityInfo,
} from "@/lib/constants";
import { dollarsToCents, formatAUD } from "@/lib/format";

export interface SellCard {
  id: string;
  name: string;
  domain: string;
  type: string;
  rarity: string;
  energyCost: number | null;
  might: number | null;
  collectorNumber: string;
  artSeed: number;
  orientation: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  blurDataUrl: string | null;
  marketPriceCents: number;
}

export function SellForm({ cards }: { cards: SellCard[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SellCard | null>(null);
  const [condition, setCondition] = useState("NM");
  const [isFoil, setIsFoil] = useState(false);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return cards
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.collectorNumber.includes(q) ||
          c.type.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, cards]);

  // Suggested price = reference price adjusted for condition (and foil premium).
  const suggestedCents = selected
    ? Math.round(
        selected.marketPriceCents *
          (CONDITION_MULTIPLIER[condition] ?? 1) *
          (isFoil ? 2 : 1)
      )
    : 0;

  function choose(c: SellCard) {
    setSelected(c);
    setQuery("");
    setPrice(((c.marketPriceCents / 100) * (CONDITION_MULTIPLIER["NM"] ?? 1)).toFixed(2));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError("Pick a card first");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selected.id,
          condition,
          isFoil,
          priceCents: dollarsToCents(price),
          quantity: parseInt(quantity, 10) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create listing");
        setLoading(false);
        return;
      }
      router.push(`/card/${data.cardId}`);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form onSubmit={submit} className="card-surface flex flex-col gap-5 p-5">
        {/* Card picker */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Card
          </label>
          {selected ? (
            <div className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900 p-3">
              <div>
                <div className="font-semibold text-white">{selected.name}</div>
                <div className="text-xs text-slate-500">
                  {selected.collectorNumber} · {selected.type} ·{" "}
                  <span style={{ color: rarityInfo(selected.rarity).color }}>
                    {selected.rarity}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-brand-400 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search for a card to list…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-700 bg-ink-850 shadow-card">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => choose(c)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ink-800"
                      >
                        <span className="text-sm text-white">{c.name}</span>
                        <span className="text-xs text-slate-500">
                          {c.collectorNumber} ·{" "}
                          {formatAUD(c.marketPriceCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Condition */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Condition
          </label>
          <div className="flex flex-wrap gap-2">
            {CONDITION_KEYS.map((k) => {
              const c = conditionInfo(k);
              const active = condition === k;
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => setCondition(k)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    borderColor: active ? c.color : "#222a3d",
                    backgroundColor: active ? `${c.color}22` : "transparent",
                    color: active ? c.color : "#9aa0aa",
                  }}
                  title={c.full}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Foil */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isFoil}
            onChange={(e) => setIsFoil(e.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
          This card is a foil ✦
        </label>

        {/* Price + quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Price (AUD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                $
              </span>
              <input
                className="input pl-7"
                type="number"
                step="0.05"
                min="0.25"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => setPrice((suggestedCents / 100).toFixed(2))}
                className="mt-1 text-xs text-brand-400 hover:underline"
              >
                Suggested: {formatAUD(suggestedCents)} (use)
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Quantity
            </label>
            <input
              className="input"
              type="number"
              min="1"
              max="99"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Listing…" : "List card for sale"}
        </button>
      </form>

      {/* Live preview */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="card-surface p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preview
          </p>
          {selected ? (
            <CardImage card={selected} isFoil={isFoil} full className="aspect-[5/7] w-full" />
          ) : (
            <div className="grid aspect-[5/7] place-items-center rounded-lg border border-dashed border-ink-700 text-center text-sm text-slate-500">
              Pick a card to preview it here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
