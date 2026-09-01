"use client";

import { useCallback, useEffect, useState } from "react";
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
// THIS POPUP IS A NO-ACCOUNT → FREE-ACCOUNT MOMENT, AND NOTHING ELSE.
//
// Premium is deliberately absent. Earlier versions led with a comp — first a free
// WEEK of Premium, later a shorter automatic signup preview threaded in as a
// prop — which made the ask about the paid tier at the exact moment the visitor
// had not yet agreed to the free one. The signup grant itself still happens
// server-side in the OAuth callback. THAT GRANT IS NOW GONE TOO — removed
// 2026-08-23, see lib/premium.ts — so no signup surface offers Premium at all,
// and this dialog was already the one that never did.
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

// A CORNER SLIDE-IN, NOT A MODAL (2026-09-01). This used to be a full-screen
// dialog — backdrop, scroll-locked, focus-trapped, centred card. That shape had
// already cost this codebase one production incident on its own (see
// tests/signup-slidein.test.ts's header for the short-phone history) and, more
// basically, is a much bigger interruption than the ask ("create a free account")
// warrants. PremiumSlideIn already proved the pattern for the logged-in audience:
// a small corner card that never blocks scroll, never traps focus, and yields to
// any REAL modal (checks the shared body[data-rc-dialog] flag, same as before —
// but no longer SETS it, since it no longer blocks anything itself). The two
// audiences are exclusive by construction (signed-out here, signed-in-non-Premium
// there), so sharing PremiumSlideIn's exact corner and z-tier is safe — they can
// never be on screen at the same time for the same visitor.
//
// The CONTENT below — the honest COMPARISON table, the dismissal persistence —
// is UNCHANGED from the modal version. The outer chrome moved (see above), and
// as of the same date the TIMING changed too: see the note below.

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
// is not a "someone forgot" gap the way the pre-timing version once was.
const SKIP_PATHS = ["/login", "/verify"];

// Distinguishes this behaviour from every version before it, on
// signup_promo_shown/_dismissed, so variants are separable in GA4 rather than
// averaged together across the changeover — same convention this field has
// always followed. "comparison" (the original modal) → "comparison_slidein"
// (chrome became a slide-in) → "comparison_instant" (the delay/buy-click
// timing was removed entirely). Each name records which axis changed.
//
// READ THESE IN GA4, NOT VERCEL. Both events are in GA4_ONLY_EVENTS
// (lib/analytics.ts): shown is an impression that fires for a large share of
// visitors, and Vercel bills custom events against a monthly quota, so the pair
// was crowding out buy_click and sign_up. The trackEvent() calls below are
// unchanged and still carry this variant — only the Vercel leg is suppressed.
const PROMO_VARIANT = "comparison_instant";

// The comparison itself. EVERY ROW IS DERIVED FROM A REAL ENTITLEMENT CHECK —
// nothing here is aspirational:
//
//   Compare prices   no gate anywhere (deliberately: it's the whole site)
//   Watchlist        app/watching redirect + api/alerts/watchlist routes 401
//   Price alerts     api/alerts/subscribe — anonymous EMAIL path exists and stays
//   Portfolio        app/portfolio redirect + api/collection routes, portfolio/export 401
//
// `browsing: false` renders an em dash; a string renders as-is, for the rows
// where signed-out visitors genuinely get something. One of the four is not a
// flat "no", and saying so is the point — a comparison that overstates the wall
// is a dark pattern, and this one is checkable against the code by anyone.
//
// Premium-gated tools (Bulk Pricer, Best Basket, the screeners) are deliberately
// absent: this popup never mentions the paid tier. Best Basket lived here as a
// free-account perk until it moved back to Premium (see lib/premium.ts's tier
// note) — removed rather than left inaccurate, since every row above is a promise
// this popup makes about what signing up gets you. Keep this list at 4-6 rows —
// a slide-in card reads worse the taller it gets, same reasoning that used to be
// about a modal's off-screen close button and is now just about not being a
// bigger interruption than a corner card should be.
const COMPARISON: { label: string; desc: string; browsing: string | false }[] = [
  { label: "Compare every store + eBay", desc: "Live prices on every card", browsing: "Yes" },
  { label: "Watchlist", desc: "Save cards and pick up where you left off", browsing: false },
  { label: "Price alerts", desc: "Get told when a card hits your price", browsing: "One card, by email" },
  { label: "Portfolio", desc: "What your collection is worth, and what it's made you", browsing: false },
];

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false); // drives the slide-in transition

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

  return (
    // Bottom-LEFT, same corner and z-tier as PremiumSlideIn (z-[70], under every
    // real modal — signup no longer being one of them). Safe to share: this
    // audience (signed-out) and PremiumSlideIn's (signed-in, non-Premium) are
    // mutually exclusive for any one visitor, so the two can never stack.
    <div
      role="region"
      aria-label="Create a free RiftCompare account"
      className={`fixed bottom-20 left-4 z-[70] w-[calc(100%-2rem)] max-w-sm transition-all duration-300 sm:bottom-4 sm:w-auto ${
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-brand-500/50 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-950/60 px-4 py-2.5">
          <span className="rounded border border-brand-400/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300">
            Free account
          </span>
          <span className="text-xs font-semibold text-slate-200">What it adds</span>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="ml-auto -mr-1 rounded px-1 text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-1 pt-3">
          <p className="text-xs leading-relaxed text-slate-400">You keep everything you already have. No card, no spam.</p>

          {/* Two tier columns, one row per feature. Semantically a table because
              it IS one — a screen reader announcing "Watchlist, Browsing: no,
              Free account: yes" is exactly the comparison a sighted visitor gets
              from the marks. */}
          <table className="mt-2.5 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-800">
                <th scope="col" className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="w-[64px] pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Browsing
                </th>
                <th scope="col" className="w-[64px] pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-brand-300">
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

        <div className="px-4 pb-4 pt-2">
          <AuthForm providers={providers} bare compact source="popup" next={pathname ?? undefined} />
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-slate-400 hover:bg-ink-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            Maybe later
          </button>
          {/* No "See Premium" link here any more. It was the last Premium
              mention left in the popup, and it pointed the one visitor
              actually engaging with a free-account pitch at the paid tier
              instead — a second ask stacked on the first. */}
        </div>
      </div>
    </div>
  );
}
