"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { CONDITION_KEYS, conditionInfo } from "@/lib/constants";
import { dollarsToCents, formatAUD } from "@/lib/format";

// ---- Place a buy order (bid) --------------------------------------------------
export function PlaceBuyOrderForm({
  cardId,
  marketPriceCents,
  signedIn,
}: {
  cardId: string;
  marketPriceCents: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState("NM");
  const [isFoil, setIsFoil] = useState(false);
  const [price, setPrice] = useState(((marketPriceCents * 0.9) / 100).toFixed(2));
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!signedIn) {
    return (
      <Link href="/login" className="btn-primary w-full">
        Sign in to place a buy order
      </Link>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full">
        + Place a buy order
      </button>
    );
  }

  const total = dollarsToCents(price) * (parseInt(quantity, 10) || 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/buy-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          condition,
          isFoil,
          maxPriceCents: dollarsToCents(price),
          quantity: parseInt(quantity, 10) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not place buy order");
        setLoading(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">New buy order</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-white"
        >
          Cancel
        </button>
      </div>

      <label className="mb-1 block text-xs text-slate-400">Desired condition</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["ANY", ...CONDITION_KEYS].map((k) => {
          const active = condition === k;
          const color = k === "ANY" ? "#8b8f9a" : conditionInfo(k).color;
          return (
            <button
              type="button"
              key={k}
              onClick={() => setCondition(k)}
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{
                borderColor: active ? color : "#222a3d",
                backgroundColor: active ? `${color}22` : "transparent",
                color: active ? color : "#9aa0aa",
              }}
            >
              {k === "ANY" ? "Any" : k}
            </button>
          );
        })}
      </div>

      <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={isFoil}
          onChange={(e) => setIsFoil(e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
        Must be foil ✦
      </label>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-slate-400">Bid each (AUD)</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">$</span>
            <input
              type="number"
              step="0.05"
              min="0.25"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input pl-6"
              required
            />
          </div>
        </div>
        <div className="w-20">
          <label className="mb-1 block text-xs text-slate-400">Qty</label>
          <input
            type="number"
            min="1"
            max="99"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {formatAUD(total)} will be held from your wallet until filled or cancelled.
      </p>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary mt-3 w-full">
        {loading ? "Placing…" : `Place bid · ${formatAUD(total)}`}
      </button>
    </form>
  );
}

// ---- Seller fills a buy order -------------------------------------------------
export function SellToBidButton({
  buyOrderId,
  canSell,
  reason,
}: {
  buyOrderId: string;
  canSell: boolean;
  reason?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return <span className="chip bg-accent/20 text-accent">✓ Sold</span>;
  if (!canSell) {
    return (
      <span className="chip bg-ink-800 text-slate-500" title={reason}>
        {reason ?? "Unavailable"}
      </span>
    );
  }

  async function sell() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/buy-orders/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyOrderId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Failed");
        setLoading(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setMsg("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={sell} disabled={loading} className="btn-accent">
        {loading ? "Selling…" : "Sell to buyer"}
      </button>
      {msg && <span className="text-[11px] text-red-400">{msg}</span>}
    </div>
  );
}

// ---- Cancel an open buy order -------------------------------------------------
export function CancelBuyOrderButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch(`/api/buy-orders?id=${id}`, { method: "DELETE" });
        router.refresh();
        setLoading(false);
      }}
      className="chip bg-ink-800 text-red-400 hover:bg-red-500/10"
    >
      {loading ? "…" : "Cancel & refund"}
    </button>
  );
}
