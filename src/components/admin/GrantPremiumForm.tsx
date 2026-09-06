"use client";

import { useState } from "react";

// Admin manual Premium grant (accounts page). Posts to /api/admin/grant-premium;
// when the page is opened via the ?key= link rather than an admin session, the
// key is passed through so the API's dual gate accepts it — same pattern as the
// other admin tools.
interface ReconcileResult {
  ok: boolean;
  skipped?: string;
  checked: number;
  extended: { email: string | null; from: string | null; until: string }[];
  unmatched: { customerEmail: string | null; subscription: string }[];
  customersLinked: number;
  error?: string;
}

export function GrantPremiumForm({ adminKey }: { adminKey?: string }) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("365");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<ReconcileResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function reconcile() {
    setSyncing(true);
    setSync(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/admin/stripe-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(adminKey ? { key: adminKey } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as ReconcileResult | null;
      if (!res.ok || !data?.ok) setSyncError(data?.error ?? `failed (${res.status})`);
      else setSync(data);
    } catch {
      setSyncError("network error");
    } finally {
      setSyncing(false);
    }
  }

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
      <h2 className="text-sm font-extrabold text-white">Premium &amp; billing repair</h2>
      <p className="mt-1 text-xs text-slate-500">
        Grants stack onto any current entitlement and can&apos;t be clobbered by a later Stripe renewal
        (extend-only stamping). Every grant is logged. If someone paid but shows lapsed, try the Stripe
        sync below first — it uses their real subscription rather than guessing a length.
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

      {/* The self-heal button. Runs the same sweep as the daily cron, so a
          customer whose renewal webhook was missed can be fixed here and now
          instead of waiting for the next scheduled run. Extend-only and
          idempotent — pressing it twice is harmless. */}
      <div className="mt-4 border-t border-ink-800 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reconcile} disabled={syncing} className="btn-ghost text-sm">
            {syncing ? "Syncing…" : "Sync Stripe subscriptions now"}
          </button>
          <span className="text-xs text-slate-500">
            Re-reads every live Stripe subscription and repairs any account whose entitlement is behind.
          </span>
        </div>
        {syncError && <p className="mt-2 text-xs text-rose-400">✗ {syncError}</p>}
        {sync && (
          <div className="mt-2 text-xs">
            {sync.skipped ? (
              <p className="text-slate-500">Skipped — {sync.skipped}.</p>
            ) : (
              <p className="text-slate-400">
                Checked <span className="num font-bold text-slate-200">{sync.checked}</span> subscriptions ·{" "}
                <span className="num font-bold text-brand-400">{sync.extended.length}</span> repaired
                {sync.customersLinked > 0 && <> · {sync.customersLinked} customer link(s) backfilled</>}
              </p>
            )}
            {sync.extended.map((x) => (
              <p key={`${x.email}-${x.until}`} className="mt-1 text-brand-400">
                ✓ {x.email ?? "account"} — {x.from ? `was ${x.from.slice(0, 10)}` : "had none"} → now{" "}
                {x.until.slice(0, 10)}
              </p>
            ))}
            {sync.unmatched.map((u) => (
              <p key={u.subscription} className="mt-1 text-rose-400">
                ✗ paying, no matching account: {u.customerEmail ?? "no email"} ({u.subscription}) — needs a manual link
              </p>
            ))}
            {!sync.skipped && sync.extended.length === 0 && sync.unmatched.length === 0 && (
              <p className="mt-1 text-slate-500">Everything already in sync — no account was behind.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
