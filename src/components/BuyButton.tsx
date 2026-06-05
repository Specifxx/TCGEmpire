"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BuyButton({
  listingId,
  canBuy,
  reason,
}: {
  listingId: string;
  canBuy: boolean;
  reason?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function buy() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Purchase failed");
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

  if (done) {
    return (
      <span className="chip bg-accent/20 text-accent">✓ Purchased</span>
    );
  }

  if (!canBuy) {
    return (
      <span className="chip bg-ink-800 text-slate-500" title={reason}>
        {reason ?? "Unavailable"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={buy} disabled={loading} className="btn-accent">
        {loading ? "Buying…" : "Buy now"}
      </button>
      {msg && <span className="text-[11px] text-red-400">{msg}</span>}
    </div>
  );
}
