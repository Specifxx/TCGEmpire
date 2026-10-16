"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Buttons for /admin/affiliates (2026-10-16). Every action posts to
// /api/admin/affiliates with the admin key when the page was opened that way.
async function post(adminKey: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/affiliates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, key: adminKey }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string; marked?: number };
  return { ok: res.ok, ...data };
}

function useAction(adminKey: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (payload: Record<string, unknown>, confirmText?: string) => {
    if (busy || (confirmText && !confirm(confirmText))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await post(adminKey, payload);
      if (!r.ok) setMsg(r.error ?? "Failed.");
      else {
        if (r.warning) setMsg(r.warning);
        router.refresh();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

export function ApplicationActions({ id, suggested, adminKey }: { id: string; suggested: string; adminKey: string }) {
  const [code, setCode] = useState(suggested);
  const { busy, msg, run } = useAction(adminKey);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="CODE" className="input w-40 text-sm uppercase" aria-label="Code to give" />
        <button type="button" disabled={busy || !code} onClick={() => run({ action: "approve", applicationId: id, code })} className="btn-primary px-3 py-1.5 text-xs">
          Approve with this code
        </button>
        <button type="button" disabled={busy} onClick={() => run({ action: "reject", applicationId: id }, "Reject this application?")} className="text-xs text-slate-400 hover:text-white hover:underline">
          Reject
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-gold">{msg}</p>}
    </div>
  );
}

export function AffiliateRowActions({ id, active, synced, owedLabel, adminKey }: { id: string; active: boolean; synced: boolean; owedLabel: string | null; adminKey: string }) {
  const { busy, msg, run } = useAction(adminKey);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {owedLabel && (
        <button type="button" disabled={busy} onClick={() => run({ action: "paid", affiliateId: id }, `Mark ${owedLabel} as paid out?`)} className="text-xs font-semibold text-brand-400 hover:underline">
          Mark paid
        </button>
      )}
      {!synced && (
        <button type="button" disabled={busy} onClick={() => run({ action: "sync", affiliateId: id })} className="text-xs font-semibold text-gold hover:underline">
          Sync with Stripe
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => run({ action: "active", affiliateId: id, active: !active }, active ? "Switch this code off? New checkouts won't get the discount." : undefined)} className="text-xs text-slate-400 hover:text-white hover:underline">
        {active ? "Switch off" : "Switch on"}
      </button>
      {msg && <span className="text-xs text-gold">{msg}</span>}
    </div>
  );
}

export function AddAffiliateForm({ adminKey }: { adminKey: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const { busy, msg, run } = useAction(adminKey);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run({ action: "create", name, email, code });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Creator name" className="input w-44 text-sm" aria-label="Creator name" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input w-56 text-sm" aria-label="Email" />
      <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="CODE" className="input w-36 text-sm uppercase" aria-label="Code" />
      <button type="submit" disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
        Add a creator
      </button>
      {msg && <span className="text-xs text-gold">{msg}</span>}
    </form>
  );
}
