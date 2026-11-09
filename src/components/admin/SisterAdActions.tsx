"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SisterAdActions({ id, status, adminKey }: { id: string; status: string; adminKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function act(action: "approve" | "reject" | "end") {
    let reason = "";
    if (action === "reject") {
      const r = window.prompt("Reason shown to the seller (e.g. not a real listing, not allowed):", "");
      if (r === null) return;
      reason = r;
    }
    if (action === "approve" && !window.confirm("Charge the seller's card and start the listing?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/sister-ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, reason, key: adminKey || undefined }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMsg(res?.ok ? "" : (data?.error ?? "Failed"));
    setBusy(false);
    router.refresh();
  }
  return (
    <span className="flex flex-wrap items-center gap-3">
      {status === "pending" && (
        <>
          <button type="button" disabled={busy} onClick={() => act("approve")} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500">
            Approve and charge
          </button>
          <button type="button" disabled={busy} onClick={() => act("reject")} className="text-xs text-rose-400 hover:text-rose-300">
            Reject
          </button>
        </>
      )}
      {status === "approved" && (
        <button type="button" disabled={busy} onClick={() => act("end")} className="text-xs text-rose-400 hover:text-rose-300">
          End now
        </button>
      )}
      {msg && <span className="text-xs text-rose-400">{msg}</span>}
    </span>
  );
}
