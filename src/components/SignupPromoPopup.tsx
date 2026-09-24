"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "@/lib/nudge-timing";
import { usePresence } from "@/lib/motion";
import { AuthForm } from "./AuthForm";
import { FreeAccountCompare } from "./FreeAccountCompare";
// PREMIUM_COPY_VERSION and nothing else from the price helpers. This card names
// no price, but the impression still carries the copy-version stamp: comparing
// this free-account era against the Premium-pitch era is exactly what that tag
// is for, and dropping it would make the two uncomparable in GA4.
import { PREMIUM_COPY_VERSION } from "@/lib/site";

// Shows on the first eligible page, then RETURNS every PAGES_BETWEEN_SHOWS
// pages after each dismissal, for as long as the visitor stays signed out
// (sessionStorage, not localStorage, so a new tab starts the count over).
// Signing up suppresses it for good, simply because a signed-in visitor never
// re-enters the arming effect at all (see the `user` check below). Fires on
// every route, including the homepage.
//
// IT SELLS THE FREE ACCOUNT AGAIN (2026-09-16, owner's call), AND IT IS
// DELIBERATELY SMALL.
//
// This surface has now been both things. Until 2026-09-04 it showed a
// free-account comparison; that day an explicit instruction turned it into a
// Premium pitch, on the reasoning that a visitor who arrived already wanting
// the pro tools had to survive a whole separate, later nudge before anyone told
// them Premium existed. Reversed now, for a reason the reversal states plainly:
// asking a stranger to buy — before they have an account, a watchlist, or any
// reason to come back — puts the paid ask in front of the audience least ready
// for it. Signed-out visitors get the free account; Premium waits for
// PremiumSlideIn, which only fires once someone is signed in and has browsed a
// little. The two audiences stay mutually exclusive, exactly as before.
//
// What that means concretely, and what the tests below pin:
//   • The pitch is FreeAccountCompare (no account vs free account, four rows),
//     not PremiumPitchPanel (free vs Premium). PremiumPitchPanel is untouched
//     and still PremiumSlideIn's.
//   • No trial framing, no price, no price-increase banner, no gold. Nothing
//     on this card mentions money, because nothing on it asks for any.
//   • The CTA returns the visitor TO THE PAGE THEY WERE ON, not to /premium.
//     A free account is not a step toward a purchase here; it is the whole ask.
//
// AND IT IS SUBTLER (same call): on a phone the Premium panel's taller table
// pushed this card to roughly the full screen height, which is what made it
// read as a takeover rather than a nudge. It is now translucent with a blur,
// capped well under the viewport, and a little narrower — see the chrome
// comment on the card below for the numbers.
//
// The free ACCOUNT tier (watchlist, price alerts, portfolio) is the same real
// tier /login's own AuthForm sells (its PERKS list), and FreeAccountCompare's
// rows are those same three perks plus the honest "you already get price
// comparison for nothing" row.

// sessionStorage. Two numbers, not a boolean: how many distinct pages this
// signed-out visitor has seen, and what that count was when they last dismissed
// the popup. The gap between them is what decides whether it comes back.
const VIEWS_KEY = "rc_signup_promo_views";
const DISMISSED_AT_KEY = "rc_signup_promo_dismissed_at";
// localStorage, so they survive the new tab that resets the two above.
const DISMISS_COUNT_KEY = "rc_signup_promo_dismisses"; // lifetime dismissals
const SNOOZE_UNTIL_KEY = "rc_signup_promo_until"; // epoch ms; don't show before this

// IT COMES BACK (owner brief, 2026-09-10: "the slider should show up again
// every 3 pages a user visits if they're not logged in"). Until now a dismissal
// silenced it for the whole browser session.
//
// This deliberately reopens a risk this file's own history documents: an
// earlier, pushier version of this popup measured a 78% dismiss rate with
// bounce up and pages/visitor down. A re-show every few pages is a smaller ask
// than that version was, and the visitor still controls it — but note there is
// NO lifetime cap here, unlike PremiumSlideIn, which stops for good after two
// dismissals. If signup_promo_dismissed climbs or pages/visitor falls after
// this ships, a cap is the first thing to add.
const PAGES_BETWEEN_SHOWS = 3;

function readCount(key: string): number {
  try {
    return Number(sessionStorage.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

// The lifetime counters live in localStorage, NOT sessionStorage, and that is
// the whole point of them: the two keys above reset on a new tab, so before
// this the arming gate treated a returning visitor as never-having-dismissed
// and asked again on their very first page. Fails open to 0 — a private window
// behaves exactly as it did before, which is the same trade every other read in
// this file makes.
function readLocal(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}
function writeLocal(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode — the cap is best-effort, never a crash */
  }
}

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
// Premium there), so sharing PremiumSlideIn's exact corner and z-tier is safe —
// they can never be on screen at the same time for the same visitor. The
// COLOURING is deliberately no longer shared (2026-09-16): this card is
// brand-green because it sells the free tier, and gold is reserved for the
// surfaces that actually ask for money. A visitor who sees both across two
// sessions should read them as two different offers, because they are.
//
// The MECHANICS below — dismissal persistence, non-modal behaviour, entrance/
// exit transition — are UNCHANGED from every version before this one. Only the
// PITCH (this file's whole body, below) and the CTA's destination changed.

// A FIVE-SECOND DELAY (2026-09-11, explicit owner instruction: every slider on
// the site shows five seconds after the page opens rather than instantly). The
// value is NUDGE_DELAY_MS, shared with PremiumSlideIn and AnnualSwitchNudge so
// the three corner nudges can never drift to three different answers again —
// see lib/nudge-timing.ts, which also carries the full history.
//
// READ THAT HISTORY BEFORE CHANGING THIS AGAIN. The timing here has been
// through four states: a 5s timer → a relaxed pageview gate → buy_click-aware
// 3-case timing → no timer at all (2026-09-01) → this. The FIRST of those, a
// bare 5s delay, is the one that measurably cost the site: bounce rose,
// pages/visitor fell, buy_click fell, and 78% of visitors dismissed it
// outright. That is precisely what this change reinstates, so it is a
// deliberate re-test of a known-failed value rather than a fresh idea. It was
// asked for explicitly; the honest thing is to ship it AND say plainly what to
// watch — signup_promo_shown/_dismissed, sign_up, buy_click, pages/visitor.
//
// One thing the delay buys back for free: the rcDialog check now runs when the
// timer FIRES, not when the effect arms, so a modal opened during those five
// seconds suppresses the popup instead of being covered by it.
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
// → "premium_graphic_repeat" (2026-09-10, same day): the popup stopped being
// once-per-session and now returns every few pages after a dismissal. That is
// the TIMING axis, the same one "comparison_instant" once recorded — and it
// changes the shown count and the dismiss rate directly, so without a new name
// the before and after would average into each other and neither could be read.
// The impression also carries `repeat` now, separating a first show from a
// re-show within this same variant.
// → "premium_graphic_5s" (2026-09-11): the popup waits NUDGE_DELAY_MS before
// showing instead of appearing instantly. TIMING axis again, the same one
// "comparison_instant" and "premium_graphic_repeat" each recorded — and since
// the last time this site ran a 5s delay the dismiss rate was 78%, separating
// these impressions in GA4 is the entire point of the rename.
// → "premium_graphic_capped" (2026-09-14): the popup finally has a LIFETIME
// dismissal cap and a snooze, held in localStorage, so two dismissals is a
// permanent no and a new tab no longer resets the count. FREQUENCY axis — the
// same one "premium_graphic_repeat" recorded, and the one that moves the shown
// count and the dismiss rate most directly, so without a new name the capped
// and uncapped impressions average together and neither can be read. Expect
// FEWER impressions on purpose; the number that should improve is dismissals
// per impression, and sign_up per impression.
// → "premium_graphic" (2026-09-10): the pitch stopped being text at all. The
// sentence and the six-chip tool row became the designed PremiumPitchPanel; the
// heading's non-trial fallback became the new tagline. Same axis as the last
// rename (CONTENT), so again a new name rather than a suffix — without it the
// text-pitch and graphic-pitch impressions would average together in GA4 and
// neither could be read.
// → "premium_graphic_table" (2026-09-15): PremiumPitchPanel itself changed —
// the character-art background is gone (explicit feedback: it "doesn't really
// mean anything") and the four persuasive feature rows became the real
// Free-vs-Premium tick/✗ table (TierComparisonTable, compact). Same CONTENT
// axis as the two renames above it, for the same reason: this is the change
// most likely to move dismiss/click rates, so it needs its own bucket rather
// than blending into "premium_graphic"'s numbers.
// → "premium_graphic_5s_motion" (2026-09-16, UI polish pass): a new axis —
// CHROME/MOTION, not content, timing or frequency. The hand-rolled double-rAF
// entrance became the shared usePresence(shown, 250) primitive, the transition
// itself moved onto the site's tokenized duration/easing curve instead of an
// ad-hoc duration-300, and the corner anchor moved onto .above-bottombar (the
// mobile bottom tab bar's own arrival — the popup now clears it, where it used
// to just sit at a fixed bottom-4/bottom-20). The pitch, the 5s delay and the
// dismissal caps are all byte-identical to "premium_graphic_table"; only HOW
// it animates in and where it sits changed. Worth its own bucket on the chance
// a visibly smoother, correctly-eased entrance moves the dismiss rate by
// itself — the same reasoning "comparison_instant" used for the opposite
// change (removing a delay) back at the top of this history.
//
// → "free_account_compare_subtle" (2026-09-16, owner's reversal): back to the
// FREE ACCOUNT, and quieter with it. The CONTENT axis again, and the largest
// swing on it yet — the ask itself changed from "buy Premium" to "make a free
// account", so nothing about the Premium-pitch buckets above is comparable to
// this one and they must not average together. Two changes ride along, both
// aimed at the same complaint ("the slider is actually really, really
// annoying"): the card is translucent and capped well under the viewport
// instead of filling a phone screen, and the comparison is four rows instead of
// the Premium table's taller one.
//
// The number to watch is NOT impressions or even dismissals: it is sign_up per
// impression. The Premium buckets were being asked to convert a stranger into a
// purchase, which is a different funnel with a much lower ceiling; this bucket
// only has to convert them into an account, so a higher rate here is expected
// and is not by itself evidence the reversal was right. The honest comparison
// is downstream — accounts created, then Premium conversions from those
// accounts via PremiumSlideIn — against the Premium-popup era's direct rate.
//
// READ THESE IN GA4, NOT VERCEL. Both events are in GA4_ONLY_EVENTS
// (lib/analytics.ts): shown is an impression that fires for a large share of
// visitors, and Vercel bills custom events against a monthly quota, so the pair
// was crowding out buy_click and sign_up. The trackEvent() calls below are
// unchanged and still carry this variant — only the Vercel leg is suppressed.
const PROMO_VARIANT = "free_account_compare_subtle";

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  // mounted/entered now come from the shared usePresence primitive
  // (src/lib/motion.ts) instead of a hand-rolled double-rAF entrance + a bare
  // setTimeout exit — same contract (entered drives the slide-in, mounted
  // gates the unmount), same 250ms exit as PremiumSlideIn shares below.
  const { mounted, entered } = usePresence(shown, 250);
  const lastCountedPath = useRef<string | null>(null);

  // NO trial/premium state is read here any more. The card makes no paid
  // offer, so `trialDays`/`premiumPlus` (which the Premium-pitch version used
  // to pick a $0-today vs recurring-price framing) are nobody's business on
  // this surface — PremiumSlideIn still reads them for the signed-in audience.

  // Count the pages a SIGNED-OUT visitor sees, once per distinct route. Declared
  // before the arming effect on purpose: React runs effects in order, so this
  // page is already counted by the time the effect below reads the total.
  // Gated on `loaded` as well as `user` so the very first route still counts
  // once /api/me resolves — lastCountedPath is only claimed after that.
  useEffect(() => {
    if (!loaded || user) return;
    if (!pathname || lastCountedPath.current === pathname) return;
    lastCountedPath.current = pathname;
    try {
      sessionStorage.setItem(VIEWS_KEY, String(readCount(VIEWS_KEY) + 1));
    } catch {
      /* private mode — the promo then just behaves as never-dismissed */
    }
  }, [pathname, loaded, user]);

  useEffect(() => {
    if (!loaded || user || shown) return;
    if (SKIP_PATHS.some((p) => pathname?.startsWith(p))) return;

    // THE LIFETIME CAP, checked before anything else because it is the cheapest
    // read and the most final. Two dismissals is a no — same rule, same numbers
    // and now the same constants as PremiumSlideIn, which has enforced them
    // since 2026-08-27. Before this the popup had no cap at all and could ask
    // someone who had declined it a dozen times.
    if (readLocal(DISMISS_COUNT_KEY) >= MAX_NUDGE_DISMISSALS) return;
    if (Date.now() < readLocal(SNOOZE_UNTIL_KEY)) return;

    // Never dismissed this session → show at the first opportunity, with no
    // gate of any kind, exactly as before. Dismissed → stay away until they
    // have moved on PAGES_BETWEEN_SHOWS further pages, then come back.
    //
    // This within-session spacing is UNCHANGED and still does its own job; the
    // cap above sits on top of it rather than replacing it.
    let views = 0;
    let dismissedAt: number | null = null;
    try {
      views = readCount(VIEWS_KEY);
      const raw = sessionStorage.getItem(DISMISSED_AT_KEY);
      dismissedAt = raw === null ? null : Number(raw) || 0;
    } catch {
      /* private mode — treat as never dismissed, same as the old behaviour */
    }
    if (dismissedAt !== null && views - dismissedAt < PAGES_BETWEEN_SHOWS) return;

    // Never slide in on top of a real modal. FeedbackWidget sets this flag
    // while its panel is open; sliding a signup pitch in over a visitor who is
    // mid-sentence writing us feedback would lose the feedback entirely.
    // Deliberately does NOT touch the counters when it skips, so that visitor
    // still gets the promo on the next page rather than losing this turn.
    const t = setTimeout(() => {
      // Checked HERE rather than when the effect armed: a modal can open during
      // the five seconds, and sliding in over it is the thing this guard exists
      // to prevent. Skipping does not touch the counters, so the visitor still
      // gets the promo on the next page rather than losing this turn.
      if (document.body.dataset.rcDialog === "1") return;

      setShown(true);
      trackEvent("signup_promo_shown", { path: pathname ?? "/", variant: PROMO_VARIANT, copy: PREMIUM_COPY_VERSION, repeat: dismissedAt !== null });
    }, NUDGE_DELAY_MS);

    // Navigating away mid-wait must cancel it, or the popup lands on a page the
    // visitor has already left — including one in SKIP_PATHS.
    return () => clearTimeout(t);
  }, [loaded, user, shown, pathname]);

  // usePresence(shown, 250) now owns letting the exit transition finish
  // before actually unmounting — mirrors PremiumSlideIn's own hide(), which
  // shares the exact same call.
  const hide = useCallback(() => setShown(false), []);

  const dismiss = useCallback(() => {
    hide();
    trackEvent("signup_promo_dismissed", { variant: PROMO_VARIANT });
    // STAMPS WHERE THEY WERE when they dismissed it, rather than a one-way
    // "seen" flag. The arming effect re-shows once they are
    // PAGES_BETWEEN_SHOWS pages past this mark, so each dismissal buys the
    // visitor the same quiet stretch rather than silence for the whole
    // session. Written synchronously here, not in a later effect, so a dismiss
    // immediately followed by a navigation still counts from the right page.
    try {
      sessionStorage.setItem(DISMISSED_AT_KEY, String(readCount(VIEWS_KEY)));
    } catch {
      /* private mode */
    }
    // AND the lifetime half: one more strike, and a week of quiet. Written here
    // for the same reason as the line above — synchronously, so a dismiss
    // immediately followed by a navigation still lands.
    writeLocal(DISMISS_COUNT_KEY, readLocal(DISMISS_COUNT_KEY) + 1);
    writeLocal(SNOOZE_UNTIL_KEY, Date.now() + SNOOZE_AFTER_DISMISS_MS);
  }, [hide]);

  // ENGAGING IS NOT REFUSING. Clicking a provider button snoozes the popup for
  // a fortnight but burns NO strike — someone who signed in and came back
  // should not be one dismissal away from never being asked again. Same split
  // PremiumSlideIn's accept() already makes between its two snooze windows.
  const snoozeForClick = useCallback(() => {
    writeLocal(SNOOZE_UNTIL_KEY, Date.now() + SNOOZE_AFTER_CLICK_MS);
  }, []);

  // Esc dismisses it — non-trapping, because this is not a modal (matches
  // PremiumSlideIn exactly: no focus trap, no scroll lock, no aria-modal).
  // Ignored while a real dialog is open (2026-09-23): that Escape belongs to
  // the dialog, and dismissing here as well would silently burn a
  // frequency-cap strike and a week's snooze on a visitor who only meant to
  // close QuickView. The flag outlives the dialog's exit animation, so it is
  // still set during the dispatch that closes it.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.rcDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!mounted) return null;

  return (
    // Bottom-LEFT, same corner and z-tier as PremiumSlideIn (z-[70], under every
    // real modal). Safe to share: this audience (signed-out) and PremiumSlideIn's
    // (signed-in, non-Premium) are mutually exclusive for any one visitor, so the
    // two can never stack.
    <div
      role="region"
      aria-label="Create a free RiftCompare account"
      className={`above-bottombar fixed left-4 z-[70] w-[calc(100%-2rem)] max-w-[20rem] transition-[opacity,transform] duration-slow ease-out sm:w-auto sm:max-w-sm ${
        entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"
      }`}
    >
      {/* THE CHROME IS THE "less annoying" HALF OF THE 2026-09-16 CALL.
          Reported: "on a mobile it covers the full page… maybe it can be a bit
          transparent and cover less than a full page".

          • max-h-[62dvh], down from calc(100dvh-6.5rem) (~88dvh on a 393x852
            phone). The old ceiling was a SAFETY rail — it existed so the ✕ and
            the sign-in buttons stayed reachable, which is the production
            incident the header of tests/signup-slidein.test.ts describes — but
            a rail set just under the viewport also permitted a card that tall,
            and the Premium table filled it. 62dvh leaves a clear majority of
            the page visible behind the nudge, which is the difference between
            a nudge and a takeover. The scroll and the rail both stay: content
            is now short enough not to need them, and "not needed" is not the
            same guarantee as "cannot happen".
          • Translucent + blurred rather than opaque ink-900, so the page is
            visibly still there underneath. Behind supports-[backdrop-filter]
            so a browser without it gets the solid background instead of an
            unreadably see-through card.
          • max-w-[20rem] on phones (sm and up keeps the old max-w-sm), so even
            at its widest it is not edge-to-edge.
          • The cap is also height-relative (2026-09-23): min(…dvh,
            100dvh-9.5rem), so a landscape phone's card stays below the ~125px
            sticky header. `sm:` is keyed on WIDTH, so an 844x390 phone got
            the 70dvh branch and the card started 24px inside the header,
            covering the whole content area. A no-op on portrait phones and
            desktops, where the dvh term is the smaller one. */}
      <div className="relative max-h-[min(62dvh,calc(100dvh-9.5rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl supports-[backdrop-filter]:bg-ink-900/85 supports-[backdrop-filter]:backdrop-blur-md sm:max-h-[min(70dvh,calc(100dvh-9.5rem))]">
        {/* Dismiss sits over the artwork now that there is no header strip.
            .tap-icon (2026-09-23): the same glyph, only a bigger hit area —
            25x28 → 48x48 on touch. Easier to hit, never harder to dismiss
            (DECISIONS 2026-09-14 declined that). The title's pr-10 clears it. */}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="tap-icon absolute right-0 top-0 z-10 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          ✕
        </button>

        {/* THE PITCH: no account vs free account, four rows. Brand-green, not
            gold — gold is this site's Premium colour everywhere (PremiumButton,
            PremiumSlideIn, the nav spotlight), and wearing it on a card that
            sells nothing would promise a paid tier this card deliberately never
            mentions. PremiumPitchPanel (free vs Premium) is untouched and
            remains PremiumSlideIn's, for signed-in visitors. */}
        <div className="px-4 pb-1 pt-4">
          <p className="pr-10 text-sm font-extrabold leading-snug text-white">Create a free account</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Prices stay free for everyone. An account remembers the cards you care about.
          </p>
          <div className="mt-2.5">
            <FreeAccountCompare />
          </div>
        </div>

        <div className="px-4 pb-4 pt-3">
          {/* "Free, no card needed" earns its line; "Continue with" would not —
              the provider buttons below already say "Continue with Google" /
              "…Discord" themselves, so a label restating it is pure height on
              the phone where this card was complained about. The no-card claim
              is the one thing here a visitor cannot read off the buttons, and
              tests/access-tiers.test.ts pins it as an honesty guarantee. */}
          <p className="text-xs font-semibold text-slate-300">Free, no card needed</p>
          {/* BACK TO THE PAGE THEY WERE ON, not /premium (reverted 2026-09-16
              with the pitch itself). Sending a brand-new account to the paid
              page was coherent while this card was selling Premium; now that it
              sells the free account, landing someone on a pricing page is a
              bait-and-switch on the thing they just agreed to. They return to
              whatever they were reading, with a watchlist they can now use. */}
          <AuthForm providers={providers} bare compact source="popup" next={pathname ?? "/"} onProviderClick={snoozeForClick} />
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 min-h-11 w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-slate-400 hover:bg-ink-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
