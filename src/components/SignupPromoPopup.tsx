"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { AuthForm } from "./AuthForm";

// Shown at most ONCE ever per browser (localStorage, mirrors PriceAlertModal's
// convention) — dismissing or signing up both suppress it for good. Never shown
// signed in, and never shown on the auth pages themselves.
//
// Skipped entirely on /marketplace — a visitor specifically evaluating the
// marketplace (e.g. after seeing it linked from a community post) shouldn't be
// hit with a full-screen signup wall on top of everything else there; a longer
// delay sitewide (was 6s) avoids the "wall of asks" first impression more
// broadly (real feedback: ads + subscription pitch + a still-growing
// marketplace all at once read as overwhelming/untrustworthy to a new visitor).
//
// THE PITCH IS NOW THE ACCOUNT TIER, NOT A PREMIUM COMP. This popup used to
// promise a free week of Premium and gated its own appearance on a promo API
// reporting that slots remained — so retiring that comp would have silently
// stopped the popup from ever showing. It now stands on what a free account
// permanently unlocks (see lib/premium.ts's tier note), which needs no
// server round-trip and can't lapse, so the popup renders on its own.
const SEEN_KEY = "rc_signup_promo_seen";
const SHOW_DELAY_MS = 25_000; // let a new visitor actually look around first
const SKIP_PATHS = ["/login", "/verify", "/marketplace"];

// What signing up actually gets you. The Bulk Pricer and Best Basket moved to
// Premium (see lib/premium.ts's tier note) and are pitched there instead — this
// list only promises what a free account genuinely, permanently unlocks.
const PERKS: [string, string][] = [
  ["Price alerts", "get told when a card hits your price"],
  ["Portfolio tracking", "see what your collection is worth, live"],
  ["Watchlist", "save cards and jump back to them anytime"],
];

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"hidden" | "shown">("hidden");

  // Auto-show once, after a delay — only for a signed-out visitor, off the auth pages.
  useEffect(() => {
    if (!loaded || user) return;
    if (SKIP_PATHS.some((p) => pathname?.startsWith(p))) return;
    // NEVER on the homepage. This is a genuine `pathname === "/"` exact match,
    // deliberately NOT folded into SKIP_PATHS above (which uses startsWith —
    // "/" would match every route on the site, not just the homepage itself).
    // The homepage-redesign brief's accessibility section is explicit and
    // unconditional: "No newsletter popup, no overlay, no region modal.
    // Ever." This isn't a newsletter popup, but it unquestionably IS an
    // auto-opening, full-screen `role="dialog"` overlay — exactly the class
    // of interruption that rule exists to rule out, on the one page this
    // whole task is about making a single, uninterrupted job. It's left
    // fully live everywhere else (149 other routes, unchanged, still firing
    // on its own 25s delay) — this component and its sitewide behavior
    // predate this task and are out of its stated scope everywhere except
    // the homepage itself, where the brief's rule is unambiguous. See
    // DECISIONS.md's Phase 5 section for the full reasoning.
    if (pathname === "/") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode — worst case it can show once more next session */
    }
    if (seen) return;
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
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [loaded, user, pathname]);

  function dismiss() {
    setPhase("hidden");
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  if (phase === "hidden") return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={dismiss} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 tap-icon  rounded-full bg-ink-950/60 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
        >
          ✕
        </button>

        <div className="p-6 pb-2 text-center">
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-gold/15 text-gold">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7-6.2-3.4L5.8 21.2 7 14.2l-5-4.9 7.1-.7z" />
            </svg>
          </div>
          <span className="chip bg-brand-500/15 text-[10px] font-bold uppercase tracking-wide text-brand-300">
            Free account
          </span>
          <h2 className="font-display mt-2 text-xl font-bold text-white">
            Unlock the tools that save you the most
          </h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-slate-300">
            Comparing prices is free for everyone. A free account adds the tools that price a whole list at once — no
            card required.
          </p>
          <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-left">
            {PERKS.map(([k, v]) => (
              <li key={k} className="flex gap-2 text-xs leading-relaxed text-slate-400">
                <span aria-hidden="true" className="font-bold text-brand-400">✓</span>
                <span>
                  <strong className="font-semibold text-slate-200">{k}</strong> — {v}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 pb-6 pt-0">
          <AuthForm providers={providers} bare />
          <p className="mt-3 text-center text-[11px] text-slate-600">
            Want the pro screeners and an ad-free site too?{" "}
            <Link href="/premium" onClick={dismiss} className="text-slate-400 hover:underline">
              See Premium
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
