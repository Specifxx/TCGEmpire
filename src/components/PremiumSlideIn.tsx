"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { usePremiumDialog } from "./PremiumDialog";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD } from "@/lib/site";

// A LOW-INTRUSION Premium nudge for LOGGED-IN, NON-PREMIUM users — aimed squarely
// at the funnel gap behind "the dialog converts well but few people open it".
// The gated tools (Deal Finder, Value Finder, Bulk Pricer) already sell hard with
// their own blur walls, but most logged-in free users never visit a tool page;
// they browse prices. This puts one Premium moment in front of that browsing
// majority, at a natural pause a few pages into a session.
//
// DELIBERATELY NOT A MODAL. It is a corner slide-in that never covers content,
// never locks scroll, and yields to any real modal — it checks the shared
// body[data-rc-dialog] flag the signup/feedback modals set, and never sets it
// itself. The signup popup — the site's one full-screen auto-modal — is
// signed-OUT only (see SignupPromoPopup), so the two audiences never overlap.
//
// FREQUENCY IS CAPPED HARD, because a repeat nag just trains dismissal:
//   • once per browser session (sessionStorage), so navigating doesn't re-pop it
//   • a 7-day snooze after a dismiss; a 14-day snooze after they engage the CTA
//   • NEVER AGAIN after two dismissals (localStorage) — a firm no is permanent
// `premium` from useMe() already covers the most important suppression: anyone
// with access right now — PAID or mid-trial/preview — reads as premium, so this
// only ever targets someone who genuinely has no Premium and can buy it.

const SESSION_SEEN = "rc_prem_slidein_session"; // sessionStorage: shown this session
const DISMISS_COUNT = "rc_prem_slidein_dismisses"; // localStorage: lifetime dismissals
const SNOOZE_UNTIL = "rc_prem_slidein_until"; // localStorage: epoch ms; don't show before this
const PV_KEY = "rc_prem_slidein_pv"; // sessionStorage: this component's own per-session pageview count

// "after they visit 2 pages in one session" — engaged, not a first-impression pop.
const MIN_PAGEVIEWS = 2;
// Let them settle on the qualifying page before it slides in (a natural pause,
// not the instant the page renders).
const DWELL_MS = 12_000;
// A second dismissal means never again — two firm no's is a no.
const MAX_DISMISSALS = 2;
const SNOOZE_AFTER_DISMISS_MS = 7 * 864e5; // 7 days
const SNOOZE_AFTER_CLICK_MS = 14 * 864e5; // 14 days

// Don't nudge on auth pages or on /premium itself (they're already there).
const SKIP_PATHS = ["/login", "/verify", "/premium"];

// REDESIGNED 2026-08-30. Conversion was low and the old copy had also drifted
// out of date — a hand-written sentence naming three tools (Bulk Pricer, Value
// Finder, Deal Finder) that predated Best Basket moving back to Premium and
// Demand Finder shipping (see lib/premium.ts's tier note), so the pitch was
// both weak AND wrong by the time this changed. Two fixes at once:
//   1. A chip row enumerating every Premium-exclusive tool, so the claim can
//      never silently go stale again the way the prose sentence did — add a
//      tool here and it just appears, same shape as TIER_COMPARISON.
//   2. The price and "locked in for good" line promoted out of a tiny caption
//      into a real line — it's the same genuine, non-fake incentive /premium
//      and the dialog already lead with (subscribe now, price never rises),
//      just previously absent from the one surface logged-in browsers actually
//      see unprompted.
// Every entry here must be a real Premium-only TIER_COMPARISON row.
//
// EXPORTED so SignupPromoPopup's Premium pitch (2026-09-04) can reuse the exact
// same list rather than growing its own hand-typed copy — the drift this file's
// own header comment describes ("a hand-written sentence... drifted out of
// date") is exactly what a second copy would risk again.
export const PITCH_TOOLS: { emoji: string; label: string }[] = [
  { emoji: "📋", label: "Bulk Pricer" },
  { emoji: "🧺", label: "Best Basket" },
  { emoji: "🔎", label: "Value Finder" },
  { emoji: "🚀", label: "Rising Cards" },
  { emoji: "📊", label: "Demand Finder" },
  { emoji: "💱", label: "Deal Finder" },
];

function readNum(store: Storage | undefined | null, key: string): number {
  try {
    return Number(store?.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function PremiumSlideIn() {
  const { user, premium, premiumCheckout, trialEligible, trialDays, loaded } = useMe();
  const { open: openPremium } = usePremiumDialog();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false); // drives the slide-in transition
  const lastCountedPath = useRef<string | null>(null);

  // Count route views once per pathname, on its own key so this component never
  // depends on the signup popup's counter existing.
  useEffect(() => {
    if (!pathname || lastCountedPath.current === pathname) return;
    lastCountedPath.current = pathname;
    try {
      sessionStorage.setItem(PV_KEY, String(readNum(sessionStorage, PV_KEY) + 1));
    } catch {
      /* private mode — the arming gate below just fails to show, which is fine */
    }
  }, [pathname]);

  const eligible =
    loaded && !!user && !premium && premiumCheckout && !SKIP_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (!eligible || shown) return;

    let ls: Storage | null = null;
    let ss: Storage | null = null;
    try {
      ls = window.localStorage;
      ss = window.sessionStorage;
    } catch {
      /* storage blocked — treat as "no prior state", the caps below all fail open to showing once */
    }

    // Hard caps, cheapest first.
    if (readNum(ls, DISMISS_COUNT) >= MAX_DISMISSALS) return; // a firm no is permanent
    if (Date.now() < readNum(ls, SNOOZE_UNTIL)) return; // snoozed
    try {
      if (ss?.getItem(SESSION_SEEN) === "1") return; // already shown this session
    } catch {
      /* ignore */
    }
    if (readNum(ss, PV_KEY) < MIN_PAGEVIEWS) return; // not engaged enough yet

    const t = setTimeout(() => {
      // Never slide in on top of a real modal (signup / feedback / premium dialog).
      if (typeof document !== "undefined" && document.body.dataset.rcDialog === "1") return;
      try {
        ss?.setItem(SESSION_SEEN, "1");
      } catch {
        /* ignore */
      }
      setShown(true);
      // Next paint → play the transition from the off-screen start state.
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      trackEvent("premium_slidein_shown", { path: pathname ?? "/", trial_eligible: trialEligible });
    }, DWELL_MS);

    return () => clearTimeout(t);
  }, [eligible, shown, pathname, trialEligible]);

  const hide = useCallback(() => {
    setEntered(false);
    setTimeout(() => setShown(false), 250); // let the exit transition finish
  }, []);

  const dismiss = useCallback(() => {
    hide();
    try {
      window.localStorage.setItem(DISMISS_COUNT, String(readNum(window.localStorage, DISMISS_COUNT) + 1));
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_DISMISS_MS));
    } catch {
      /* ignore */
    }
    trackEvent("premium_slidein_dismissed", {});
  }, [hide]);

  const accept = useCallback(() => {
    trackEvent("premium_slidein_click", { trial_eligible: trialEligible });
    try {
      // Engaged, not rejected: a long snooze rather than a dismissal strike, so
      // not buying THIS time doesn't burn one of their two permanent no's.
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_CLICK_MS));
    } catch {
      /* ignore */
    }
    hide();
    openPremium(); // opens the shared dialog (which fires its own /api/premium/click beacon)
  }, [hide, openPremium, trialEligible]);

  // Esc closes it — non-trapping, because this is not a modal.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!shown) return null;

  const heading = trialEligible ? "Try Premium free" : `Unlock ${PITCH_TOOLS.length} power tools`;
  const cta = trialEligible && trialDays > 0 ? `Start ${trialDays}-day free trial →` : "Unlock Premium →";

  return (
    // Bottom-LEFT so it never collides with the bottom-right feedback pill
    // (FeedbackWidget, fixed bottom-4 right-4). Lifted to bottom-20 on phones so
    // it clears that pill; z-[70] keeps it under every real modal (feedback panel
    // z-85, premium dialog z-120) while sitting above page chrome. SignupPromoPopup
    // shares this exact z-tier now too (it became a non-modal slide-in itself,
    // 2026-09-01) — safe, since the two audiences (signed-out here, signed-in
    // non-Premium there) can never both apply to the same visitor at once.
    <div
      role="region"
      aria-label="RiftCompare Premium offer"
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
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed text-slate-400">
            You&apos;ve been comparing prices — Premium adds the pro tools and goes ad-free:
          </p>
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
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={accept}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink-950 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/50"
            >
              {cta}
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-ink-800 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              Not now
            </button>
          </div>
          {!trialEligible && PREMIUM_PRICE_AMOUNT ? (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              <span className="font-bold text-white">{PREMIUM_PRICE_AMOUNT}</span>/{PREMIUM_PRICE_PERIOD} · locked in
              for good, cancel anytime
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
