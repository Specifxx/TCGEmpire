"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Test-mode buy. Hits /api/marketplace/buy (settles against the demo wallet) and
// refreshes so stock updates. Real checkout (Stripe) replaces this later.
export function MarketplaceBuyButton({ listingId, label = "Buy (test)" }: { listingId: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/marketplace/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Couldn't complete the purchase");
      } else {
        setMsg("✓ Purchased (test mode)");
        router.refresh();
      }
    } catch {
      setMsg("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={buy} disabled={loading} className="btn-primary w-full text-xs">
        {loading ? "Buying…" : label}
      </button>
      {msg && <p className="mt-1 text-center text-[11px] text-slate-400">{msg}</p>}
    </div>
  );
}
