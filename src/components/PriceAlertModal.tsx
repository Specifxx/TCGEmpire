"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { markSignupSource } from "@/lib/signup-source";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { useMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { AuthForm } from "./AuthForm";

// Where we remember the visitor's email so clicking "watch price" again
// doesn't re-prompt — it silently extends their existing watch instead.
const EMAIL_KEY = "rc_alert_email";

// Fired by PriceWatchButton with the ONE card just watched.
export interface PriceAlertPromptDetail {
  cardId: string;
}

type Phase = "form" | "success" | "error";

// A global, single-instance modal that turns a "watch this price" click into
// an opt-in for price-drop emails on that one card. Mounted once in the root
// layout (inside CountryProvider).
//
// ACCOUNT-FIRST, EMAIL-ALWAYS-AVAILABLE (2026-08-21). This modal sits on the
// site's highest-intent moment (every card tile, QuickView, twice on the card
// page) and used to lead with "No account needed — just an email", which
// undercut the #1 perk every signup surface pitches. The email path is a
// deliberate prior decision and STAYS — unchanged behavior, one input, no
// gate — but the one-tap account option is now presented first, and the
// email-success + silent-extend paths gained a low-key "manage these in a
// free account" link (true via claimAlertsForUser: existing watches are
// adopted on signup by email match). Guardrail: if price_alert_subscribed
// craters without a compensating sign_up rise, revert the form-phase layout
// only — the success/silent upsells are pure upside.
export function PriceAlertModal({ providers = [] }: { providers?: ("google" | "discord")[] }) {
  const { country } = useCountry();
  const { user, loaded: meLoaded } = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  // Lightweight toast for the silent (already-subscribed) path. `accountLink`
  // adds a low-key "manage in a free account" line — the ONLY account pitch a
  // habitual anonymous watcher ever sees, since this path never opens a modal.
  const [toast, setToast] = useState<{ msg: string; accountLink?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((msg: string, accountLink = false) => {
    setToast({ msg, accountLink });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // A toast with a link needs longer than a pure confirmation blip.
    toastTimer.current = setTimeout(() => setToast(null), accountLink ? 6000 : 3500);
  }, []);

  // Subscribe one card for the active market.
  const subscribe = useCallback(
    async (addr: string, cardId: string): Promise<{ ok: boolean }> => {
      try {
        const res = await fetch("/api/alerts/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addr, cardIds: [cardId], market: country }),
        });
        return { ok: res.ok };
      } catch {
        return { ok: false };
      }
    },
    [country]
  );

  // React to PriceWatchButton clicks.
  useEffect(() => {
    const ls = () => (typeof localStorage !== "undefined" ? localStorage : null);

    const handler = (e: Event) => {
      const cardId = (e as CustomEvent<PriceAlertPromptDetail>).detail?.cardId;
      if (!cardId) return;
      const saved = ls()?.getItem(EMAIL_KEY) ?? null;
      if (saved) {
        // Returning subscriber — extend their watch quietly, no modal. Counted
        // separately from price_alert_subscribed: this is the cohort that gets
        // value repeatedly without ever seeing an account (or any other) pitch,
        // and its size was invisible before this event existed.
        void subscribe(saved, cardId).then((r) => {
          if (r.ok) {
            flashToast("Watching this card's price ✓", true);
            trackEvent("price_alert_silent_extend", { card: cardId });
          }
        });
        return;
      }
      setPendingCardId(cardId);
      setPhase("form");
      setEmail("");
      setOpen(true);
      trackEvent("price_alert_modal_shown", { trigger: "auto" });
    };

    // Deliberate "email me when it drops" click (CardConversionCta) — always
    // opens the form for that card, bypassing the once-ever auto-prompt gate,
    // since this is an explicit high-intent action rather than a passive click.
    const openHandler = (e: Event) => {
      const cardId = (e as CustomEvent<PriceAlertPromptDetail>).detail?.cardId;
      if (!cardId) return;
      setPendingCardId(cardId);
      // A signed-in member who reaches this modal (the card page's explicit
      // "email me" CTA fires regardless of auth) just subscribes on their
      // account address — no reason to make them type it.
      setEmail(user?.email ?? ls()?.getItem(EMAIL_KEY) ?? "");
      setPhase("form");
      setOpen(true);
      trackEvent("price_alert_modal_shown", { trigger: "explicit" });
    };

    window.addEventListener("price-alert-prompt", handler as EventListener);
    window.addEventListener("price-alert-open", openHandler as EventListener);
    return () => {
      window.removeEventListener("price-alert-prompt", handler as EventListener);
      window.removeEventListener("price-alert-open", openHandler as EventListener);
    };
  }, [subscribe, flashToast, user?.email]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || !pendingCardId) return;
    setSubmitting(true);
    const r = await subscribe(addr, pendingCardId);
    setSubmitting(false);
    if (r.ok) {
      try {
        localStorage.setItem(EMAIL_KEY, addr.toLowerCase());
      } catch {
        /* private mode — fine, we just re-prompt next time */
      }
      // trackEvent (GA4 + Vercel), not the old Vercel-only track() — this is
      // the site's highest-volume conversion event and GA4 couldn't see it,
      // which made any GA4 funnel around alerts/signup silently incomplete.
      trackEvent("price_alert_subscribed", { card: pendingCardId });
      setPhase("success");
    } else {
      setPhase("error");
    }
  }

  return (
    <>
      {/* Toast (silent path) */}
      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
          <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-center text-sm font-medium text-slate-100 shadow-2xl">
            {toast.msg}
            {toast.accountLink && !user && (
              <Link
                href="/login?next=/watching"
                rel="nofollow"
                onClick={() => markSignupSource("alert_success")}
                className="mt-0.5 block text-xs font-semibold text-brand-400 hover:underline"
              >
                Manage your watches in a free account →
              </Link>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 tap-icon  rounded-full text-slate-400 hover:bg-ink-800 hover:text-slate-200"
            >
              ✕
            </button>

            {phase === "form" && (
              <form onSubmit={onSubmit} className="p-6">
                <div className="mb-1 flex items-center gap-2 text-gold">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 5 5.2 5c1.9 0 3.2 1 3.8 2.2C9.6 6 11 5 12.8 5 16 5 17.6 8.4 16 11.8 13.5 16.4 12 21 12 21z" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide">Watching this card</span>
                </div>
                <h2 className="font-display text-xl font-bold text-white">Get a price-drop email</h2>
                {/* ACCOUNT FIRST for signed-out visitors — this is the site's
                    highest-intent moment, and it used to hand it straight to an
                    email field. The email path below is UNCHANGED and always
                    visible; nothing is gated. Signed-in members (who reach this
                    via the card page's explicit CTA) skip straight to the
                    prefilled email form. meLoaded gate: render neither pitch
                    until auth state is known, so the account block never
                    flashes at a member. */}
                {meLoaded && !user && providers.length > 0 && (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      Fastest — one tap, and your watchlist follows you everywhere:
                    </p>
                    <div className="mt-3">
                      <AuthForm
                        providers={providers}
                        bare
                        compact
                        source="alert_modal"
                        next={pathname ?? undefined}
                        onProviderClick={() => {
                          // Stash the watch so SignupWelcome completes it after
                          // the OAuth round trip — picking the account path
                          // must never lose the card they came to watch.
                          try {
                            if (pendingCardId) {
                              localStorage.setItem(
                                PENDING_WATCH_KEY,
                                JSON.stringify({ cardId: pendingCardId, market: country }),
                              );
                            }
                          } catch {
                            /* private mode — they land signed in, just without the auto-watch */
                          }
                        }}
                      />
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-600">
                      <span className="h-px flex-1 bg-ink-700" aria-hidden />
                      or just get emails — no account needed
                      <span className="h-px flex-1 bg-ink-700" aria-hidden />
                    </div>
                  </>
                )}
                {(!meLoaded || user || providers.length === 0) && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    We&apos;ll email you the moment this card gets cheaper. Unsubscribe anytime.
                  </p>
                )}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input mt-4"
                />
                <button type="submit" disabled={submitting} className="btn-primary mt-3 w-full">
                  {submitting ? "Subscribing…" : "Notify me of price drops"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300"
                >
                  No thanks
                </button>
              </form>
            )}

            {phase === "success" && (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-500/15 text-brand-400">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-white">You&apos;re all set</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
                  We&apos;re watching this card&apos;s price. We&apos;ll email you the moment it drops. Check your
                  inbox for a confirmation.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">
                  Done
                </button>
                {!user && (
                  <p className="mt-3 text-xs text-slate-400">
                    Want to manage these in one place?{" "}
                    <Link
                      href="/login?next=/watching"
                      rel="nofollow"
                      onClick={() => markSignupSource("alert_success")}
                      className="font-semibold text-brand-400 hover:underline"
                    >
                      Create a free account
                    </Link>{" "}
                    — your watches come with you.
                  </p>
                )}
              </div>
            )}

            {phase === "error" && (
              <div className="p-6 text-center">
                <h2 className="font-display text-xl font-bold text-white">Something went wrong</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
                  We couldn&apos;t set up your alerts just now. Please try again in a moment.
                </p>
                <button onClick={() => setPhase("form")} className="btn-primary mt-4 w-full">
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
