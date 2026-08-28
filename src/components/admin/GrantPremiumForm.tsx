"use client";

import { useState } from "react";

// Admin manual Premium grant (accounts page). Posts to /api/admin/grant-premium;
// when the page is opened via the ?key= link rather than an admin session, the
// key is passed through so the API's dual gate accepts it — same pattern as the
// other admin tools.
export function GrantPremiumForm({ adminKey }: { adminKey?: string }) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("365");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function grant() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/grant-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, days: Number(days), ...(adminKey ? { key: adminKey } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setResult(`✗ ${data?.error ?? `failed (${res.status})`}`);
      } else {
        setResult(`✓ ${data.email} is premium until ${new Date(data.premiumUntil).toLocaleDateString()}`);
        setEmail("");
      }
    } catch {
      setResult("✗ network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-surface p-4">
      <h2 className="text-sm font-extrabold text-white">Grant premium</h2>
      <p className="mt-1 text-xs text-slate-500">
        Stacks onto any current entitlement and can&apos;t be clobbered by a later Stripe renewal
        (extend-only stamping). Every grant is logged.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="account email"
          className="input max-w-xs"
          disabled={busy}
        />
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={1}
          max={1830}
          className="input w-24"
          aria-label="days"
          disabled={busy}
        />
        <span className="text-xs text-slate-500">days</span>
        <button type="button" onClick={grant} disabled={busy || !email || !Number(days)} className="btn-primary text-sm">
          {busy ? "Granting…" : "Grant"}
        </button>
      </div>
      {result && <p className={`mt-2 text-xs ${result.startsWith("✓") ? "text-brand-400" : "text-rose-400"}`}>{result}</p>}
    </div>
  );
}
