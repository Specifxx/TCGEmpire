"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { ShareRow } from "./ShareRow";
import { Dialog } from "./ui/Dialog";
import { FEEDBACK_OPEN_EVENT } from "@/lib/feedback-open";

// Site-wide feedback / review widget.
//
// NO FLOATING BUTTON (2026-10-27, DECISIONS.md "One rating ask, earned by
// engagement"). A visitor said there were "too many pop-ups asking for my
// opinion": a 💬 Feedback pill on every page plus the rating prompt was two
// opinion asks at once. The panel now opens only when asked for, from the
// footer's "Rate or send feedback" link (FeedbackLink, which dispatches
// FEEDBACK_OPEN_EVENT) or anything else that dispatches it. The one
// uninvited rating ask is RateUsPrompt (lib/rate-prompt.ts).
//
// The history below is why it never auto-opens either:
//
// WHY A PERSISTENT LAUNCHER AND NOT A SECOND POPUP. When this was written the
// site already auto-opened one sign-up dialog (SignupPromoPopup, removed
// altogether on 2026-09-30), whose own header recorded the real user feedback
// behind it: "ads + subscription pitch + a still-growing marketplace all at once
// read as overwhelming / untrustworthy to a new visitor". Adding a second uninvited interruption to
// collect satisfaction data would be measuring a problem while making it worse —
// and the people most likely to have something useful to say are exactly the
// ones a wall of modals drives off. So this NEVER auto-opens. It is a small,
// always-present, always-reachable control that costs nothing until it is
// wanted, which is what "accessible to any visitor" actually requires.
//
// IT WORKS SIGNED OUT. That is the entire point of the change it belongs to:
// /api/feedback used to 401 anyone without an account and FeedbackForm rendered
// a "Sign in →" wall, so the only reachable feedback came from people who had
// already converted. A visitor who bounces because something confused them has
// no account and never will.
//
// THE ROUTING IS DELIBERATE. A high rating leads to a share offer; a low one
// leads to "what went wrong" and an optional reply address. That is not
// review-gating: EVERY submission is stored and shown to admins identically, no
// rating is discarded or hidden, and nothing is ever published without the
// submitter ticking the consent box. It only decides which follow-up question is
// worth a person's time — asking someone who just rated the site 2 stars to go
// promote it is tone-deaf, and asking a delighted user "what went wrong" wastes
// the moment.


type Phase = "rating" | "detail" | "sending" | "done";

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consentPublic, setConsentPublic] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);


  const positive = rating != null && rating >= 4;

  // Escape, the focus trap, scroll lock and the shared rcDialog flag (read by
  // the corner nudges before they slide in, so nothing can stack on this
  // panel) now all belong to Dialog — refcounted there, so this widget shares
  // the exact same flag every other Dialog-based overlay sets, rather than
  // its own private copy. Dialog also restores focus to whatever triggered
  // it (the launcher button) once the panel unmounts, so close() no longer
  // needs to do that by hand.
  const close = useCallback(() => setOpen(false), []);

  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setPhase("rating");
      setError(null);
      track("feedback_open", { path: pathRef.current ?? "/" });
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, []);

  function pickRating(n: number) {
    setRating(n);
    setPhase("detail");
    track("feedback_rating", { rating: n });
  }

  async function submit() {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          message: message.trim(),
          email: email.trim() || undefined,
          displayName: displayName.trim() || undefined,
          consentPublic,
          source: "widget",
          page: pathname ?? "/",
          website: honeypot, // honeypot — real users never fill this
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send that — please try again.");
        setPhase("detail");
        return;
      }
      setPhase("done");
      track("feedback_submit", { rating: rating ?? 0, hasMessage: message.trim().length > 0 });
    } catch {
      setError("Couldn't reach the server — please try again.");
      setPhase("detail");
    }
  }

  return (
    <>
      <Dialog open={open} onClose={close} placement="sheet" size="md" z="sheet" labelledBy="rc-feedback-title" className="p-5">
            {/* .tap-icon (2026-09-23): 48px on touch, up from 29x32. Every
                step's title below carries pr-12 so none runs under it. */}
            <button
              type="button"
              onClick={close}
              aria-label="Close feedback"
              className="tap-icon absolute right-2 top-2 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              ✕
            </button>

            {/* ── Step 1: the rating ─────────────────────────────────────── */}
            {phase === "rating" && (
              <>
                <h2 id="rc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  How&apos;s RiftCompare working for you?
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  One tap. No account needed — we read every one.
                </p>
                {/* Stars (2026-09-23): min-h-11/min-w-11 lifts each to the
                    tap floor (43x38 before), and the idle glyph is slate-600
                    rather than ink-600, which read ~1.7:1 against the sheet. */}
                <div className="mt-4 flex justify-center gap-1.5" role="group" aria-label="Rate RiftCompare out of 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      {...(n === 1 ? { "data-autofocus": true } : {})}
                      type="button"
                      onClick={() => pickRating(n)}
                      aria-label={`${n} out of 5`}
                      className="min-h-11 min-w-11 rounded-lg px-2 py-1 text-3xl leading-none text-slate-600 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRating(null);
                    setPhase("detail");
                  }}
                  className="tap-link mx-auto mt-4 block px-3 text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  Skip — I just want to report something
                </button>
              </>
            )}

            {/* ── Step 2: the follow-up, routed by sentiment ──────────────── */}
            {(phase === "detail" || phase === "sending") && (
              <>
                <h2 id="rc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  {rating == null
                    ? "What would you like to tell us?"
                    : positive
                    ? "Glad it's useful — what should we add?"
                    : "Sorry about that — what went wrong?"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {positive
                    ? "Optional, but the specifics are what actually shape what we build next."
                    : "Tell us what happened and we'll look at it."}
                </p>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder={
                    positive
                      ? "e.g. add a price alert for sealed, or cover more UK stores…"
                      : "e.g. the price on X looked wrong, or search didn't find…"
                  }
                  className="input mt-3 w-full resize-y"
                  aria-label="Your feedback"
                />

                {/* Honeypot — visually hidden, never announced, never tabbable.
                    Bots fill every field they find; people never see this one. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                />

                {!positive && (
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional — only if you want a reply)"
                    className="input mt-2 w-full"
                    aria-label="Email address, optional"
                  />
                )}

                {positive && (
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
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
                          Nothing is ever published without this ticked — and we still read it either way.
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
                        className="input mt-2 w-full text-xs"
                        aria-label="Display name for the public review, optional"
                      />
                    )}
                  </div>
                )}

                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={phase === "sending" || (rating == null && message.trim().length < 10)}
                    className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {phase === "sending" ? "Sending…" : "Send feedback"}
                  </button>
                  <button type="button" onClick={close} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* ── Step 3: thanks, and (only if positive) the share offer ──── */}
            {phase === "done" && (
              <>
                <h2 id="rc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  Thanks — that&apos;s genuinely useful.
                </h2>
                {positive ? (
                  <>
                    <p className="mt-1 text-sm text-slate-400">
                      If RiftCompare saved you money, the single most useful thing you can do is tell one
                      other person who buys Riftbound.
                    </p>
                    <ShareRow source="feedback_widget" size="sm" className="mt-4" />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    We read every one of these{email.trim() ? " — and we'll come back to you at that address" : ""}.
                  </p>
                )}
                <button type="button" onClick={close} className="btn-ghost mt-5 text-xs">
                  Close
                </button>
              </>
            )}
      </Dialog>
    </>
  );
}
