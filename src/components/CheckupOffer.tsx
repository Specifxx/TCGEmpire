"use client";

import { useState } from "react";
import { CHECKUP_FOUNDER_PRICE, CHECKUP_PRICE } from "@/lib/checkup";

// The binder's free check-up offer (lib/checkup.ts, 2026-11-19 test). Shown by the page only
// to a member with CHECKUP_MIN_ITEMS+ saved cards; one tap sends the list to /api/checkup.
export function CheckupOffer({ items, market }: { items: string[]; market: string }) {
  const [founder, setFounder] = useState(false);
  const [goal, setGoal] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/checkup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, market, founder, goal }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Something went wrong.");
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  if (state === "done")
    return (
      <section className="card-surface p-5">
        <p className="font-bold text-white">Thanks, your check-up is on its way.</p>
        <p className="mt-1 text-sm text-slate-400">We&apos;ll email it to your account address within two days.</p>
      </section>
    );

  return (
    <section className="card-surface border border-gold/30 p-5">
      <h2 className="text-lg font-extrabold text-white">Free binder check-up</h2>
      <p className="mt-1 text-sm text-slate-400">
        We&apos;ll look through your {items.length} cards and email you a short note: which ones are worth grading, which have moved
        lately, and which cards on your list are at a good price right now. Written by our team, every price from this site.
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-semibold text-slate-300">Anything you want us to look at? (optional)</span>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          maxLength={600}
          placeholder="e.g. should I grade my Jinx?"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-base text-white sm:text-sm placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={founder} onChange={(e) => setFounder(e.target.checked)} className="mt-1" />
        <span>
          I&apos;d like this every week. Save me the founder price, <strong className="text-gold">{CHECKUP_FOUNDER_PRICE}/month</strong> instead of{" "}
          {CHECKUP_PRICE}, if it launches. <span className="text-slate-500">No charge now.</span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button type="button" onClick={send} disabled={state === "sending"} className="btn-primary mt-3 w-full sm:w-auto disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Get my free check-up"}
      </button>
    </section>
  );
}
