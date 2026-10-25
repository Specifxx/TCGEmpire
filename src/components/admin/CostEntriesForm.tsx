"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { COST_CATEGORIES, type CostEntry } from "@/lib/earnings/core";

// /admin/earnings: add, stop or remove a cost entry (lib/earnings/costs.ts).
// Talks to /api/admin/earnings/costs, then re-renders the page so costs and
// profit move. "Stop" ends a repeating cost today, which is how a plan change is
// recorded: stop the old one, add the new one from today.
export function CostEntriesForm({
  entries,
  adminKey,
  today,
}: {
  entries: (CostEntry & { note: string | null })[];
  adminKey: string | null;
  today: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("AI");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [startDay, setStartDay] = useState(today);
  const [recurrence, setRecurrence] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/earnings/costs", {
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

  const field = "rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white";
  return (
    <div className="mt-3 space-y-3">
      <form
        className="card-surface flex flex-wrap items-end gap-2 rounded-xl border border-ink-700 p-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("POST", { label, category, amount, currency, startDay, recurrence })) {
            setLabel("");
            setAmount("");
          }
        }}
      >
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-400">
          What
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Claude Max" maxLength={80} required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {COST_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Amount
          <input type="number" step="0.01" min="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required className={`w-24 ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {["USD", "AUD", "GBP", "EUR", "CAD", "SGD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Repeats
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={field}>
            <option value="once">One-off</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {recurrence === "once" ? "Date" : "Since"}
          <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} required className={field} />
        </label>
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-4 text-sm disabled:opacity-60">
          {busy ? "Saving…" : "Add cost"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {entries.length > 0 && (
        <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-slate-300">
                <span className="font-semibold text-white">{e.label}</span>
                <span className="num ml-2">{formatMoney(e.amountCents, e.currency)}</span>
                <span className="ml-1 text-xs text-slate-500">
                  {e.recurrence === "once" ? `on ${e.startDay}` : `/${e.recurrence === "monthly" ? "month" : "year"} since ${e.startDay}`}
                  {e.endDay ? `, ended ${e.endDay}` : ""}
                </span>
                {e.note ? <span className="block text-xs text-slate-500">{e.note}</span> : null}
              </span>
              <span className="flex gap-3 text-xs">
                {e.recurrence !== "once" &&
                  (e.endDay ? (
                    <button type="button" disabled={busy} onClick={() => call("PATCH", { id: e.id, endDay: null })} className="text-slate-400 hover:text-white">
                      Restart
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => call("PATCH", { id: e.id, endDay: today })} className="text-slate-400 hover:text-white">
                      Stop today
                    </button>
                  ))}
                <button type="button" disabled={busy} onClick={() => call("DELETE", { id: e.id })} className="text-slate-400 hover:text-rose-400">
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
