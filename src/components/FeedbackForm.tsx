"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";

type State = { kind: "idle" | "loading" | "done" | "error"; msg?: string; granted?: boolean };

export function FeedbackForm({ months }: { months: number }) {
  const { user, premium, loaded } = useMe();
  const moLabel = `${months} month${months === 1 ? "" : "s"}`;
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    if (message.trim().length < 10) {
      setState({ kind: "error", msg: "Please write a little more (at least 10 characters)." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, rating: rating || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", msg: d?.error ?? "Something went wrong — please try again." });
        return;
      }
      setState({ kind: "done", granted: !!d.granted });
    } catch {
      setState({ kind: "error", msg: "Network error — please try again." });
    }
  }

  if (!loaded) return <div className="h-40 animate-pulse rounded-xl bg-ink-800" />;

  if (!user) {
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-sm text-slate-300">
          Sign in to send feedback{months > 0 ? <> and claim your <strong className="text-gold">{moLabel} of Premium</strong></> : null}.
        </p>
        <Link href="/login?next=/feedback" className="btn-primary mt-4 inline-flex">Sign in →</Link>
        <p className="mt-2 text-xs text-slate-500">
          No account? <Link href="/login?next=/feedback" className="text-brand-400 hover:underline">Sign in free →</Link>
        </p>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-8 text-center shadow-[0_0_30px_rgba(52,209,126,0.12)]">
        <div className="text-3xl">🎉</div>
        <h2 className="mt-3 text-lg font-bold text-brand-200">Thank you — this genuinely helps.</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
          {state.granted
            ? `Your ${moLabel} of Premium is now active. Enjoy the pro tools!`
            : premium
            ? "You're already Premium — but your feedback still means a lot."
            : "Your feedback is in. (The Premium reward is one per account.)"}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn-primary text-sm">Go to your dashboard →</Link>
          <Link href="/" className="btn-ghost text-sm">Back to site</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-6">
      <div>
        <span className="mb-1 block text-sm font-semibold text-slate-200">How are we doing?</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={rating === n}
              className={`text-2xl transition ${n <= rating ? "text-gold" : "text-ink-600 hover:text-slate-400"}`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 self-center text-xs text-slate-500">optional</span>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Your feedback</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What do you love? What's missing or frustrating? What would make RiftCompare a must-use for you?"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
      </label>

      {state.kind === "error" && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.msg}</p>
      )}

      <button type="submit" disabled={state.kind === "loading"} className="btn-primary w-full justify-center">
        {state.kind === "loading" ? "Sending…" : "Send feedback →"}
      </button>
      {months > 0 && !premium && (
        <p className="text-center text-xs text-slate-500">
          Your first feedback unlocks <strong className="text-gold">{moLabel} of Premium</strong> — one per account.
        </p>
      )}
    </form>
  );
}
