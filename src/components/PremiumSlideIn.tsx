"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent, firePremiumClickBeacon } from "@/lib/analytics";
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_NEXT_PRICE_AMOUNT,
  PREMIUM_COPY_VERSION,
  premiumPriceIncreaseAnnounced,
  premiumLockInTail,
  trialButtonLabel,
  trialOfferLead,
  tierMonthlyAmount,
  introFromLine,
  introOfferEnabled,
  tierIntroMonthlyAmount,
  INTRO_MONTHS,
} from "@/lib/site";
import { SEALED_CHECK_CADENCE } from "@/lib/alert-limits";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { PremiumTicks } from "./PremiumTicks";
import { PREMIUM_SLIDER_DELAY_MS, PREMIUM_SLIDER_SNOOZE_MS, SNOOZE_AFTER_CLICK_MS } from "@/lib/nudge-timing";
import { premiumSliderEligible } from "@/lib/nudge-gate";
import { armNudge } from "@/lib/nudge-runtime";
import { usePresence } from "@/lib/motion";
import { isSignupSession } from "@/lib/signup-session";
import { AuthForm } from "./AuthForm";

// REMOVED 2026-09-28 WITH THE FREE LIMITS, RESTORED 2026-09-29. The owner's
// free-limits brief put the upgrade prompt "where people hit a limit … not in
// popups and headers", and this file was deleted for it; a day later the owner
// asked for it back, instant: "make the sign up and premium slider instant. I
// want to bring the instant feature back." Restored as it stood before its
// removal (after the 2026-09-27 price cut), beside the at-the-limit prompts,
// which stay. The header keeps its plain "Pricing" link: only this came back.
//
// A LOW-INTRUSION Premium nudge for LOGGED-IN, NON-PREMIUM users — aimed squarely
// at the funnel gap behind "most logged-in free users never see a Premium pitch
// at all". The gated tools (Deal Finder, Rising Cards, Best Basket) already sell
// hard with their own blur walls, but most logged-in free users never visit a
// tool page; they browse prices. This puts one Premium moment in front of that
// browsing majority, at a natural pause a few pages into a session. The CTA
// used to open the site-wide upsell dialog; it now goes straight to /premium
// (2026-09-06 — see accept()'s own comment), so this is purely a discovery
// nudge, not a step toward a checkout flow that happens somewhere else.
//
// DELIBERATELY NOT A MODAL. It is a corner slide-in that never covers content,
// never locks scroll, and yields to any real modal — it checks the shared
// body[data-rc-dialog] flag the alert/feedback/Premium dialogs set, and never
// sets it itself. Signed-out visitors get no corner card at all since
// 2026-09-30 (the sign-up slider was removed; sign-up prompts are inline page
// content, InlineSignupPrompt), so this is the only card a free account sees.
//
// ACTIVATE FIRST, ASK SECOND (2026-09-29, "Nudges: value first" in
// DECISIONS.md; owner: "focus on getting visitors to use the site rather than
// annoy them"). It is the SMALLEST card on the site now: a headline, one price
// line, the button pair and a "See what's included" disclosure that opens the
// tier table on demand: at most ~40% of a phone's height, a small corner card
// on a desktop (it was ~740 of 844px, and scrolled inside itself).
//
// WHEN, and it is all of these (lib/nudge-gate.ts premiumSlideInEligible, pinned
// by tests/nudge-gate.test.ts):
//   • not on the session's first two page views: eligible from the 3rd, then
//     NUDGE_DELAY_MS (12 s, shared by every corner nudge; lib/nudge-timing.ts),
//     cancelled if the visitor navigates, opens a dialog or drawer, or focuses a
//     text field, and never mid-scroll or mid-typing (lib/nudge-runtime.ts)
//   • not for an account younger than 48 hours (that is WelcomeChecklist's
//     time, not a purchase's)
//   • not on pages that already carry their own inline paid prompt (the tools pages,
//     /portfolio, /watching, /sealed) or on /premium, /login, /verify, so it
//     never stacks on a gate
// AND FREQUENCY IS CAPPED HARD, because a repeat nag just trains dismissal:
//   • once per browser session (sessionStorage), so navigating doesn't re-pop it
//   • a 7-day snooze after a dismiss; a 14-day snooze after they engage the CTA
//   • NEVER AGAIN after two dismissals (localStorage) — a firm no is permanent
// `premium` from useMe() already covers the most important suppression: anyone
// with access right now — PAID or mid-trial/preview — reads as premium, so this
// only ever targets someone who genuinely has no Premium and can buy it.

const SESSION_SEEN = "rc_prem_slidein_session"; // sessionStorage: shown this session
const DISMISS_COUNT = "rc_prem_slidein_dismisses"; // localStorage: lifetime dismissals
const SNOOZE_UNTIL = "rc_prem_slidein_until"; // localStorage: epoch ms; don't show before this

// A second dismissal means never again — two firm no's is a no.
//
// These three moved to lib/nudge-timing.ts on 2026-09-14 so the sign-up popup
// (removed 2026-09-30) could adopt the same cap from ONE definition rather than
// a second copy of these numbers. MAX_DISMISSALS stays as a local alias because this file reads
// it in five places and the shorter name is what those lines were written
// around; the VALUE has exactly one home.


// Where it never shows: the sign-in pages, /premium itself (they're already
// there), and every page with its own inline paid prompt. Whole-segment
// prefixes, from lib/nudge-gate.ts.

// Its own per-session page-view count (signed-in views only), so it never
// depends on the sign-up card's counter existing.


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
// NO LONGER RENDERED AS CHIPS (2026-09-10) — both nudges' chip rows gave way
// to the designed PremiumPitchPanel, which carries its own four-row feature
// list written against TIER_COMPARISON directly.
// It is deliberately kept, and kept exported, because it is still the canonical
// definition of "which tools are Premium-only": tests/premium-slidein.test.ts
// pins it against TIER_COMPARISON, and every CONTEXT_PITCH entry below is
// validated to name a real label from it. Deleting it would silently remove the
// guard that catches the next tier change, which is the exact failure this list
// was created to prevent.
//
// 2026-09-25 LINEUP: exactly the rows a payment changes — the two full lists,
// target alerts, Best Basket's plan, Buy this list and Demand Finder (Premium
// again the same day). Value Finder and the Bulk Pricer left the product (the
// ad-free row is still named in prose, not as a chip: it is a site-wide perk,
// not a tool with a page).
export const PITCH_TOOLS: { label: string }[] = [
  // The free limits (2026-09-28): a free account watches 10 cards and keeps 50
  // in its portfolio; Plus and Premium are unlimited. Added on restoration
  // (2026-09-29), when the tier table had grown these two rows.
  { label: "Watchlist" },
  { label: "Portfolio" },
  // 2026-09-29: the set tracker's whole-set row (free within the 50 cards).
  { label: "Set tracker" },
  { label: "Deal Finder" },
  { label: "Rising Cards" },
  { label: "Target-price alerts" },
  { label: "Best Basket" },
  { label: "Buy this list" },
  // 2026-09-29: Best Basket's set source, the plan for what a set is missing.
  { label: "Finish this set" },
  // 2026-09-29: the lowest condition the plan and the deck watch may use.
  { label: "Minimum condition" },
  { label: "Demand Finder" },
  // 2026-09-29: the two watches that run for a member (lib/sealed-watch.ts,
  // lib/deck-watch.ts), added to the tier table the same day.
  { label: "Sealed watches" },
  { label: "Deck price watch" },
  // 2026-10-09: the three new paid features. ("Card searches" left with the
  // search allowance on 2026-10-15: searching is unlimited for everyone.)
  { label: "Full price history" },
  { label: "Graded price tracking" },
  { label: "Auction alerts" },
  { label: "RiftCompare Coins" },
];

// A contextual heading/line, keyed by the CURRENT page, instead of the one
// generic pitch every route got before. Each entry names the ONE paid feature
// most relevant to where the visitor already is — a deck page sells Best
// Basket, a card page sells a target-price alert on that card — rather than
// the flat "unlock N tools" line that's true everywhere and therefore
// compelling nowhere.
//
// EVERY HEADING IS ABOUT WHAT THE READER SAVES OR LEARNS BEFORE BUYING
// (2026-09-14 reframe, see DECISIONS.md). Rising Cards now calls itself a
// screen, not a prediction (tools/rising FAQ, 2026-09-25), and until its price
// signals rebuild after the 2026-09-23 re-basing every pick is ranked on
// demand and stock alone — so its pitch says what it shows (which cards
// players are searching for, and why each ranks), never a buy-now-or-wait
// answer, and never a discount.
// First matching prefix wins; no match falls back to the original generic copy.
//
// Every `tool` here MUST be a real PITCH_TOOLS label (tests/premium-slidein.test.ts
// pins this) — the same discipline PITCH_TOOLS's own header comment already
// holds itself to, so this can't silently drift the way the old hand-written
// sentence did.
const CONTEXT_PITCH: { prefixes: string[]; tool: string; heading: string; line: string }[] = [
  {
    prefixes: ["/sealed"],
    tool: "Sealed watches",
    heading: "Sealed watches email you when a box is back or at RRP",
    line: `Heart a booster box or bundle and Plus emails you when a real store has it back in stock, when it's at RRP where we publish one, or at your own price. Stores are checked ${SEALED_CHECK_CADENCE} and every email says when.`,
  },
  // 2026-09-29 (personas pass). The set tracker is free within the 50-card
  // portfolio, so this line is where card 51 becomes Plus: it says what is free
  // first. It must sit BEFORE "/portfolio" (first prefix match wins).
  {
    prefixes: ["/portfolio/sets", "/sets"],
    tool: "Set tracker",
    heading: "Set tracker: see what your set is missing, and the cheapest listing to finish it",
    line: `Tick the cards in your binder to see what a set is missing and the cheapest listing for each, free for your first ${FREE_PORTFOLIO_LIMIT} cards. Plus removes the limit so a whole set fits; nobody loses cards they already have. Premium plans the store-by-store order for the rest.`,
  },
  {
    prefixes: ["/tools/best-basket"],
    tool: "Minimum condition",
    heading: "Minimum condition keeps a played copy out of your plan",
    line: "Premium's Best Basket can use only Near Mint, or Lightly Played or better, so the cheapest plan never quietly includes a copy you wouldn't play. A card with nothing at that grade is shown as not covered.",
  },
  {
    prefixes: ["/deck"],
    tool: "Best Basket",
    heading: "Best Basket finds the cheapest way to buy this whole deck",
    line: "Send this deck to Best Basket and see its delivered total across your country's stores, skipping the copies you own, free. Premium shows which store to buy each card from.",
  },
  {
    prefixes: ["/card/"],
    tool: "Target-price alerts",
    heading: "Target-price alerts email you when this card hits your price",
    line: "Set the price you'd pay on a card you watch. After every price update we check every tracked store in your country and email you the store and the link. Plus and Premium are ad-free, too.",
  },
  {
    prefixes: ["/watching", "/portfolio"],
    tool: "Deal Finder",
    heading: "Deal Finder shows which of your cards are cheap right now",
    line: "Every card underpriced vs TCGplayer or vs eBay at a real store, narrowed to the cards you watch or own. Plus and Premium are ad-free, too.",
  },
  {
    prefixes: ["/movers", "/market"],
    tool: "Rising Cards",
    heading: "Rising Cards shows which cards players are searching for, and why each one ranks",
    line: "Ranked by search demand and stores in stock, with the reason for each pick. Your free account shows the top three; Plus shows every pick, and goes ad-free. A screen, not a prediction or financial advice.",
  },
];

function contextPitchFor(pathname: string | null) {
  if (!pathname) return null;
  return CONTEXT_PITCH.find((c) => c.prefixes.some((p) => pathname.startsWith(p))) ?? null;
}

function readNum(store: Storage | undefined | null, key: string): number {
  try {
    return Number(store?.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

// The personal line, or null — never throws, never waits longer than
// PERSONAL_WAIT_MS. 204 (nothing specific to say) and any failure are both null.
// 600 ms, not 1.5 s, since the slider went instant (2026-09-29): this race is
// the only wait left before the card appears, so a slow answer shows the
// generic pitch rather than holding the card back.
const PERSONAL_WAIT_MS = 600;
async function fetchPersonalCopy(): Promise<{ heading: string; line: string } | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PERSONAL_WAIT_MS));
  const request = fetch("/api/premium/nudge")
    .then((r) => (r.status === 200 ? r.json() : null))
    .then((d) => (d && typeof d.heading === "string" && typeof d.line === "string" ? { heading: d.heading, line: d.line } : null))
    .catch(() => null);
  return Promise.race([request, timeout]);
}

// THE AKALI SLIDER, BACK FOR EVERYONE (2026-10-17, owner: "bring back the Akali
// sign-in slider that prompts you to buy premium … all the comparison of the
// premium features … prompts you to sign in first with Google or Discord …
// even for signed-out accounts … show up after a couple seconds … we don't need
// two separate sign-up sliders"). DECISIONS.md, "The Akali slider returns".
//
// ONE card for every visitor who is not Premium. It replaces both the signed-in
// Premium card and the signed-out sign-up card (SignupSlideIn, deleted):
//   • the owner's 2026-09-10 comp — Akali bleeding behind a dark scrim, the
//     wordmark, a PREMIUM badge and "Never overpay" (public/premium/
//     premium-pitch.webp, retired 2026-09-15 and restored here);
//   • the real Free vs Premium tick/✗ table (TierComparisonTable, compact), the
//     same rows /premium renders, so the comparison cannot drift;
//   • signed out: Google and Discord, straight into Premium checkout
//     (/premium/start: sign-in is a step inside checkout, 2026-09-13), and the
//     account it makes is free either way; signed in: the checkout button.
// THE LAYOUT IS THE MOBILE FIX: header and buttons never scroll (a flex column
// capped below the sticky header and the bottom tab bar), only the table does,
// so the ✕ and the sign-in buttons are always on screen on a 360px phone.
// Timing: PREMIUM_SLIDER_DELAY_MS after the page settles, once a session, and a
// dismissal snoozes it for PREMIUM_SLIDER_SNOOZE_MS; never on sign-in, checkout,
// the arcade or the Pokémon section (lib/nudge-gate.ts premiumSliderEligible).
const ART = "/premium/premium-pitch.webp";
// The five rows the slider shows, by PremiumTicks name: what a first payment
// changes most, in /premium's own words and marks.
const SLIDER_ROWS = ["No ads", "Unlimited watchlist & portfolio", "Target-price alerts", "Full Deal Finder & Rising Cards", "Store-by-store buying plan"];

export function PremiumSlideIn() {
  const { user, premium, premiumCheckout, premiumPlus, trialEligible, trialDays, trialFeeCents, introEligible, loaded, answered, providers } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const { mounted, entered } = usePresence(shown, 250);
  const contextPitch = contextPitchFor(pathname);
  const [personal, setPersonal] = useState<{ heading: string; line: string } | null>(null);
  const personalFetched = useRef(false);
  const signedOut = loaded && answered === true && !user;
  const eligible =
    loaded && premiumCheckout && !premium && (signedOut || !!user) && premiumSliderEligible({ pathname }) && (!signedOut || providers.length > 0);

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
    if (isSignupSession()) return;
    if (Date.now() < readNum(ls, SNOOZE_UNTIL)) return;
    try {
      if (ss?.getItem(SESSION_SEEN) === "1") return;
    } catch {
      /* ignore */
    }
    return armNudge({
      delayMs: PREMIUM_SLIDER_DELAY_MS,
      onFire: () => {
        try {
          ss?.setItem(SESSION_SEEN, "1");
        } catch {
          /* ignore */
        }
        setShown(true);
      },
    });
  }, [eligible, shown, pathname]);

  // Signed-in members get their own line (their cards, or this page's tool);
  // the impression is recorded once that settles, as before.
  useEffect(() => {
    if (!shown || personalFetched.current) return;
    personalFetched.current = true;
    let cancelled = false;
    const mine = user ? fetchPersonalCopy() : Promise.resolve(null);
    void mine.then((m) => {
      if (cancelled) return;
      if (m) setPersonal(m);
      trackEvent("premium_slidein_shown", {
        path: pathname ?? "/",
        signed_in: !!user,
        trial_eligible: trialEligible,
        context: m ? "personal" : (contextPitch?.tool ?? undefined),
        copy: PREMIUM_COPY_VERSION,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [shown, pathname, trialEligible, contextPitch, user]);

  const hide = useCallback(() => setShown(false), []);
  const dismiss = useCallback(() => {
    hide();
    try {
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + PREMIUM_SLIDER_SNOOZE_MS));
    } catch {
      /* ignore */
    }
    trackEvent("premium_slidein_dismissed", { signed_in: !!user });
  }, [hide, user]);
  const snoozeAfterClick = useCallback(() => {
    try {
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_CLICK_MS));
    } catch {
      /* ignore */
    }
  }, []);
  const accept = useCallback(() => {
    trackEvent("premium_slidein_click", {
      signed_in: true,
      trial_eligible: trialEligible,
      context: personal ? "personal" : (contextPitch?.tool ?? undefined),
      copy: PREMIUM_COPY_VERSION,
    });
    firePremiumClickBeacon("slidein");
    snoozeAfterClick();
    hide();
    router.push("/premium");
  }, [hide, router, trialEligible, contextPitch, personal, snoozeAfterClick]);
  const providerClick = useCallback(() => {
    trackEvent("premium_slidein_click", { signed_in: false, copy: PREMIUM_COPY_VERSION });
    firePremiumClickBeacon("slidein");
    snoozeAfterClick();
  }, [snoozeAfterClick]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.rcDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!mounted) return null;

  const line = user
    ? (personal?.line ??
      contextPitch?.line ??
      (premiumPlus
        ? "Plus and Premium are ad-free. Plus shows every deal and emails you at your price; Premium buys your whole list for less."
        : "Premium shows every deal, buys your whole list for less, and is ad-free."))
    : "Sign in, then choose Premium. Your free account keeps your watchlist either way.";
  const cta = trialEligible && trialDays > 0 ? `${trialButtonLabel(trialDays, trialFeeCents)} →` : "Unlock Premium →";
  const priceLine = PREMIUM_PRICE_AMOUNT ? (
    <p className="mt-1 text-[11px] leading-snug text-slate-300">
      {trialEligible && trialDays > 0 ? (
        <>
          <span className="font-extrabold text-white">{trialOfferLead(trialDays, trialFeeCents)}</span>
          <> · then from {premiumPlus ? tierMonthlyAmount("plus") : PREMIUM_PRICE_AMOUNT}/mo</>
          {introOfferEnabled() && introEligible && <> · then {tierIntroMonthlyAmount()}/mo for {INTRO_MONTHS} months</>}
        </>
      ) : (
        <>
          <span className="font-bold text-white">{introFromLine("premium", introEligible)}</span>
          <span className="hidden sm:inline"> · {premiumLockInTail()}</span>
        </>
      )}
    </p>
  ) : null;
  const back = pathname ?? "/";
  const next = `/premium/start?tier=premium&plan=monthly&back=${encodeURIComponent(back)}`;

  return (
    <div
      role="region"
      aria-label="RiftCompare Premium"
      className={`above-bottombar fixed left-4 z-[70] w-[calc(100%-2rem)] max-w-[20rem] transition-[opacity,transform] duration-slow ease-out sm:w-[20rem] ${
        entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"
      }`}
    >
      {/* 70% SIMPLER (2026-10-17, owner: "the premium slider should also be 70%
          simpler and smaller on phone"). DECISIONS.md, "/premium, 70% simpler".
          Header (Akali, "Never overpay", the price line), five ticks rows Free
          vs Premium, and the ask. The page's context line shows from sm up
          only; no kicker, no seventeen-row scrolling table, no "Not now" (the
          ✕ and Escape dismiss). About 330px tall on a 390px phone. */}
      <div className="flex max-h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-xl border border-gold/50 bg-ink-950 shadow-2xl [@media(max-height:520px)]:overflow-y-auto">
        {/* Header: Akali on the right, under a scrim, the pitch on the left. */}
        <div className="relative shrink-0 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[58%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ART} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[38%_26%]" />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #0e1116 0%, rgba(14,17,22,0.82) 26%, rgba(14,17,22,0.30) 62%, rgba(14,17,22,0.12) 100%)",
              }}
            />
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="tap-icon absolute right-1 top-1 z-10 min-h-11 min-w-11 rounded-lg bg-ink-950/50 text-slate-200 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            ✕
          </button>
          <div className="relative px-3.5 pb-2 pt-2.5" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
            <span className="rounded border border-gold/60 bg-ink-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
              RiftCompare Premium
            </span>
            <h2 className="mt-1.5 font-display text-[19px] font-extrabold uppercase italic leading-none tracking-tight text-white">
              Never <span className="text-brand-400">overpay</span>
            </h2>
            {priceLine}
            {premiumPriceIncreaseAnnounced() && (
              <p className="mt-1 text-[10px] font-semibold text-gold">
                Price increasing soon: lock in {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} before it rises to {PREMIUM_NEXT_PRICE_AMOUNT}
              </p>
            )}
          </div>
        </div>

        {/* Five rows of the /premium ticks, Free vs Premium. */}
        <div className="shrink-0 px-3 pb-2">
          <PremiumTicks dense showPlus={false} prices={{ plus: "", premium: "" }} selected="premium" only={SLIDER_ROWS} />
        </div>

        {/* The ask: always visible. */}
        <div className="shrink-0 border-t border-ink-800 bg-ink-900 px-3.5 pb-3 pt-2">
          <p className="hidden text-[11px] leading-snug text-slate-400 sm:block">{line}</p>
          {user ? (
            <button
              onClick={accept}
              className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {cta}
            </button>
          ) : (
            <AuthForm providers={providers} bare compact row source="premium_slider" next={next} onProviderClick={providerClick} />
          )}
        </div>
      </div>
    </div>
  );
}
