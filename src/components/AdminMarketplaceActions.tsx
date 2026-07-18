"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function call(action: string, body: Record<string, string>) {
  const res = await fetch("/api/admin/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return res.ok;
}

export function DisputedOrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, confirmMsg: string) {
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    setBusy(action);
    const ok = await call(action, { orderId });
    setBusy(null);
    if (ok) router.refresh();
    else alert("Action failed — check the order isn't already resolved.");
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button
        onClick={() => run("force-release", "Force-release funds to the seller for this order? Only do this once you've confirmed delivery.")}
        disabled={!!busy}
        className="rounded bg-brand-500/20 px-2 py-1 text-[11px] font-semibold text-brand-300 hover:bg-brand-500/30 disabled:opacity-50"
      >
        {busy === "force-release" ? "…" : "✅ Force release"}
      </button>
      <button
        onClick={() => run("force-refund", "Force-refund the buyer in full and restock the listing?")}
        disabled={!!busy}
        className="rounded bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
      >
        {busy === "force-refund" ? "…" : "↩ Force refund"}
      </button>
      <button
        onClick={() => run("clear-dispute", "Clear the dispute flag without releasing or refunding? Auto-release/ship-deadline crons will resume normally.")}
        disabled={!!busy}
        className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700 disabled:opacity-50"
      >
        {busy === "clear-dispute" ? "…" : "Clear flag"}
      </button>
    </div>
  );
}

export function SellerSuspendToggle({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const action = suspended ? "unsuspend-seller" : "suspend-seller";
    if (typeof window !== "undefined" && !window.confirm(suspended ? "Restore this seller's selling privileges?" : "Suspend this seller? Their active listings will be paused.")) return;
    setBusy(true);
    const ok = await call(action, { userId });
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${suspended ? "bg-brand-500/20 text-brand-300 hover:bg-brand-500/30" : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"}`}
    >
      {busy ? "…" : suspended ? "Unsuspend" : "Suspend"}
    </button>
  );
}

export function DelistForm() {
  const router = useRouter();
  const [listingId, setListingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!listingId.trim()) return;
    setBusy(true);
    setMsg(null);
    const ok = await call("delist-listing", { listingId: listingId.trim() });
    setBusy(false);
    setMsg(ok ? "✓ Delisted" : "Failed — check the listing ID");
    if (ok) { setListingId(""); router.refresh(); }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input value={listingId} onChange={(e) => setListingId(e.target.value)} placeholder="Listing ID" className="input w-auto py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-ink-700 disabled:opacity-50">
        {busy ? "…" : "Delist"}
      </button>
      {msg && <span className="text-[11px] text-slate-400">{msg}</span>}
    </form>
  );
}
