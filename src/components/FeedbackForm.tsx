"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { ShareRow } from "./ShareRow";

type State = { kind: "idle" | "loading" | "done" | "error"; msg?: string; granted?: boolean };

// The /feedback page's form.
//
// THIS NO LONGER GATES ON SIGN-IN. It used to return a "Sign in →" wall for any
// signed-out visitor, which meant the page invited feedback and then refused to
// take it from anyone who had not already converted — the single biggest reason
// the Feedback table stayed near-empty. The Premium reward still exists and is
// still account-only (there is nothing to attach a grant to without an account),
// but it is now an INCENTIVE shown alongside a working form, not a gate in front
// of one.
export function FeedbackForm({ days }: { days: number }) {
  const { user, premium, loaded } = useMe();
  const dayLabel = `${days} day${days === 1 ? "" : "s"}`;
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consentPublic, setConsentPublic] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    // A rating on its own is real signal and the API accepts it; only an
    // entirely empty submission is rejected.
    if (!rating && message.trim().length < 10) {
      setState({ kind: "error", msg: "Add a star rating, or write a little more (at least 10 characters)." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          rating: rating || undefined,
          email: !user && email.trim() ? email.trim() : undefined,
          displayName: displayName.trim() || undefined,
          consentPublic,
          source: "page",
          page: "/feedback",
          website: honeypot,
        }),
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

  if (state.kind === "done") {
    return (
      <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-8 text-center shadow-[0_0_30px_rgba(52,209,126,0.12)]">
        <div className="text-3xl">🎉</div>
        <h2 className="mt-3 text-lg font-bold text-brand-200">Thank you — this genuinely helps.</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
          {state.granted
            ? `Your ${dayLabel} of Premium is now active. Enjoy the pro tools!`
            : premium
            ? "You're already Premium — but your feedback still means a lot."
            : user
            ? "Your feedback is in. (The Premium reward is one per account.)"
            : "Your feedback is in — we read every one."}
        </p>

        {/* The share ask goes to people who just rated us well. Never shown to
            someone who rated us poorly: asking an unhappy visitor to go promote
            the site is tone-deaf, and their feedback is worth more than a share. */}
        {rating >= 4 && (
          <div className="mt-5 border-t border-brand-500/20 pt-4">
            <p className="text-xs text-slate-400">Know someone else who buys Riftbound?</p>
            <div className="mt-2 flex justify-center">
              <ShareRow source="feedback_page" size="sm" />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {user ? (
            <Link href="/dashboard" className="btn-primary text-sm">Go to your dashboard →</Link>
          ) : (
            <Link href="/browse" className="btn-primary text-sm">Browse the card database →</Link>
          )}
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
          maxLength={4000}
          placeholder="What do you love? What's missing or frustrating? What would make RiftCompare a must-use for you?"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
      </label>

      {/* Honeypot — off-screen, untabbable, aria-hidden. Bots fill it; people
          never see it. See /api/feedback, which silently accepts and drops
          anything that arrives with this set. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />

      {!user && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-200">
            Email <span className="font-normal text-slate-500">— optional, only if you want a reply</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </label>
      )}

      <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={consentPublic}
            onChange={(e) => setConsentPublic(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            You can show this on the site as a review.
            <span className="mt-0.5 block text-slate-500">
              Nothing is published without this ticked, and a person reviews it first either way.
            </span>
          </span>
        </label>
        {consentPublic && (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name to show (optional)"
            maxLength={60}
            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            aria-label="Display name for the public review, optional"
          />
        )}
      </div>

      {state.kind === "error" && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.msg}</p>
      )}

      <button type="submit" disabled={state.kind === "loading"} className="btn-primary w-full justify-center">
        {state.kind === "loading" ? "Sending…" : "Send feedback →"}
      </button>

      {/* The reward is an incentive to sign in, NEVER a gate — the form above
          works either way. */}
      {days > 0 && !user && (
        <p className="text-center text-xs text-slate-500">
          No account needed. If you{" "}
          <Link href="/login?next=/feedback" className="text-brand-400 hover:underline">sign in first</Link>, your first
          feedback also unlocks <strong className="text-gold">{dayLabel} of Premium</strong>.
        </p>
      )}
      {days > 0 && user && !premium && (
        <p className="text-center text-xs text-slate-500">
          Your first feedback unlocks <strong className="text-gold">{dayLabel} of Premium</strong> — one per account.
        </p>
      )}
    </form>
  );
}
