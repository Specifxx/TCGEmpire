"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { armNudge, countSessionView } from "@/lib/nudge-runtime";
import { useEscapeLayer } from "./ui/Dialog";
import {
  RATE_SESSION_KEY,
  RATE_STORAGE_KEY,
  countPageView,
  parseRateState,
  ratingFollowUp,
  shouldAskRating,
  type RateState,
} from "@/lib/rate-prompt";

// "Rate RiftCompare" (owner, 2026-10-26; reworked 2026-10-27, DECISIONS.md "One
// rating ask, earned by engagement"). When it asks is lib/rate-prompt.ts: never
// a new visitor, only a returning one after real use, at most twice ever, never in the same visit as the Pricing
// callout. A small corner card, not a modal: the page stays usable under it,
// and ✕, Escape and "Not now" all close it (snoozed), "Don't ask again" ends it.
// Tapping a star sends the rating at once (/api/feedback, source "rating"), a
// low one then asks what to fix, a high one offers a review (source
// "rating-review", shown only with consent and an admin's approval).

type Phase = "ask" | "fix" | "thanks";

const SHOW_DELAY_MS = 8_000;
const PRICING_NUDGE_SESSION_KEY = "rc_pricing_nudge_seen"; // PricingNudge's own flag

function save(s: RateState) {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode: nothing is remembered, and without a count it never asks.
  }
}

function load(now: number): RateState {
  try {
    return parseRateState(localStorage.getItem(RATE_STORAGE_KEY), now);
  } catch {
    return parseRateState(null, now);
  }
}

function sessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function RateUsPrompt() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("ask");
  const [hover, setHover] = useState(0);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false); // never pre-ticked: consent is opt-in

  useEffect(() => {
    const now = Date.now();
    const s = countPageView(load(now), now);
    save(s);
    if (open) return;
    const visitPages = countSessionView("rc_rate_views", path);
    const ask = () =>
      !sessionFlag(RATE_SESSION_KEY) &&
      shouldAskRating(load(Date.now()), Date.now(), path, { pages: visitPages, otherPromptShown: sessionFlag(PRICING_NUDGE_SESSION_KEY) });
    if (!ask()) return;
    // Wait for a quiet moment on the page (no dialog, no typing), then check
    // again: the Pricing callout may have claimed the visit meanwhile.
    return armNudge({
      delayMs: SHOW_DELAY_MS,
      onFire: () => {
        if (!ask()) return;
        const cur = load(Date.now());
        save({ ...cur, asks: cur.asks + 1 });
        try {
          sessionStorage.setItem(RATE_SESSION_KEY, "1");
        } catch {
          /* private mode */
        }
        setOpen(true);
      },
    });
    // Counting page views only: re-running when `open` flips would count twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, source: "rating", page: path }) }).catch(() => null);

  const rate = (n: number) => {
    setStars(n);
    save({ ...load(Date.now()), rated: true });
    void post({ rating: n, message: "" });
    setPhase(ratingFollowUp(n));
  };

  // ✕, Escape and "Not now": ask again after the snooze (rated visitors are done anyway).
  const close = () => {
    if (phase === "ask") save({ ...load(Date.now()), snoozedAt: Date.now() });
    setOpen(false);
  };

  const never = () => {
    save({ ...load(Date.now()), optedOut: true });
    setOpen(false);
  };

  useEscapeLayer(open, close);

  const sendNote = () => {
    if (note.trim().length >= 10) void post({ message: note.trim() });
    setSent(true);
    setTimeout(() => setOpen(false), 1200);
  };

  // A 4- or 5-star rater may add a few words for the site to show (2026-10-27:
  // reviews on the homepage and the Pro page once 100 people have rated). Its
  // own source, "rating-review", so its stars are not counted twice; shown
  // only if they tick consent AND an admin approves it (lib/reviews.ts).
  const sendReview = () => {
    if (note.trim().length >= 10) {
      void fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars, message: note.trim(), source: "rating-review", page: path, consentPublic: consent, displayName: consent ? name.trim() : "" }),
      }).catch(() => null);
    }
    setSent(true);
    setTimeout(() => setOpen(false), 1200);
  };

  if (!open) return null;
  const shown = hover || stars;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Rate RiftCompare"
      data-rate-prompt
      className="above-bottombar fixed right-4 z-[70] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-ink-700 bg-ink-900/95 px-5 pb-4 pt-5 text-center shadow-2xl backdrop-blur"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="tap-icon absolute right-1.5 top-1.5 rounded-lg text-slate-400 hover:bg-ink-800 hover:text-white"
      >
        ✕
      </button>
      {phase === "ask" && (
        <>
          <h2 className="pr-8 font-display text-lg font-extrabold text-white">How would you rate RiftCompare?</h2>
          <p className="mt-1 text-sm text-slate-400">One tap. We only ask once.</p>
          <div className="mt-3 flex justify-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onClick={() => rate(n)}
                className={`min-h-11 min-w-11 text-4xl leading-none transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${n <= shown ? "text-gold" : "text-slate-600"}`}
              >
                ★
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500">
            <button type="button" onClick={close} className="tap-link hover:text-slate-300 hover:underline">
              Not now
            </button>
            <button type="button" onClick={never} className="tap-link hover:text-slate-300 hover:underline">
              Don&apos;t ask again
            </button>
          </div>
        </>
      )}
      {phase === "fix" && (
        <>
          <h2 className="pr-8 font-display text-lg font-extrabold text-white">Thanks. What should we fix?</h2>
          <p className="mt-1 text-sm text-slate-400">Your {stars}-star rating is saved. A sentence helps us more than anything.</p>
          {sent ? (
            <p className="mt-3 text-sm font-semibold text-up">Got it, thank you.</p>
          ) : (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                placeholder="What was missing, wrong or confusing?"
              />
              <div className="mt-2 flex items-center justify-center gap-3">
                <button type="button" onClick={sendNote} className="btn-primary">
                  Send
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
                  Skip
                </button>
              </div>
            </>
          )}
        </>
      )}
      {phase === "thanks" && (
        <>
          <div className="text-3xl text-gold" aria-hidden>
            {"★".repeat(stars)}
          </div>
          <h2 className="mt-1 font-display text-lg font-extrabold text-white">Thank you!</h2>
          <p className="mt-1 text-sm text-slate-400">Your rating is saved. Want to tell other players why?</p>
          {sent ? (
            <p className="mt-3 text-sm font-semibold text-up">Thank you, that really helps.</p>
          ) : (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                placeholder="What do you use RiftCompare for? (optional)"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                placeholder="Name to show (optional)"
              />
              <label className="mt-2 flex items-start gap-2 text-left text-xs text-slate-400">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                RiftCompare may show this on the site.
              </label>
              <div className="mt-2 flex items-center justify-center gap-3">
                <button type="button" onClick={sendReview} className="btn-primary">
                  {note.trim().length >= 10 ? "Send" : "Done"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
                  Back to the site
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
