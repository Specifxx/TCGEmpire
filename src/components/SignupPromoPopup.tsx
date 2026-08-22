"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { AuthForm } from "./AuthForm";

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
// THIS POPUP IS A NO-ACCOUNT → FREE-ACCOUNT MOMENT, AND NOTHING ELSE.
//
// Premium is deliberately absent. Earlier versions led with a comp — first a free
// WEEK of Premium, later a shorter SIGNUP_PREMIUM_DAYS preview threaded in as a
// prop — which made the ask about the paid tier at the exact moment the visitor
// had not yet agreed to the free one. The signup grant itself still happens
// server-side in the OAuth callback (see SIGNUP_PREMIUM_DAYS in lib/premium.ts,
// and /login, which does still pitch it); it just isn't this dialog's hook.
//
// It also no longer sells a search allowance. A tiered search cap shipped as this
// popup's headline and was removed a day later — see api/search/route.ts for what
// it cost. Manufacturing a limit to sell the fix is the shape of thing this
// component should never do again.
//
// What replaced both: an honest side-by-side of what browsing already gives you
// against what an account adds, built from the actual entitlement checks in the
// codebase (see COMPARISON below). Row one is a tie on purpose — signing up takes
// nothing away — and the price-alerts row concedes the anonymous email path
// rather than pretending alerts are account-only, because they aren't.
const SEEN_KEY = "rc_signup_promo_seen";

// THE SINGLE SOURCE OF TRUTH FOR THE PROMO'S DELAY. Nothing else may hardcode it.
//
// Was 5s, which fired while a visitor was still reading the first thing they
// landed on: 26% of visitors saw this dialog and 78% dismissed it, alongside a
// measured drop in pages/visitor and buy_click. 15s is long enough that anyone
// who sees it has actually engaged with a page, which is the only state in which
// the comparison below means anything.
export const PROMO_DELAY_MS = 15_000;

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

// Distinguishes this comparison layout from the perk-list version it replaced,
// on signup_promo_shown/_dismissed, so the two are separable in Vercel Analytics
// rather than averaged together across the changeover.
const PROMO_VARIANT = "comparison";

// The comparison itself. EVERY ROW IS DERIVED FROM A REAL ENTITLEMENT CHECK —
// nothing here is aspirational:
//
//   Compare prices   no gate anywhere (deliberately: it's the whole site)
//   Best Basket      api/basket 401 + tools/best-basket hasAccount()
//   Watchlist        app/watching redirect + api/alerts/watchlist/* 401
//   Price alerts     api/alerts/subscribe — anonymous EMAIL path exists and stays
//   Portfolio        app/portfolio redirect + api/collection/*, portfolio/export 401
//
// `browsing: false` renders an em dash; a string renders as-is, for the rows
// where signed-out visitors genuinely get something. Two of the five are not a
// flat "no", and saying so is the point — a comparison that overstates the wall
// is a dark pattern, and this one is checkable against the code by anyone.
//
// Premium-gated tools (Bulk Pricer, the screeners) are deliberately absent: this
// dialog never mentions the paid tier. Keep this list at 4-6 rows — the card's
// height is load-bearing on short phones (see the overlay's own note below).
const COMPARISON: { label: string; desc: string; browsing: string | false }[] = [
  { label: "Compare every store + eBay", desc: "Live prices on every card", browsing: "Yes" },
  { label: "Best Basket", desc: "The cheapest way to buy a whole decklist, postage included", browsing: false },
  { label: "Watchlist", desc: "Save cards and pick up where you left off", browsing: false },
  { label: "Price alerts", desc: "Get told when a card hits your price", browsing: "One card, by email" },
  { label: "Portfolio", desc: "What your collection is worth, and what it's made you", browsing: false },
];

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
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
      trackEvent("signup_promo_shown", { path: pathname ?? "/", variant: PROMO_VARIANT });
    }, PROMO_DELAY_MS);
    return () => clearTimeout(t);
  }, [loaded, user, pathname]);

  const dismiss = useCallback(() => {
    setPhase("hidden");
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

          {/* Every line here is vertical space on a phone, and an earlier
              version of this card (icon + chip + heading + two-line paragraph +
              three described perks + a footnote) reached ~955px against a 553px
              viewport — which is what pushed the close button off-screen and
              made the dialog genuinely inescapable. The comparison below is
              denser than the perk chips it replaced, so it is deliberately
              capped at 5 short rows with tight leading; verified closable at
              360x640. Adding rows here is not free. */}
          <div className="px-5 pb-2 pt-6">
            <h2 id="signup-promo-title" className="font-display text-center text-lg font-bold text-white">
              What a free account adds
            </h2>
            <p className="mx-auto mt-1 max-w-xs text-center text-xs leading-relaxed text-slate-400">
              You keep everything you already have. No card, no spam.
            </p>

            {/* Two tier columns, one row per feature. Semantically a table
                because it IS one — a screen reader announcing "Best Basket,
                Browsing: no, Free account: yes" is exactly the comparison a
                sighted visitor gets from the marks. */}
            <table className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-ink-800">
                  <th scope="col" className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="w-[68px] pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Browsing
                  </th>
                  <th scope="col" className="w-[68px] pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                    Free
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-ink-800/60 last:border-0">
                    <th scope="row" className="py-1.5 pr-2 font-normal">
                      <span className="block text-xs font-semibold leading-tight text-slate-200">{row.label}</span>
                      <span className="block text-[10px] leading-tight text-slate-500">{row.desc}</span>
                    </th>
                    <td className="px-1 text-center align-middle">
                      {row.browsing === false ? (
                        <span className="text-slate-600" aria-label="Not included">—</span>
                      ) : (
                        <span className="text-[10px] font-medium leading-tight text-slate-400">{row.browsing}</span>
                      )}
                    </td>
                    <td className="px-1 text-center align-middle">
                      <span className="font-bold text-brand-400" aria-label="Included">✓</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 pb-5 pt-3">
            <AuthForm providers={providers} bare compact source="popup" next={pathname ?? undefined} />
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
            {/* No "See Premium" link here any more. It was the last Premium
                mention left in the dialog, and it pointed the one visitor
                actually engaging with a free-account pitch at the paid tier
                instead — a second ask stacked on the first. */}
          </div>
        </div>
      </div>
    </div>
  );
}
