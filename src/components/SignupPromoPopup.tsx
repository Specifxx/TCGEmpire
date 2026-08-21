"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { AuthForm } from "./AuthForm";
import { ANON_SEARCH_LIMIT, FREE_SEARCH_LIMIT } from "@/lib/search-limits";

// Shown once per BROWSER SESSION (sessionStorage, not localStorage) — dismissing
// suppresses it for the rest of that session/tab, but it comes back on the next
// visit once the tab/browser is closed and reopened. Signing up suppresses it for
// good, same as before, simply because a signed-in visitor never re-enters this
// effect at all (see the `user` check below). Fires on every route, including the
// homepage.
//
// Skipped entirely on /marketplace — a visitor specifically evaluating the
// marketplace (e.g. after seeing it linked from a community post) shouldn't be
// hit with a full-screen signup wall on top of everything else there.
//
// THE PITCH IS THE ACCOUNT TIER, NOT A PREMIUM COMP — WITH ONE EXCEPTION. This
// popup used to promise a free week of Premium and gated its own appearance on a
// promo API reporting that slots remained; retiring that comp meant standing on
// what a free account permanently unlocks instead (see lib/premium.ts's tier
// note), which needs no server round-trip, so the popup renders on its own. A
// much shorter Premium PREVIEW is back via SIGNUP_PREMIUM_DAYS (lib/premium.ts) —
// threaded down as a prop since this file can't import that server-only module
// directly. The copy below is deliberately careful to frame it as a taste on top
// of the account, never as the account's own payoff — that framing (not the
// existence of a comp) was the old version's actual problem.
const SEEN_KEY = "rc_signup_promo_seen";
const SHOW_DELAY_MS = 5_000; // fire early so more visitors actually see it before leaving
const SKIP_PATHS = ["/login", "/verify", "/marketplace"];
// Session pageview counter (see the gate below). Incremented once per route.
const PV_KEY = "rc_pv_count";
// Only arm the popup once the session has seen this many pages. A first-page
// lander — including every homepage lander — hasn't extracted any value yet,
// and a full-screen modal over content they haven't used is the definition of
// interruptive; a visitor on their second page has demonstrated engagement.
// (The 5s delay alone couldn't express this: it fired on page ONE for
// everyone.) signup_promo_shown/_dismissed measure whether the dismiss-rate
// improves as total shows drop.
const MIN_PAGEVIEWS = 2;

// What a free account PERMANENTLY unlocks — the thing that's still true after
// any Premium preview lapses. Best Basket moved BACK to the account tier (see
// lib/premium.ts's tier note) specifically to be the strongest item on this list —
// it's listed first for that reason. The Bulk Pricer stays Premium and is pitched
// there instead; everything else here an account genuinely, permanently unlocks
// on its own.
const PERKS: [string, string][] = [
  ["Best Basket", "cheapest store split to buy a whole deck, postage included"],
  ["Price alerts", "get told when a card hits your price"],
  ["Portfolio tracking", "see what your collection is worth, live"],
  ["Watchlist", "save cards and jump back to them anytime"],
];

export function SignupPromoPopup({
  providers,
  signupPremiumDays = 0,
}: {
  providers: ("google" | "discord")[];
  signupPremiumDays?: number;
}) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"hidden" | "shown">("hidden");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Auto-show once per session, after a delay — only for a signed-out visitor,
  // off the auth/marketplace pages. Deliberately fires on the homepage too — an
  // earlier version excluded "/" on accessibility grounds (see DECISIONS.md's
  // Phase 5 section); that exclusion was a product call, not a technical
  // constraint, and has since been reversed: the homepage is now explicitly
  // in scope.
  // Count route views once per pathname, separately from the arming effect
  // below — that one re-runs when auth state loads, and counting there would
  // double-increment the same page.
  const lastCountedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || lastCountedPath.current === pathname) return;
    lastCountedPath.current = pathname;
    try {
      const n = Number(sessionStorage.getItem(PV_KEY) ?? "0") || 0;
      sessionStorage.setItem(PV_KEY, String(n + 1));
    } catch {
      /* private mode — the gate below fails open on its own read */
    }
  }, [pathname]);

  useEffect(() => {
    if (!loaded || user) return;
    if (SKIP_PATHS.some((p) => pathname?.startsWith(p))) return;
    let seen = false;
    let pageviews = MIN_PAGEVIEWS; // private-mode fallback: fail open, old behavior
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      pageviews = Number(sessionStorage.getItem(PV_KEY) ?? "0") || 0;
    } catch {
      /* private mode — worst case it can show again next page load */
    }
    if (seen) return;
    // Engagement gate: never a modal over the FIRST page of a session (see
    // MIN_PAGEVIEWS above). Deliberately does NOT mark SEEN_KEY when it skips —
    // the visitor still gets the promo once they've browsed further.
    if (pageviews < MIN_PAGEVIEWS) return;
    const t = setTimeout(() => {
      // Never stack on top of another dialog. FeedbackWidget sets this flag
      // while its panel is open; opening a full-screen signup wall over a
      // visitor who is mid-sentence writing us feedback would lose the feedback
      // AND read as the exact "wall of asks" this popup's own delay exists to
      // avoid. Deliberately does NOT mark SEEN_KEY when it skips, so that
      // visitor still gets the promo on a later visit rather than silently
      // losing it forever.
      if (document.body.dataset.rcDialog === "1") return;
      setPhase("shown");
      // Impression event — with dismiss (below) this makes the popup's
      // conversion rate knowable for the first time: shown vs dismissed vs
      // sign_in_click(source=popup) vs sign_up.
      trackEvent("signup_promo_shown", { path: pathname ?? "/" });
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [loaded, user, pathname]);

  const dismiss = useCallback(() => {
    setPhase("hidden");
    trackEvent("signup_promo_dismissed");
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    // Hand focus back where the visitor was, rather than stranding it on a
    // removed node (which drops screen readers to the top of the document).
    const prev = returnFocusRef.current;
    if (prev && document.contains(prev)) prev.focus();
  }, []);

  // ESC to close, a focus trap, and a background scroll lock for as long as this
  // is open — the same contract FeedbackWidget already implements. Its absence
  // here was a genuine keyboard trap: with the close button rendered off-screen
  // (see the layout note below) there was NO way to dismiss this dialog at all.
  useEffect(() => {
    if (phase !== "shown") return;
    // Claim the shared dialog flag so FeedbackWidget can't open on top of us,
    // mirroring the check this component already makes before auto-opening.
    document.body.dataset.rcDialog = "1";
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
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
      document.body.style.overflow = overflow;
      delete document.body.dataset.rcDialog;
    };
  }, [phase, dismiss]);

  // Move focus to the close button when it opens: it is the first thing a
  // keyboard or screen-reader user needs, and focusing it also guarantees the
  // scroll container reveals it.
  useEffect(() => {
    if (phase !== "shown") return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    // THE OVERLAY IS A SCROLL CONTAINER, and that is the whole fix. This used to
    // be `fixed inset-0 flex items-center justify-center` with an
    // `overflow-hidden` card and no scrolling anywhere. Once the card was taller
    // than the viewport, centring overflowed it EQUALLY IN BOTH DIRECTIONS, so
    // the close button — pinned to the card's top — sat ABOVE the top of the
    // screen with no way to reach it. Measured before this change: the button
    // rendered at y = -131 on a 375x667 iPhone SE, y = -188 once Safari's
    // toolbars were showing, and y = -234 on a 360x480 window. The card covered
    // the full width, so there was no backdrop left to tap either, and there was
    // no ESC handler. On a short phone this dialog was genuinely inescapable.
    //
    // `min-h-full` on the inner wrapper (NOT `h-full`) is the load-bearing
    // detail: the wrapper grows to the card's height when the card is taller
    // than the viewport, so centring has nothing left to overflow and the
    // container simply scrolls instead.
    //
    // h-[100dvh] is for iOS Safari specifically — the reported browser. `inset-0`
    // resolves against the LARGE viewport there, so the bottom of a full-height
    // fixed element sits behind the address/tab bars; the dynamic viewport unit
    // tracks the chrome as it shows and hides. Paired with safe-area insets below
    // so nothing lands under a notch or the home indicator.
    <div className="fixed inset-0 z-[75] h-[100dvh] overflow-y-auto overscroll-contain">
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
      {/* The dismiss handler lives on this WRAPPER, not on the backdrop behind
          it. The wrapper stretches over the whole scroll area to do its
          centring, so it covers the backdrop — putting the handler on the
          backdrop alone meant a tap on empty space hit this element instead and
          did nothing, silently costing the easiest escape route on a phone.
          The card stops propagation so taps inside it never dismiss. */}
      <div
        onClick={dismiss}
        className="relative flex min-h-full items-center justify-center p-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-promo-title"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl"
        >
          <button
            ref={closeRef}
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-2 top-2 z-20 tap-icon rounded-full bg-ink-950/80 text-slate-300 hover:bg-ink-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            ✕
          </button>

          {/* Deliberately short. Every line here is vertical space on a phone,
              and the old copy (icon + chip + heading + two-line paragraph +
              three described perks + a footnote) made the card ~955px tall
              against a 553px viewport — which is what pushed the close button
              off-screen in the first place. Shorter copy is not just tidier
              here, it is part of the fix. */}
          <div className="px-5 pb-2 pt-6 text-center">
            {signupPremiumDays > 0 ? (
              <span className="chip bg-gold/15 text-[10px] font-bold uppercase tracking-wide text-gold">
                {signupPremiumDays === 1 ? "1 day" : `${signupPremiumDays} days`} of Premium free
              </span>
            ) : (
              <span className="chip bg-brand-500/15 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                Free account
              </span>
            )}
            <h2 id="signup-promo-title" className="font-display mt-2 text-lg font-bold text-white">
              {signupPremiumDays > 0 ? "Create an account, get Premium free" : `Get ${Math.round(FREE_SEARCH_LIMIT / ANON_SEARCH_LIMIT)}x more searches — free`}
            </h2>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
              {signupPremiumDays > 0 ? (
                <>
                  Your first {signupPremiumDays === 1 ? "day" : `${signupPremiumDays} days`} of Premium is on us, no
                  card needed. You keep these for good:
                </>
              ) : (
                "No card needed. You get:"
              )}
            </p>
            <ul className="mx-auto mt-2 flex max-w-xs flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {PERKS.map(([k]) => (
                <li key={k} className="flex items-center gap-1">
                  <span aria-hidden="true" className="font-bold text-brand-400">✓</span>
                  <span className="font-semibold text-slate-300">{k}</span>
                </li>
              ))}
            </ul>

            {/* Search allowance ladder — the one concrete, felt difference
                between the three tiers (enforced server-side, see
                lib/search-limits.ts + api/search/route.ts), so it's a
                stronger hook than another checkmark: a signed-out visitor who
                has already hit "10 searches" mid-session sees exactly what
                signing up buys them, in the same units they just ran out of.
                Kept to one compact row — see the doc comment above this
                popup's own height history for why brevity here is load-bearing,
                not optional. */}
            <div className="mx-auto mt-3 grid max-w-xs grid-cols-3 divide-x divide-ink-800 rounded-lg border border-ink-800 bg-ink-950/40 text-center">
              <div className="px-1.5 py-2">
                <div className="text-sm font-black text-slate-500">{ANON_SEARCH_LIMIT}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">Signed out</div>
              </div>
              <div className="px-1.5 py-2">
                <div className="text-sm font-black text-brand-300">{FREE_SEARCH_LIMIT}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-brand-400">Free account</div>
              </div>
              <div className="px-1.5 py-2">
                <div className="text-sm font-black text-gold">∞</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-gold/80">Premium</div>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">Searches per day — free is {Math.round(FREE_SEARCH_LIMIT / ANON_SEARCH_LIMIT)}x more</p>
          </div>

          <div className="px-5 pb-5 pt-0">
            <AuthForm
              providers={providers}
              bare
              compact
              signupPremiumDays={signupPremiumDays}
              source="popup"
              next={pathname ?? undefined}
            />
            {/* A SECOND, OBVIOUS WAY OUT, in the thumb zone. The ✕ is a small
                target in a top corner — the hardest place to reach one-handed on
                a large phone — so the primary escape is now a full-width control
                right where the visitor's thumb already is, directly under the
                sign-in buttons. */}
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full rounded-lg px-3 py-2.5 text-center text-xs font-semibold text-slate-400 hover:bg-ink-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              Maybe later
            </button>
            <p className="mt-1 text-center text-[11px] text-slate-600">
              <Link href="/premium" onClick={dismiss} className="text-slate-500 hover:underline">
                See Premium
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
