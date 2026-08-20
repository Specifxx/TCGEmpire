"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { ShareRow } from "./ShareRow";

// Site-wide feedback / review widget.
//
// WHY A PERSISTENT LAUNCHER AND NOT A SECOND POPUP. The site already auto-opens
// one full-screen dialog at 25s (SignupPromoPopup), and that component's own
// header records the real user feedback that prompted it: "ads + subscription
// pitch + a still-growing marketplace all at once read as overwhelming /
// untrustworthy to a new visitor". Adding a second uninvited interruption to
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

const LAUNCHER_HIDDEN_PATHS = ["/login", "/verify", "/admin"];

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
  const [overAdZone, setOverAdZone] = useState(false);
  const [overHero, setOverHero] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const positive = rating != null && rating >= 4;

  // ── Never float over an ad ────────────────────────────────────────────────
  // FooterAds renders a real AdSense-adjacent affiliate unit directly above the
  // footer (layout.tsx), and Google's program policies prohibit ads being
  // obscured by floating page furniture. This repo has an active AdSense
  // remediation history (docs/adsense-remediation.md), so the launcher yields:
  // while the ad zone is anywhere in the viewport, it hides entirely. Costs one
  // observer and removes the whole class of violation.
  useEffect(() => {
    const zone = document.getElementById("rc-ad-zone");
    if (!zone || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setOverAdZone(entries[0]?.isIntersecting ?? false));
    io.observe(zone);
    return () => io.disconnect();
  }, [pathname]);

  // ── Never compete with the hero's search + autocomplete ──────────────────
  // The homepage-redesign brief flags this exact launcher (fixed bottom-4
  // right-4) as a real risk of sitting near — and on a short mobile viewport,
  // occasionally under — the hero search's autocomplete dropdown, right at
  // the one moment the whole redesigned page is built around. Rather than
  // hand-roll a scrollY threshold, this reuses the SAME pattern the ad-zone
  // check right above it already established: look for a marker element by
  // id and hide for as long as it's in view. CinematicHero's outermost
  // section carries id="rc-hero" for exactly this. On every OTHER route
  // (149 of them), that id doesn't exist, `zone` is null, and this becomes a
  // pure no-op — so the launcher's behavior everywhere except the homepage
  // is completely unchanged by this effect.
  useEffect(() => {
    const zone = document.getElementById("rc-hero");
    if (!zone || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setOverHero(entries[0]?.isIntersecting ?? false));
    io.observe(zone);
    return () => io.disconnect();
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    // Hand focus back where it came from — a dialog that drops focus to the
    // document strands keyboard and screen-reader users at the top of the page.
    launcherRef.current?.focus();
  }, []);

  // ESC to close + a focus trap for as long as the panel is open.
  useEffect(() => {
    if (!open) return;
    // SignupPromoPopup reads this before auto-opening, so the two dialogs can
    // never stack. It skips WITHOUT marking itself seen, so that visitor still
    // gets it on a later visit rather than silently losing it.
    document.body.dataset.rcDialog = "1";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      delete document.body.dataset.rcDialog;
    };
  }, [open, close]);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open, phase]);

  function openWidget() {
    setOpen(true);
    setPhase("rating");
    setError(null);
    track("feedback_open", { path: pathname ?? "/" });
  }

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

  if (LAUNCHER_HIDDEN_PATHS.some((p) => pathname?.startsWith(p))) return null;

  return (
    <>
      {/* Launcher. z-40 keeps it under every dialog (SignupPromoPopup is z-75,
          QuickView z-60) and under the sticky nav, so it can never trap or
          cover a more important surface.

          Sized down to a 44x44 icon-only circle below `sm` (was a wider
          "💬 Feedback" pill at every breakpoint, measuring ~38px tall on a
          real mobile viewport — under this site's own 44px tap-target floor,
          and a bigger footprint than it needed on the viewport most likely
          to have it fighting for space against other page furniture). The
          text label returns from `sm:` up, where there's room to spare and
          no touch-target minimum to hit; `aria-label` keeps the accessible
          name identical in both states so this is a visual-only change.
          `!overHero` (see the effect above) additionally hides the whole
          launcher on the homepage for as long as the hero is in view. */}
      {!open && !overAdZone && !overHero && (
        <button
          ref={launcherRef}
          type="button"
          onClick={openWidget}
          aria-label="Send feedback"
          className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-ink-700 bg-ink-900/95 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur transition-colors hover:border-brand-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
        >
          <span aria-hidden>💬</span>
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/70" onClick={close} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-feedback-title"
            className="card-surface relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close feedback"
              className="absolute right-3 top-3 rounded-lg px-2 py-1 text-slate-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              ✕
            </button>

            {/* ── Step 1: the rating ─────────────────────────────────────── */}
            {phase === "rating" && (
              <>
                <h2 id="rc-feedback-title" className="pr-8 text-lg font-extrabold text-white">
                  How&apos;s RiftCompare working for you?
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  One tap. No account needed — we read every one.
                </p>
                <div className="mt-4 flex justify-center gap-1.5" role="group" aria-label="Rate RiftCompare out of 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      ref={n === 1 ? firstFieldRef : undefined}
                      type="button"
                      onClick={() => pickRating(n)}
                      aria-label={`${n} out of 5`}
                      className="rounded-lg px-2 py-1 text-3xl leading-none text-ink-600 transition-colors hover:text-gold focus:outline-none focus:ring-2 focus:ring-brand-500/50"
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
                  className="mx-auto mt-4 block text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  Skip — I just want to report something
                </button>
              </>
            )}

            {/* ── Step 2: the follow-up, routed by sentiment ──────────────── */}
            {(phase === "detail" || phase === "sending") && (
              <>
                <h2 id="rc-feedback-title" className="pr-8 text-lg font-extrabold text-white">
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
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />

                {!positive && (
                  <input
                    type="email"
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
                <h2 id="rc-feedback-title" className="pr-8 text-lg font-extrabold text-white">
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
          </div>
        </div>
      )}
    </>
  );
}
