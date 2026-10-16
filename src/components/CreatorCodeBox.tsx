"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// "Have a creator code?" on /premium (2026-10-16). Shows the code a creator's
// link already remembered (read server-side from the rc_aff cookie), applies one
// from ?code= on arrival, or takes one typed in. Applying posts to
// /api/creator-codes/use, which sets the cookie checkout reads; Stripe's page then
// shows the discounted amount before anything is charged.

type Applied = { code: string; name: string; percentOff: number };

export function CreatorCodeBox({ initial, fromUrl }: { initial: Applied | null; fromUrl: string | null }) {
  const [applied, setApplied] = useState<Applied | null>(initial);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply(code: string, source: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/creator-codes/use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Applied> & { error?: string };
      if (!res.ok || !data.code) {
        setErr(data.error ?? "That code isn't valid.");
        return;
      }
      setApplied({ code: data.code, name: data.name ?? data.code, percentOff: data.percentOff ?? 20 });
      setOpen(false);
      trackEvent("creator_code_applied", { code: data.code, source });
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (fromUrl && fromUrl !== initial?.code) void apply(fromUrl, "link");
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove() {
    setBusy(true);
    await fetch("/api/creator-codes/use", { method: "DELETE" }).catch(() => {});
    setApplied(null);
    setBusy(false);
  }

  if (applied) {
    return (
      <div role="status" className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-2.5 text-center text-sm">
        <span className="font-semibold text-brand-200">
          ✓ Creator code <span className="font-extrabold text-white">{applied.code}</span>: {applied.percentOff}% off at checkout
        </span>
        <span className="text-xs text-slate-400">from {applied.name}</span>
        <button type="button" onClick={remove} disabled={busy} className="text-xs text-slate-400 underline hover:text-white">
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-brand-400 hover:underline">
          Have a creator code?
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) void apply(value, "typed");
          }}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <label className="sr-only" htmlFor="creator-code">Creator code</label>
          <input
            id="creator-code"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={40}
            placeholder="Creator code"
            className="input w-44 text-base uppercase sm:text-sm"
          />
          <button type="submit" disabled={busy} className="btn-ghost min-h-10 px-4">
            {busy ? "Checking…" : "Apply"}
          </button>
        </form>
      )}
      {err && <p role="alert" className="mt-1 text-xs text-red-300">{err}</p>}
    </div>
  );
}
