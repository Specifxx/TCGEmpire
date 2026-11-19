"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { COACH_BUDGETS, COACH_FORMATS, COACH_FOUNDER_PRICE, COACH_PRICE, MIN_DECK } from "@/lib/coach";

// The Deck Coach test form (lib/coach.ts). Posts to /api/coach. Signed-in members are
// emailed at their account address; everyone else leaves one.
export function CoachForm() {
  const { user } = useMe();
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ deck: "", legend: "", format: "Standard", budget: "US$25–50", event: "", goal: "", email: "", founder: false, website: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: k === "founder" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.deck.trim().length < MIN_DECK) return setError("Paste your full deck list first.");
    setState("sending");
    try {
      const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Something went wrong.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "done")
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-lg font-bold text-white">Got it. Your report is on its way.</p>
        <p className="mt-2 text-sm text-slate-400">
          We&apos;ll email it within two days{user?.email ? ` to ${user.email}` : ""}. Reply to that email with any question about your deck.
        </p>
      </div>
    );

  const input = "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-base text-white sm:text-sm placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40";
  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-white">Your deck</span>
        <textarea required rows={9} value={f.deck} onChange={set("deck")} className={input}
          placeholder={"Paste the list from your deck builder, one card per line\n1 Kennen, Heart of the Tempest\n3 Lightning Rush\n…"} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white">Legend</span>
          <input value={f.legend} onChange={set("legend")} className={input} placeholder="e.g. Kennen" maxLength={80} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white">Format</span>
          <select value={f.format} onChange={set("format")} className={input}>
            {COACH_FORMATS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white">Budget for upgrades</span>
          <select value={f.budget} onChange={set("budget")} className={input}>
            {COACH_BUDGETS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white">Next event (optional)</span>
          <input value={f.event} onChange={set("event")} className={input} placeholder="e.g. locals on Friday" maxLength={120} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-white">Anything you want help with? (optional)</span>
        <input value={f.goal} onChange={set("goal")} className={input} placeholder="e.g. I keep losing to Kai'Sa" maxLength={600} />
      </label>
      {!user && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white">Email for your report</span>
          <input required type="email" value={f.email} onChange={set("email")} className={input} placeholder="you@example.com" maxLength={200} />
        </label>
      )}
      <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm text-slate-300">
        <input type="checkbox" checked={f.founder} onChange={set("founder")} className="mt-1" />
        <span>
          I&apos;d pay for this before events. Save me the founder price, <strong className="text-gold">{COACH_FOUNDER_PRICE}/month</strong> instead of{" "}
          {COACH_PRICE}, if it launches. <span className="text-slate-500">No charge now, no card needed.</span>
        </span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="btn-primary w-full disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Review my deck, free"}
      </button>
      <p className="text-center text-xs text-slate-500">Your deck and email are only used for your report. We never publish them.</p>
    </form>
  );
}
