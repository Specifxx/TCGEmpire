"use client";

import { useState } from "react";

export function GiveawayDrawButton({ giveaway }: { giveaway: string }) {
  const [out, setOut] = useState<string | null>(null);
  const [exclude, setExclude] = useState("");
  async function draw() {
    const r = await fetch("/api/admin/giveaway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveaway, exclude: exclude || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setOut(r.ok ? `Winner: ${j.winnerEmail} (from ${j.entries} entries)` : (j.error ?? "Draw failed"));
  }
  return (
    <div className="mt-3 space-y-2">
      <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="Redraw: email to leave out" className="w-full rounded border border-white/20 bg-transparent px-2 py-1 text-sm" />
      <button type="button" onClick={draw} className="btn-primary">
        Draw a winner
      </button>
      {out && <p className="text-sm">{out}</p>}
    </div>
  );
}
