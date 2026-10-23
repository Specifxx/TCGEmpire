"use client";

import { useState } from "react";

// The description and promo a Stores plan buyer shows on their /stores/<slug>
// page (POST /api/stores/profile). Plain text only; the limits match
// lib/store-plan.ts (ABOUT_MAX, PROMO_MAX), which the route enforces.
export function StoreProfileForm({
  subscriptionId,
  about: initialAbout,
  promo: initialPromo,
  aboutMax,
  promoMax,
}: {
  subscriptionId: string;
  about: string | null;
  promo: string | null;
  aboutMax: number;
  promoMax: number;
}) {
  const [about, setAbout] = useState(initialAbout ?? "");
  const [promo, setPromo] = useState(initialPromo ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/stores/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, about, promo }),
      });
      const d = await res.json().catch(() => null);
      setNote(res.ok ? { ok: true, text: "Saved. Your store page shows it within a few minutes." } : { ok: false, text: d?.error ?? "Couldn't save. Try again." });
    } catch {
      setNote({ ok: false, text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const id = (s: string) => `${s}-${subscriptionId}`;
  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-slate-400" htmlFor={id("about")}>
        About your store <span className="font-normal text-slate-500">({about.length}/{aboutMax})</span>
      </label>
      <textarea
        id={id("about")}
        className="input min-h-[5rem] w-full"
        value={about}
        maxLength={aboutMax}
        onChange={(e) => setAbout(e.target.value)}
        placeholder="Who you are, where you ship from, what you specialise in."
        disabled={busy}
      />
      <label className="text-xs font-semibold text-slate-400" htmlFor={id("promo")}>
        Promo line <span className="font-normal text-slate-500">({promo.length}/{promoMax})</span>
      </label>
      <input
        id={id("promo")}
        className="input w-full"
        value={promo}
        maxLength={promoMax}
        onChange={(e) => setPromo(e.target.value)}
        placeholder="e.g. Free shipping on orders over $50 this month"
        disabled={busy}
      />
      <p className="text-[11px] text-slate-500">
        Plain text, shown on your store page beside the Verified mark. It never appears in price comparisons and never
        changes where your prices rank.
      </p>
      <div>
        <button type="submit" className="btn-primary text-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? "text-brand-300" : "text-rose-400"}`}>
          {note.text}
        </p>
      )}
    </form>
  );
}
