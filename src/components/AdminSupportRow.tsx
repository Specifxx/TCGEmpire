"use client";

import { useState } from "react";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export function AdminSupportRow({
  id,
  initialStatus,
  initialNote,
}: {
  id: string;
  initialStatus: string;
  initialNote: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: { status?: string; adminNote?: string }) {
    setBusy(true);
    setSaved(false);
    const res = await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...next }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3">
      <select
        value={status}
        onChange={(e) => { setStatus(e.target.value); void save({ status: e.target.value }); }}
        className="input w-auto py-1 text-xs"
        disabled={busy}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => void save({ adminNote: note })}
        placeholder="Internal note…"
        className="input min-w-[160px] flex-1 py-1 text-xs"
        disabled={busy}
      />
      {saved && <span className="text-[11px] text-brand-300">✓ saved</span>}
    </div>
  );
}
