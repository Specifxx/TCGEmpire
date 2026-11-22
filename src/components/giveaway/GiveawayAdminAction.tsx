"use client";

import { useState } from "react";

// /admin/giveaway's two buttons: run the published draw now, or mark a claimed prize as posted (api/admin/giveaway).
export function GiveawayAdminAction({ giveaway, action, label }: { giveaway: string; action: "draw" | "shipped"; label: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giveaway, action }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; did?: string; ticket?: number; winner?: string };
      if (!r.ok) setMsg(j.error ?? "Failed.");
      else {
        setMsg(j.did === "drawn" || j.did === "redrawn" ? `Drawn: ticket #${j.ticket}. Reloading…` : `Done: ${j.did}. Reloading…`);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setMsg("Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={go} disabled={busy} className="btn-primary">
        {busy ? "Working…" : label}
      </button>
      {msg && <span className="text-sm">{msg}</span>}
    </span>
  );
}
