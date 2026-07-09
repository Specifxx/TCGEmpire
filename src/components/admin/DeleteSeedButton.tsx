"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Purges the @riftcompare.seed forum-persona accounts (and their seed posts) via the
// existing admin endpoint. Admin-session only — the endpoint requires isAdmin.
export function DeleteSeedButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!confirm("Delete all @riftcompare.seed forum-persona accounts and their seed posts? This can't be undone (they'd re-seed on the next deploy unless auto-seeding is turned off).")) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/forum/clear-seed", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(`✓ Deleted ${d.deletedPersonas ?? 0} seed account(s) and ${d.deletedPosts ?? 0} seed post(s).`);
        router.refresh();
      } else {
        setResult(d.error ?? "Failed.");
      }
    } catch {
      setResult("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "🗑 Delete seed accounts"}
      </button>
      {result && <span className="text-xs text-slate-400">{result}</span>}
    </div>
  );
}
