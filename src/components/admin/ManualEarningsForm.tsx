"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// /admin/earnings: add or remove a hand-entered earning (Mediavine has no API).
// Posts to /api/admin/earnings/manual, then re-renders the page so the totals move.
export function ManualEarningsForm({
  entries,
  adminKey,
}: {
  entries: { id: string; source: string; day: string; amountCents: number; currency: string; note: string | null }[];
  adminKey: string | null;
}) {
  const router = useRouter();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/earnings/manual", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(adminKey ? { key: adminKey } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "Couldn't save that.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <form
        className="card-surface flex flex-wrap items-end gap-2 rounded-xl border border-ink-700 p-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("POST", { source: "mediavine", day, amount, currency, note })) {
            setAmount("");
            setNote("");
          }
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Date
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} required className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Amount
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-28 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white">
            {["USD", "AUD", "GBP", "EUR", "CAD", "SGD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-400">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-4 text-sm disabled:opacity-60">
          {busy ? "Saving…" : "Add Mediavine earnings"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {entries.length > 0 && (
        <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-slate-300">
                {e.day} · <span className="num font-semibold text-white">{formatMoney(e.amountCents, e.currency)}</span>
                {e.note ? <span className="ml-2 text-xs text-slate-500">{e.note}</span> : null}
              </span>
              <button type="button" disabled={busy} onClick={() => call("DELETE", { id: e.id })} className="text-xs text-slate-400 hover:text-rose-400">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
