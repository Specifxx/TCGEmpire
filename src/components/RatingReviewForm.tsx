"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { useMe } from "@/lib/use-me";
import { markRated } from "@/lib/rate-prompt";
import { ShareRow } from "./ShareRow";

// THE ONE RATING-AND-REVIEW FORM (owner, 2026-10-27: "all feedback options
// [must be] the same … if it's the star rating, that's the star rating"). The
// corner card (RateUsPrompt), the footer's panel (FeedbackWidget), the "Rate
// us" strip above the footer and /feedback all render this, so a visitor meets
// the same five stars, the same review box and the same choices everywhere.
// Contact is a different thing (a message to Bill that wants a reply) and keeps
// its own form on /contact. DECISIONS.md, "One feedback form, shown by default".
//
// SHOWN BY DEFAULT, OPT-OUT (owner, same day: "assume that we can use it on
// our website and they can opt out"). "Show my review on RiftCompare" starts
// ticked and says so plainly; unticking it keeps the review private. A person
// still approves every review before it appears (lib/reviews.ts). Rows sent
// before this change keep the answer they gave: nothing is published
// retroactively.
//
// The follow-up question depends on the stars (a low rating is asked what to
// fix, a high one what they use it for), but every submission is stored and
// shown to the admin the same way.

type Phase = "form" | "sending" | "done";

export function RatingReviewForm({
  source,
  page,
  initialRating = 0,
  compact = false,
  onDone,
  footer,
}: {
  source: "widget" | "page" | "rating";
  page: string;
  initialRating?: number;
  /** The corner card: only the stars until one is picked. */
  compact?: boolean;
  onDone?: (r: { rating: number; granted: boolean }) => void;
  footer?: React.ReactNode;
}) {
  const { user } = useMe();
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPublicly, setShowPublicly] = useState(true); // opt-out (owner, 2026-10-27)
  const [honeypot, setHoneypot] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  const low = rating > 0 && rating <= 3;
  const expanded = !compact || rating > 0;
  const field = "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-base text-white sm:text-sm placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    if (!rating && message.trim().length < 10) {
      setError("Pick a star rating, or write a little more (at least 10 characters).");
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rating || undefined,
          message: message.trim(),
          email: !user && email.trim() ? email.trim() : undefined,
          displayName: showPublicly ? displayName.trim() || undefined : undefined,
          consentPublic: showPublicly,
          source,
          page,
          website: honeypot, // honeypot: real people never fill it
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "Couldn't send that. Please try again.");
        setPhase("form");
        return;
      }
      if (rating) markRated();
      track("feedback_submit", { source, rating, hasMessage: message.trim().length > 0 });
      setPhase("done");
      onDone?.({ rating, granted: !!d?.granted });
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="text-center" data-feedback-done>
        {rating > 0 && (
          <div className="text-3xl text-gold" aria-hidden>
            {"★".repeat(rating)}
          </div>
        )}
        <p className="mt-1 font-display text-lg font-extrabold text-white">Thank you!</p>
        <p className="mt-1 text-sm text-slate-400">
          {low ? "We read every one, and this tells us what to fix." : "That really helps other players find us."}
        </p>
        {rating >= 4 && !compact && (
          <div className="mt-3 flex justify-center">
            <ShareRow source={`feedback_${source}`} size="sm" />
          </div>
        )}
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="space-y-3 text-left" data-rating-review-form>
      <div className="flex flex-wrap justify-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => setRating(n)}
            className={`grid min-h-11 min-w-11 place-items-center text-4xl leading-none transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${n <= shown ? "text-gold" : "text-slate-600"}`}
          >
            ★
          </button>
        ))}
      </div>

      {expanded && (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-200">
              {low ? "What should we fix?" : rating >= 4 ? "Write a review (optional)" : "Your review"}
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={compact ? 3 : 4}
              maxLength={4000}
              placeholder={low ? "What was missing, wrong or confusing?" : "What do you use RiftCompare for? What would make it better?"}
              className={field}
            />
          </label>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="hidden" />

          {!user && (
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional, only if you want a reply)"
              aria-label="Email address, optional"
              className={field}
            />
          )}

          <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={showPublicly} onChange={(e) => setShowPublicly(e.target.checked)} className="mt-0.5" />
              <span>
                Show my review on RiftCompare
                <span className="mt-0.5 block text-slate-500">Untick to keep it private. We read every review before it appears; your email is never shown.</span>
              </span>
            </label>
            {showPublicly && (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name to show (optional)"
                maxLength={60}
                aria-label="Name to show with your review, optional"
                className={`${field} mt-2`}
              />
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <button type="submit" disabled={phase === "sending"} className="btn-primary w-full justify-center">
            {phase === "sending" ? "Sending…" : "Send"}
          </button>
          {footer}
        </>
      )}
    </form>
  );
}
