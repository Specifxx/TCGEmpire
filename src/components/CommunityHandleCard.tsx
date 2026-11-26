"use client";

import { useEffect, useState } from "react";

// The member's community handle and this month's contributions (lib/handles.ts, lib/contributions.ts; community plan move 3).
// On /profile only. It asks /api/community/me once on mount and saves through /api/community/handle; nothing opens by itself.

type Me = { handle: string | null; month: number; monthPoints: number; total: number; dailyCap: number };

export function CommunityHandleCard() {
  const [me, setMe] = useState<Me | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/community/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) {
          setMe(j);
          setDraft(j.handle ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/community/handle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: draft }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setMe((m) => (m ? { ...m, handle: j.handle } : m));
        setMsg({ ok: true, text: j.handle ? `Saved. You're @${j.handle} on every site.` : "Removed. Your contributions still count, unnamed." });
      } else setMsg({ ok: false, text: j.error || "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;
  return (
    <div className="card-surface mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-white">Your community name</h2>
        <span className="text-xs text-slate-400">
          This month: {me.month} contribution{me.month === 1 ? "" : "s"} · {me.monthPoints} point{me.monthPoints === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Shown on the deals you vouch for and on the monthly Top deal hunters list, on every one of our card sites. Votes, gone flags, pulse
        answers and pull logs earn points that also count in the giveaway, up to {me.dailyCap} a day. Without a name you still earn, unnamed.
      </p>
      <form onSubmit={save} className="mt-3 flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center rounded-lg border border-ink-700 bg-ink-900 px-3">
          <span className="text-slate-500">@</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={21}
            placeholder="pick_a_name"
            aria-label="Community name"
            className="min-w-0 flex-1 bg-transparent py-2 pl-1 text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary">{me.handle ? "Change" : "Save"}</button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`} role="status">{msg.text}</p>}
    </div>
  );
}
