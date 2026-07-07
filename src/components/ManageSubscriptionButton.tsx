"use client";

import { useState } from "react";

// Opens the Stripe Billing customer portal (update card / view invoices / cancel).
// On error — e.g. the portal isn't enabled in Stripe yet — it shows a fallback note
// rather than dead-ending.
export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/portal", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't open billing");
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button onClick={open} disabled={busy} className="btn-ghost disabled:opacity-50">
        {busy ? "Opening…" : "Manage subscription"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-rose-400">
          {error}
        </span>
      )}
    </span>
  );
}
