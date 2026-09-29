"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { trackEvent, firePremiumClickBeacon } from "@/lib/analytics";
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_NEXT_PRICE_AMOUNT,
  PREMIUM_COPY_VERSION,
  premiumPriceIncreaseAnnounced,
  premiumLockInTail,
  premiumZeroToday,
  introFromLine,
  introOfferEnabled,
  tierIntroMonthlyAmount,
  INTRO_MONTHS,
} from "@/lib/site";
import { SEALED_CHECK_CADENCE } from "@/lib/alert-limits";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { PremiumPitchPanel } from "./PremiumPitchPanel";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "@/lib/nudge-timing";
import { PREMIUM_SKIP_PATHS, accountAgeMs, premiumSlideInEligible } from "@/lib/nudge-gate";
import { armNudge, useSessionViews } from "@/lib/nudge-runtime";
import { usePresence } from "@/lib/motion";
import { isSignupSession } from "@/lib/signup-session";
import { Skeleton } from "./ui/Skeleton";

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
// body[data-rc-dialog] flag the signup/feedback modals set, and never sets it
// itself. The signup popup — the site's one full-screen auto-modal — is
// signed-OUT only (see SignupPromoPopup), so the two audiences never overlap.
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
// These three moved to lib/nudge-timing.ts on 2026-09-14 so SignupPromoPopup
// could adopt the same cap from ONE definition rather than a second copy of
// these numbers. MAX_DISMISSALS stays as a local alias because this file reads
// it in five places and the shorter name is what those lines were written
// around; the VALUE has exactly one home.
const MAX_DISMISSALS = MAX_NUDGE_DISMISSALS;

// Where it never shows: the sign-in pages, /premium itself (they're already
// there), and every page with its own inline paid prompt. Whole-segment
// prefixes, from lib/nudge-gate.ts.
const SKIP_PATHS = PREMIUM_SKIP_PATHS;
// Its own per-session page-view count (signed-in views only), so it never
// depends on the sign-up card's counter existing.
const PV_KEY = "rc_prem_slidein_pv";

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
    line: "Every card cheaper than TCGplayer market at a real store, narrowed to the cards you watch or own. Plus and Premium are ad-free, too.",
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

export function PremiumSlideIn() {
  const { user, premium, premiumCheckout, premiumPlus, trialEligible, trialDays, introEligible, loaded } = useMe();
  const { country } = useCountry();
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  // Same shared primitive SignupPromoPopup uses — one definition of "how a
  // corner nudge enters/exits" instead of two copies of the double-rAF +
  // setTimeout trick.
  const { mounted, entered } = usePresence(shown, 250);
  const contextPitch = contextPitchFor(pathname);
  // Live "N cards below TCGplayer market right now" proof line (a count — no
  // dollar total, 2026-09-25). Fetched from the shared,
  // already-cached homepage feed (see api/premium/proof) — ONLY once `shown`
  // flips true, never on mount, so a visitor who never triggers the slide-in
  // never causes this request at all.
  const [proof, setProof] = useState<{ deals: number } | null>(null);
  const proofFetched = useRef(false);
  // Distinguishes "still fetching" from "fetched, nothing worth showing" —
  // proof itself stays null in both cases, but only the first should render
  // a skeleton; the second should render nothing, same as it always did.
  const [proofSettled, setProofSettled] = useState(false);
  // PERSONAL COPY (2026-09-23; lib/premium-nudge.ts). "4 cards you watch are
  // underpriced right now" beats any per-page pitch, so when the account's own
  // cards are in Deal Finder or Rising Cards it REPLACES the heading and line.
  // Fetched once, when the card appears (never on mount, so an account that
  // never sees the card never costs the read), and raced against
  // PERSONAL_WAIT_MS. The card does NOT wait for it (2026-09-29): it shows when
  // its timer fires with the per-page or generic pitch, and the personal line
  // replaces it if it arrives within PERSONAL_WAIT_MS — during or just after
  // the 250 ms entrance. Later than that it is dropped, so it never changes
  // under someone already reading.
  const [personal, setPersonal] = useState<{ heading: string; line: string } | null>(null);
  const personalFetched = useRef(false);

  // Signed-in page views this session (one per distinct route; a reload is not
  // another page). 0 until this route is counted.
  const views = useSessionViews(PV_KEY, pathname, loaded && !!user);
  // Account age from /api/me's createdAt. Unknown fails closed.
  const ageMs = accountAgeMs(user?.createdAt);
  const eligible =
    loaded && !!user && !premium && premiumCheckout && premiumSlideInEligible({ views, accountAgeMs: ageMs, pathname });

  const [details, setDetails] = useState(false);

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

    // NEVER IN THE SIGN-UP SESSION (2026-09-29): the tab where the account was
    // just created gets no Premium ask at all — the first thing after making a
    // free account must not be a request to pay (the 2026-09-23 "Premium after
    // sign-up" rule, which the page-load timing had overridden). The next
    // visit is an ordinary one. lib/signup-session.ts.
    if (isSignupSession()) return;

    // Hard caps, cheapest first.
    if (readNum(ls, DISMISS_COUNT) >= MAX_DISMISSALS) return; // a firm no is permanent
    if (Date.now() < readNum(ls, SNOOZE_UNTIL)) return; // snoozed
    try {
      if (ss?.getItem(SESSION_SEEN) === "1") return; // already shown this session
    } catch {
      /* ignore */
    }
    // The page-view gate (3rd view), the 48-hour account age and the skipped
    // paths are `eligible` above (lib/nudge-gate.ts). armNudge waits
    // NUDGE_DELAY_MS, cancelled if the visitor navigates (this cleanup), opens a
    // dialog or drawer or focuses a text field, and fires only at a quiet moment
    // (not over a dialog, not within 10 s of one closing, not mid-scroll or
    // mid-typing). None of that burns the session's one showing: SESSION_SEEN is
    // written only when the card really appears.
    return armNudge({
      delayMs: NUDGE_DELAY_MS,
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

  // The personal line, once the card is up (see PERSONAL COPY above). The
  // impression is recorded when the race settles, so `context` says which
  // pitch the reader actually got.
  useEffect(() => {
    if (!shown || personalFetched.current) return;
    personalFetched.current = true;
    let cancelled = false;
    void fetchPersonalCopy().then((mine) => {
      if (cancelled) return;
      if (mine) setPersonal(mine);
      trackEvent("premium_slidein_shown", {
        path: pathname ?? "/",
        trial_eligible: trialEligible,
        context: mine ? "personal" : (contextPitch?.tool ?? undefined),
        copy: PREMIUM_COPY_VERSION,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [shown, pathname, trialEligible, contextPitch]);

  // Fetch the live proof numbers only once the visitor has opened "See what's
  // included" — never speculatively on mount or on show, since the line lives
  // inside the disclosure and most visitors never open it.
  useEffect(() => {
    if (!shown || !details || proofFetched.current) return;
    proofFetched.current = true;
    let cancelled = false;
    fetch(`/api/premium/proof?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        if (typeof d.deals === "number") {
          setProof({ deals: d.deals });
        }
      })
      .catch(() => {
        /* best-effort — no proof line is a fine fallback */
      })
      .finally(() => {
        if (!cancelled) setProofSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shown, details, country]);

  // usePresence(shown, 250) now owns letting the exit transition finish
  // before actually unmounting.
  const hide = useCallback(() => setShown(false), []);

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
    trackEvent("premium_slidein_click", {
      trial_eligible: trialEligible,
      context: personal ? "personal" : (contextPitch?.tool ?? undefined),
      copy: PREMIUM_COPY_VERSION,
    });
    firePremiumClickBeacon("slidein"); // its own source since 2026-09-23 (was "button", shared with every nav link) — lib/premium-surface.ts
    try {
      // Engaged, not rejected: a long snooze rather than a dismissal strike, so
      // not buying THIS time doesn't burn one of their two permanent no's.
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_CLICK_MS));
    } catch {
      /* ignore */
    }
    hide();
    router.push("/premium"); // straight to the page — no dialog in between (2026-09-06)
  }, [hide, router, trialEligible, contextPitch, personal]);

  // Esc closes it — non-trapping, because this is not a modal. Ignored while a
  // real dialog is open (2026-09-23): that Escape belongs to the dialog, and
  // dismissing here as well would silently burn one of the two permanent
  // dismissal strikes.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.rcDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!mounted) return null;

  const heading =
    personal?.heading ?? contextPitch?.heading ?? (trialEligible ? "Try Premium free" : "Never overpay for a Riftbound card");
  const bodyLine =
    personal?.line ??
    contextPitch?.line ??
    (premiumPlus
      ? "You've been comparing prices. Plus and Premium are ad-free: Plus shows every deal and emails you when a card you watch hits your price, and Premium buys your whole list for less:"
      : "You've been comparing prices — Premium shows every deal, buys your whole list for less, and is ad-free:");
  const cta = trialEligible && trialDays > 0 ? `Start ${trialDays}-day free trial →` : "Unlock Premium →";

  // ONE PRICE LINE. Two framings by design, not an oversight (2026-09-09):
  // • trialEligible (true for nearly every logged-in free visitor): bare
  //   "$0 today", the number that's actually true right now. The recurring price
  //   is never more than one click away: /premium (this card's own CTA
  //   destination), the Premium dialog and the checkout page's own "Card
  //   required... then $X" disclosure all state it before any card is charged.
  // • !trialEligible (already used a trial, or trials are off — the default
  //   since 2026-09-26): the real recurring price + premiumLockInTail
  //   ("cancel anytime" unless an increase is announced).
  const priceLine = PREMIUM_PRICE_AMOUNT ? (
    <p className="text-xs text-slate-400">
      {trialEligible ? (
        <>
          <span className="text-sm font-extrabold text-white">{premiumZeroToday()}</span>
          {/* The intro offer (lib/site.ts), stated where the $0 is. */}
          {introOfferEnabled() && introEligible && (
            <> · then {tierIntroMonthlyAmount()}/mo for {INTRO_MONTHS} months (half price)</>
          )}
        </>
      ) : (
        <>
          <span className="font-bold text-white">{introFromLine("premium", introEligible)}</span> · {premiumLockInTail()}
        </>
      )}
    </p>
  ) : null;

  return (
    // Bottom-LEFT so it never collides with the bottom-right feedback pill
    // (FeedbackWidget, above-bottombar right-4). `.above-bottombar` clears the
    // mobile bottom tab bar (0 on desktop, where it's a plain corner inset);
    // z-[70] keeps it under every real modal (feedback panel z-85, premium
    // dialog z-120) while sitting above page chrome. SignupPromoPopup shares
    // this exact z-tier now too (it became a non-modal slide-in itself,
    // 2026-09-01) — safe, since the two audiences (signed-out there, signed-in
    // non-Premium here) can never both apply to the same visitor at once.
    // A bottom CARD, never a full-width overlay: 20rem at most, so on a phone
    // the page stays visible beside and above it. The un-entered state uses
    // motion-safe: only, so under prefers-reduced-motion it simply appears.
    <div
      role="region"
      aria-label="RiftCompare Premium offer"
      className={`above-bottombar fixed left-4 z-[70] w-[calc(100%-2rem)] transition-[opacity,transform] duration-slow ease-out ${
        details ? "max-w-[23rem] sm:w-[23rem]" : "max-w-[20rem] sm:w-80"
      } ${
        entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"
      }`}
    >
      {/* Collapsed it is ~190px and 20rem wide; OPEN it widens to 23rem so the tier
          table fits with its Premium column visible (at 20rem "Unlimited" was cut
          off at the edge). The max-h + scroll is for the OPEN disclosure
          (the tier table) and for short viewports, and the header is sticky so
          the ✕ never scrolls away (the short-phone incident in
          SignupPromoPopup's header). */}
      <div className="relative max-h-[min(80dvh,calc(100dvh-9.5rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-gold/50 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-ink-900 py-1 pl-4 pr-1">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Premium
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-100">{heading}</span>
          {/* 44px at every width (min-h-11/min-w-11 over .tap-icon's 36px on
              desktop; 48px on a coarse pointer already). */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="tap-icon min-h-11 min-w-11 shrink-0 self-start rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            ✕
          </button>
        </div>
        <div className="px-4 pb-1.5 pt-0.5">
          {priceLine}
          {/* Same real, decided increase the dialog and /premium announce (see
              lib/site.ts), sized down to one line for this low-intrusion card.
              ONLY while an increase is announced: from 2026-09-22 it also
              showed "Price rises as the site grows — lock in $X for good" in
              the steady state, retired with the 2026-09-26 price cut (the
              price had just gone down; no rise is decided). */}
          {premiumPriceIncreaseAnnounced() && (
            <p className="mt-2 rounded-md border border-gold/40 bg-gold/10 px-2 py-1.5 text-[11px] font-semibold text-gold">
              Price increasing soon — lock in {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} before it rises to{" "}
              {PREMIUM_NEXT_PRICE_AMOUNT}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={accept}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {cta}
            </button>
            <button
              onClick={dismiss}
              className="min-h-11 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-ink-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Not now
            </button>
          </div>
          {/* THE DISCLOSURE: everything that used to be on the card by default
              (the per-page pitch line, the live proof, the tier table) is one
              tap away instead of in the way. A button, not <details>, so it
              carries aria-expanded and the same focus ring as the rest. */}
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            aria-expanded={details}
            aria-controls="premium-slidein-details"
            className="mt-0.5 flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-xs font-semibold text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            See what&apos;s included
            <span aria-hidden="true" className="text-slate-500">{details ? "▴" : "▾"}</span>
          </button>
        </div>
        {details && (
          <div id="premium-slidein-details" className="border-t border-ink-800">
            <div className="px-4 pt-3">
              <p className="text-xs leading-relaxed text-slate-400">{bodyLine}</p>
              {/* Live proof — real numbers, not a made-up urgency line. Renders
                  nothing until the fetch resolves (or if there's too little to
                  make a real case, or it fails), so this can only ever make the
                  pitch stronger, never weaker or slower to appear. */}
              {proof === null && !proofSettled ? (
                <Skeleton className="mt-1.5 h-3.5 w-48" />
              ) : (
                proof &&
                proof.deals >= 5 && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {/* A count, never a dollar total: summed gaps are a savings
                        figure, which the pitch rules ban (QA, 2026-09-25). */}
                    <span className="font-bold text-white">{proof.deals} cards below TCGplayer market</span> on Deal
                    Finder right now.
                  </p>
                )
              )}
            </div>
            <PremiumPitchPanel tableOnly showPlus={premiumPlus} />
          </div>
        )}
      </div>
    </div>
  );
}
