"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { AuthForm } from "./AuthForm";
import { PITCH_TOOLS } from "./PremiumSlideIn";
import { PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD, premiumLockInTail } from "@/lib/site";

// Shown once per BROWSER SESSION (sessionStorage, not localStorage) — dismissing
// suppresses it for the rest of that session/tab, but it comes back on the next
// visit once the tab/browser is closed and reopened. Signing up suppresses it for
// good, same as before, simply because a signed-in visitor never re-enters this
// effect at all (see the `user` check below). Fires on every route, including the
// homepage.
//
// THIS IS NOW A PREMIUM PITCH, NOT A FREE-ACCOUNT MOMENT (2026-09-04, explicit
// product instruction: "change the sign up pop up ... to a get premium pop up").
//
// Collapses what used to be two separate touchpoints into one. Before this: a
// signed-out visitor saw an honest free-account comparison here; ONLY once they
// had signed up AND browsed a couple more pages did PremiumSlideIn (see that
// file) ever mention Premium at all. That is a real gap for a visitor who came
// in already wanting the pro tools — they had to survive a whole separate,
// later, dwell-gated nudge before anyone told them Premium existed. This popup
// now leads with Premium directly, and its one CTA (the same OAuth buttons every
// signup surface uses) sends them to /premium after the round trip instead of
// back to wherever they were — sign-up is the necessary first step toward
// buying Premium, not a separate errand to run some other day.
//
// THIS IS NOT THE COMP THAT WAS REMOVED 2026-08-23. That removal (see
// lib/premium.ts's "NO PREMIUM ON SIGNUP" note) deleted an AUTOMATIC grant —
// creating an account used to silently hand over some real days of the paid
// tier for free, no purchase involved. Nothing here grants anything: this is a
// pitch plus a redirect, the exact same pattern PremiumDialog.tsx already uses
// for a signed-out visitor who clicks "Get Premium" elsewhere on the site
// (`<Link href="/login?next=/premium">Create a free account to start →</Link>`)
// — just surfaced as the FIRST thing a new visitor sees instead of something
// they have to go find. Premium itself is still only ever reached by a real
// Stripe trial/checkout on /premium, same as always.
//
// The free ACCOUNT tier (watchlist, price alerts, portfolio) still exists and
// is still real — it's what /login's own AuthForm sells (see its PERKS list)
// and what a visitor gets regardless of whether they ever pay for Premium. This
// popup just isn't the surface that leads with it any more.
const SEEN_KEY = "rc_signup_promo_seen";

// A CORNER SLIDE-IN, NOT A MODAL (2026-09-01). This used to be a full-screen
// dialog — backdrop, scroll-locked, focus-trapped, centred card. That shape had
// already cost this codebase one production incident on its own (see
// tests/signup-slidein.test.ts's header for the short-phone history) and, more
// basically, is a much bigger interruption than a corner card needs to be.
// PremiumSlideIn already proved the pattern for the logged-in audience: a small
// corner card that never blocks scroll, never traps focus, and yields to any
// REAL modal (checks the shared body[data-rc-dialog] flag, same as before — but
// no longer SETS it, since it no longer blocks anything itself). The two
// audiences are exclusive by construction (signed-out here, signed-in-non-
// Premium there), so sharing PremiumSlideIn's exact corner, z-tier AND now its
// gold Premium colouring is safe — they can never be on screen at the same time
// for the same visitor, and a visitor who does see both across two sessions
// should recognise them as the same offer, not two different ones.
//
// The MECHANICS below — dismissal persistence, non-modal behaviour, entrance/
// exit transition — are UNCHANGED from every version before this one. Only the
// PITCH (this file's whole body, below) and the CTA's destination changed.

// NO DELAY, NO BUY-CLICK-AWARE TIMING (2026-09-01, explicit product decision).
//
// This used to be timed around buy_click — a 30s base delay, held off longer on
// a page with an un-clicked buy link, shown fast right after one WAS clicked —
// specifically so it could never cover the affiliate buy button. That system is
// gone on purpose: it shows the instant a signed-out visitor is eligible, on
// any page, with no wait and no buy-link awareness.
//
// KNOWN, ACCEPTED TRADE-OFF, not an oversight: the whole reason the old system
// existed was that a bare delay (an earlier 5s version) measurably cost the
// site — bounce rose, pages/visitor fell, buy_click fell, and 78% of visitors
// dismissed it outright. Going instant reopens exactly that risk, including
// landing on top of a card page's buy button. If pages/visitor or buy_click
// drop again after this ships, that history is the first thing to revisit —
// but the instruction behind this version was explicit and repeated, so this
// is not a "someone forgot" gap the way the pre-timing version once was. The
// same trade-off now applies to a Premium pitch rather than a free-account one,
// which is a strictly bigger ask of a visitor who has seen nothing else yet —
// worth watching signup_promo_dismissed and sign_up for after this ships.
//
// /premium is also skipped — no point pitching "sign up to reach Premium" to a
// visitor already standing on the page that sells it (same reasoning
// PremiumSlideIn's own SKIP_PATHS already applies).
const SKIP_PATHS = ["/login", "/verify", "/premium"];

// Distinguishes this behaviour from every version before it, on
// signup_promo_shown/_dismissed, so variants are separable in GA4 rather than
// averaged together across the changeover — same convention this field has
// always followed. "comparison" (the original modal, free-account pitch) →
// "comparison_slidein" (chrome became a slide-in) → "comparison_instant" (the
// delay/buy-click timing was removed entirely) → "premium_pitch" (the pitch
// itself changed from a free-account comparison to Premium, 2026-09-04). Each
// name records which axis changed; this one changes CONTENT, not chrome or
// timing, so it gets a genuinely new name rather than another suffix.
//
// READ THESE IN GA4, NOT VERCEL. Both events are in GA4_ONLY_EVENTS
// (lib/analytics.ts): shown is an impression that fires for a large share of
// visitors, and Vercel bills custom events against a monthly quota, so the pair
// was crowding out buy_click and sign_up. The trackEvent() calls below are
// unchanged and still carry this variant — only the Vercel leg is suppressed.
const PROMO_VARIANT = "premium_pitch";

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
  const { user, loaded, trialDays } = useMe();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false); // drives the slide-in transition

  // A brand-new account has, by definition, never started a trial before — so
  // unlike PremiumSlideIn's `trialEligible` (which useMe() only computes for a
  // SIGNED-IN user, checking their own trialStartedAt), eligibility here needs
  // no per-user check at all. `trialDays` itself is plain config (the
  // configured trial LENGTH, 0 if the trial is off) and is populated by
  // /api/me for signed-out callers too — see lib/use-me.ts's Me type and
  // api/me/route.ts's unconditional `trialDays: PREMIUM_TRIAL_DAYS`.
  const trialAvailable = trialDays > 0;

  useEffect(() => {
    if (!loaded || user || shown) return;
    if (SKIP_PATHS.some((p) => pathname?.startsWith(p))) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode — worst case it can show again next page load */
    }
    if (seen) return;
    // Never slide in on top of a real modal. FeedbackWidget sets this flag
    // while its panel is open; sliding a signup pitch in over a visitor who is
    // mid-sentence writing us feedback would lose the feedback entirely.
    // Deliberately does NOT mark SEEN_KEY when it skips, so that visitor still
    // gets the promo on the next page rather than silently losing it forever.
    if (document.body.dataset.rcDialog === "1") return;

    setShown(true);
    // Next paint → play the transition from the off-screen start state, same
    // double-rAF as PremiumSlideIn (one frame isn't reliably enough for the
    // browser to have committed the initial off-screen styles first). This is
    // the animation settling in, not a deliberate wait — it's a couple of
    // frames, not a timer.
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    trackEvent("signup_promo_shown", { path: pathname ?? "/", variant: PROMO_VARIANT });
  }, [loaded, user, shown, pathname]);

  // Mirrors PremiumSlideIn's hide(): let the exit transition finish before
  // actually unmounting, instead of popping out instantly.
  const hide = useCallback(() => {
    setEntered(false);
    setTimeout(() => setShown(false), 250);
  }, []);

  const dismiss = useCallback(() => {
    hide();
    trackEvent("signup_promo_dismissed", { variant: PROMO_VARIANT });
    // PERSISTS THE DISMISSAL for the rest of the browser session. The arming
    // effect above reads SEEN_KEY before it re-arms, so a dismissed promo does
    // not come back on the next pageview — only on a genuinely new session
    // (tab/browser closed and reopened). Written synchronously here, not on a
    // later effect, so a dismiss immediately followed by a navigation still
    // sticks.
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }, [hide]);

  // Esc dismisses it — non-trapping, because this is not a modal (matches
  // PremiumSlideIn exactly: no focus trap, no scroll lock, no aria-modal).
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!shown) return null;

  const heading = trialAvailable ? "Try Premium free" : `Unlock ${PITCH_TOOLS.length} power tools`;

  return (
    // Bottom-LEFT, same corner and z-tier as PremiumSlideIn (z-[70], under every
    // real modal). Safe to share: this audience (signed-out) and PremiumSlideIn's
    // (signed-in, non-Premium) are mutually exclusive for any one visitor, so the
    // two can never stack.
    <div
      role="region"
      aria-label="RiftCompare Premium — sign up to get started"
      className={`fixed bottom-20 left-4 z-[70] w-[calc(100%-2rem)] max-w-sm transition-all duration-300 sm:bottom-4 sm:w-auto ${
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-gold/50 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-950/60 px-4 py-2.5">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Premium
          </span>
          <span className="text-xs font-semibold text-slate-200">{heading}</span>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="ml-auto -mr-1 rounded px-1 text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-1 pt-3">
          <p className="text-xs leading-relaxed text-slate-400">RiftCompare Premium adds the pro tools and goes ad-free:</p>

          {/* Same chip row as PremiumSlideIn, same shared PITCH_TOOLS — see that
              file's own header comment for why this is a hand-maintained list
              pinned against TIER_COMPARISON by tests/premium-slidein.test.ts,
              rather than a second one drifting here independently. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PITCH_TOOLS.map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-1 text-[10px] font-semibold text-slate-300"
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
              </span>
            ))}
          </div>

          {/* Same rule as PremiumSlideIn: while a trial is available, the price
              stays off this card entirely — the full "$0 due today, then
              $X/mo after N days, card required" breakdown is what /premium
              itself shows before anything is charged, and repeating a partial
              version here risks reading as a different, contradicting number.
              Once there's no trial to lean on, the price belongs here, same as
              it always has. */}
          {!trialAvailable && PREMIUM_PRICE_AMOUNT ? (
            <p className="mt-2 text-[11px] text-slate-500">
              <span className="font-bold text-white">{PREMIUM_PRICE_AMOUNT}</span>/{PREMIUM_PRICE_PERIOD} ·{" "}
              {premiumLockInTail()}
            </p>
          ) : null}
        </div>

        <div className="px-4 pb-4 pt-3">
          <p className="text-xs font-semibold text-slate-300">Sign up to get started — free, no card needed:</p>
          {/* next="/premium", not the current page: the whole point of this
              redesign is that sign-up IS the first step toward Premium, so the
              OAuth round trip lands the visitor ready to start a trial or
              check out, instead of back where they were with Premium still
              something they have to go find later. */}
          <AuthForm providers={providers} bare compact source="popup" next="/premium" />
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-slate-400 hover:bg-ink-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
