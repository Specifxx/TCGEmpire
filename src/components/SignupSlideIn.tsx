"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { trackSignupCta } from "@/lib/growth-events";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "@/lib/nudge-timing";
import { signupCardEligible } from "@/lib/nudge-gate";
import { armNudge, useSessionViews } from "@/lib/nudge-runtime";
import { usePresence } from "@/lib/motion";

// THE SIGNED-OUT SIGN-UP CARD, RESTORED 2026-10-15 (owner: "bring the sign up
// now pop up again to get more people to register … gate it and make it
// appear after so many pages, because some people just are annoyed at it").
// Reverses 2026-09-30's "The sign-up slider is gone" (DECISIONS.md) for this
// card only; the in-page InlineSignupPrompt stays as it was.
//
// Built on the same parts as PremiumSlideIn, so the two behave as one system:
//   - eligible from the visit's 4th page (lib/nudge-gate.ts signupCardEligible),
//     never on the sign-in pages, /premium or /pokemon;
//   - NUDGE_DELAY_MS (12 s) after eligibility, and only at a quiet moment: never
//     over a dialog, mid-typing or mid-scroll (lib/nudge-runtime.ts armNudge);
//   - once a session; two ✕ and it never comes back; a 7-day snooze after a
//     dismissal and 14 days after a click (lib/nudge-timing.ts).
// A corner card, never a modal: it covers nothing and locks nothing, and the
// free account it offers costs nothing, so it names no price.
const PV_KEY = "rc_signup_pv";
const SESSION_SEEN = "rc_signup_card_seen";
const DISMISS_COUNT = "rc_signup_card_dismissed";
const SNOOZE_UNTIL = "rc_signup_card_snooze";

function readNum(store: Storage | null, key: string): number {
  try {
    return Number(store?.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function SignupSlideIn() {
  const { user, loaded, answered } = useMe();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const { mounted, entered } = usePresence(shown, 250);
  const signedOut = loaded && answered === true && !user;
  const views = useSessionViews(PV_KEY, pathname, signedOut);
  const eligible = signedOut && signupCardEligible({ views, pathname });

  useEffect(() => {
    if (!eligible || shown) return;
    let ls: Storage | null = null;
    let ss: Storage | null = null;
    try {
      ls = window.localStorage;
      ss = window.sessionStorage;
    } catch {
      /* storage blocked: no prior state, so it may show once */
    }
    if (readNum(ls, DISMISS_COUNT) >= MAX_NUDGE_DISMISSALS) return;
    if (Date.now() < readNum(ls, SNOOZE_UNTIL)) return;
    try {
      if (ss?.getItem(SESSION_SEEN) === "1") return;
    } catch {
      /* ignore */
    }
    return armNudge({
      delayMs: NUDGE_DELAY_MS,
      onFire: () => {
        try {
          ss?.setItem(SESSION_SEEN, "1");
        } catch {
          /* ignore */
        }
        setShown(true);
        trackEvent("signup_card_shown", { path: pathname ?? "/" });
      },
    });
  }, [eligible, shown, pathname]);

  const dismiss = useCallback(() => {
    setShown(false);
    try {
      window.localStorage.setItem(DISMISS_COUNT, String(readNum(window.localStorage, DISMISS_COUNT) + 1));
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_DISMISS_MS));
    } catch {
      /* ignore */
    }
    trackEvent("signup_card_dismissed", {});
  }, []);

  const accept = useCallback(() => {
    trackSignupCta("signup_card");
    trackEvent("signup_card_click", { path: pathname ?? "/" });
    try {
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_CLICK_MS));
    } catch {
      /* ignore */
    }
    setShown(false);
  }, [pathname]);

  // Esc closes it, unless a real dialog owns that key.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.rcDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!mounted) return null;
  const next = pathname ?? "/";

  return (
    // Bottom-left, like PremiumSlideIn (the two never meet: this one is signed
    // out, that one signed in), clear of the feedback pill on the right.
    <div
      role="region"
      aria-label="Create a free account"
      className={`above-bottombar fixed left-4 z-[70] w-[calc(100%-2rem)] max-w-[20rem] transition-[opacity,transform] duration-slow ease-out sm:w-80 ${
        entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"
      }`}
    >
      <div className="rounded-xl border border-brand-500/40 bg-ink-900 shadow-2xl">
        <div className="flex items-start gap-2 py-1 pl-4 pr-1">
          <p className="min-w-0 flex-1 pt-2.5 text-sm font-semibold leading-snug text-slate-100">Watch the cards you want, free</p>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="tap-icon min-h-11 min-w-11 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            ✕
          </button>
        </div>
        <div className="px-4 pb-3">
          <p className="text-xs leading-relaxed text-slate-400">
            A free account watches up to {FREE_WATCHLIST_LIMIT} cards with a weekly price-drop email, and tracks your
            collection. One tap with Google or Discord.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(next)}&src=signup_card`}
              onClick={accept}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Sign up free
            </Link>
            <button
              onClick={dismiss}
              className="min-h-11 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-ink-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
