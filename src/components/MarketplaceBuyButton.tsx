"use client";

import { useState } from "react";

// Single-listing "Buy now" — starts real Stripe Checkout for one item (the demo
// wallet path this used to hit has been removed; see /api/marketplace/buy, now
// deleted). Redirects straight to the hosted Stripe payment page.
export function MarketplaceBuyButton({ listingId, label = "Buy now" }: { listingId: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/marketplace/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ listingId, quantity: 1 }] }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setMsg(data.error ?? "Couldn't start checkout");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setMsg("Network error — try again");
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={buy} disabled={loading} className="btn-primary w-full text-xs">
        {loading ? "Starting checkout…" : label}
      </button>
      {msg && <p className="mt-1 text-center text-[11px] text-slate-400">{msg}</p>}
    </div>
  );
}
