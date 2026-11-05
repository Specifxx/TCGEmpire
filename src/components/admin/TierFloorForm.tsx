"use client";

import { useState } from "react";

type Result = { email: string; ok: boolean; was?: string | null; tier?: string; note?: string };

// Grandfathering control for the accounts page. Posts to /api/admin/tier-floor.
//
// The case it exists for: the August $4.99 subscribers, whose Price object
// later became the Plus price. Billing correctly reads them as Plus; the
// promise made to them says Premium. Setting a floor on those accounts leaves
// their billing untouched and their access correct — see the route's own
// header for why this is a floor rather than an overwrite.
export function TierFloorForm({ adminKey }: { adminKey?: string }) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(floor: "plus" | "premium" | null) {
    const label = floor ? `floor of ${floor}` : "no floor";
    const list = emails.split(/[\s,;]+/).filter(Boolean);
    if (!list.length) return;
    if (!window.confirm(`Set ${label} on ${list.length} account${list.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setResults(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/tier-floor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, floor, ...(adminKey ? { key: adminKey } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) setError(data?.error ?? `failed (${res.status})`);
      else setResults(data.results as Result[]);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-surface p-4">
      <h2 className="text-sm font-extrabold text-white">Grandfathered tier (floor)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Raises an account&apos;s tier above whatever its Stripe price says, without touching its billing. For accounts
        promised more than their price now buys — the original $4.99 subscribers, whose price later became the Plus
        price. Billing keeps writing the real tier underneath, so renewals, plan changes and the nightly sync never
        undo this and it never has to be re-applied. It can only raise a tier, never lower one, and it does nothing on
        an account with no active subscription.
      </p>
      <textarea
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder={"one email per line, or comma-separated"}
        rows={4}
        disabled={busy}
        className="input mt-3 w-full font-mono text-xs"
        aria-label="account emails"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => apply("premium")} disabled={busy || !emails.trim()} className="btn-primary text-sm">
          {busy ? "Applying…" : "Pin to Premium"}
        </button>
        <button type="button" onClick={() => apply("plus")} disabled={busy || !emails.trim()} className="btn-ghost text-sm">
          Pin to Plus
        </button>
        <button
          type="button"
          onClick={() => apply(null)}
          disabled={busy || !emails.trim()}
          className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-300 transition-colors hover:border-rose-500 hover:bg-rose-500/10 disabled:opacity-40"
        >
          Remove floor
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">✗ {error}</p>}
      {results && (
        <div className="mt-2 space-y-1 text-xs">
          {results.map((r) => (
            <p key={r.email} className={r.ok ? "text-brand-400" : "text-rose-400"}>
              {r.ok ? "✓" : "✗"} {r.email}
              {r.ok && <span className="text-slate-500"> — billing tier {r.tier}, was {r.was ?? "no floor"}</span>}
              {r.note && <span className="text-amber-400"> — {r.note}</span>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
