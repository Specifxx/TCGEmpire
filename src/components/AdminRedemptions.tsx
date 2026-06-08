"use client";

import { useEffect, useState } from "react";

interface Row {
  id: string;
  rewardName: string;
  cost: number;
  status: string;
  note: string | null;
  createdAt: string;
  email: string;
  displayName: string;
}

// Admin client for the experience-redemption queue. Lists pending requests and
// lets an admin mark them done.
export function AdminRedemptions() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/redemptions", { cache: "no-store" });
      const data = await res.json();
      setRows(data.redemptions ?? []);
    } catch {
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: "PENDING" | "DONE") {
    setBusy(id);
    try {
      await fetch("/api/admin/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No experience redemptions yet.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="card-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`chip font-bold ${r.status === "PENDING" ? "bg-gold/15 text-gold" : "bg-brand-500/15 text-brand-300"}`}>{r.status}</span>
              <span className="font-semibold text-white">{r.rewardName}</span>
              <span className="text-xs text-slate-500">✦ {r.cost}</span>
            </div>
            <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("en-AU")}</span>
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {r.displayName} · <a href={`mailto:${r.email}`} className="text-brand-400 hover:underline">{r.email}</a>
          </div>
          {r.note && <p className="mt-1 rounded-lg bg-ink-950/50 p-2 text-sm text-slate-400">“{r.note}”</p>}
          <div className="mt-3 flex gap-2">
            {r.status === "PENDING" ? (
              <button onClick={() => setStatus(r.id, "DONE")} disabled={busy === r.id} className="btn-primary text-sm disabled:opacity-50">
                Mark done
              </button>
            ) : (
              <button onClick={() => setStatus(r.id, "PENDING")} disabled={busy === r.id} className="btn-ghost text-sm disabled:opacity-50">
                Reopen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
