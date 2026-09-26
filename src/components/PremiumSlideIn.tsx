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
import { PremiumPitchPanel } from "./PremiumPitchPanel";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "@/lib/nudge-timing";
import { usePresence } from "@/lib/motion";
import { Skeleton } from "./ui/Skeleton";

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
// FREQUENCY IS CAPPED HARD, because a repeat nag just trains dismissal:
//   • it waits NUDGE_DELAY_MS after the page opens (5s, shared by every corner
//     nudge — see lib/nudge-timing.ts), rather than popping on render
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
// A second dismissal means never again — two firm no's is a no.
//
// These three moved to lib/nudge-timing.ts on 2026-09-14 so SignupPromoPopup
// could adopt the same cap from ONE definition rather than a second copy of
// these numbers. MAX_DISMISSALS stays as a local alias because this file reads
// it in five places and the shorter name is what those lines were written
// around; the VALUE has exactly one home.
const MAX_DISMISSALS = MAX_NUDGE_DISMISSALS;

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
  { label: "Deal Finder" },
  { label: "Rising Cards" },
  { label: "Target-price alerts" },
  { label: "Best Basket" },
  { label: "Buy this list" },
  { label: "Demand Finder" },
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
const PERSONAL_WAIT_MS = 1500;
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
  const lastCountedPath = useRef<string | null>(null);
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
  // Fetched once, at the moment the card is about to appear (never on mount),
  // and raced against PERSONAL_WAIT_MS so a slow answer costs a generic card,
  // never a late one; the copy is settled before the card renders, so it never
  // swaps in front of the reader. The TIMING rules above are untouched.
  const [personal, setPersonal] = useState<{ heading: string; line: string } | null>(null);

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

    let cancelled = false;
    const dialogOpen = () => typeof document !== "undefined" && document.body.dataset.rcDialog === "1";
    const t = setTimeout(async () => {
      // Never slide in on top of a real modal (signup / feedback / premium dialog).
      if (dialogOpen()) return;
      const mine = await fetchPersonalCopy();
      // Checked AGAIN after the wait: a navigation cancels this run (and the
      // next page starts its own), and a dialog may have opened meanwhile.
      // SESSION_SEEN is only written once the card really will appear, so a
      // cancelled run never burns the session's one showing.
      if (cancelled || dialogOpen()) return;
      try {
        ss?.setItem(SESSION_SEEN, "1");
      } catch {
        /* ignore */
      }
      setPersonal(mine);
      setShown(true);
      trackEvent("premium_slidein_shown", {
        path: pathname ?? "/",
        trial_eligible: trialEligible,
        context: mine ? "personal" : (contextPitch?.tool ?? undefined),
        copy: PREMIUM_COPY_VERSION,
      });
    }, NUDGE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [eligible, shown, pathname, trialEligible, contextPitch]);

  // Fetch the live proof numbers only once the card has actually appeared —
  // never speculatively on mount, since most visitors never trigger it at all.
  useEffect(() => {
    if (!shown || proofFetched.current) return;
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
  }, [shown, country]);

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

  return (
    // Bottom-LEFT so it never collides with the bottom-right feedback pill
    // (FeedbackWidget, above-bottombar right-4). `.above-bottombar` clears the
    // mobile bottom tab bar (0 on desktop, where it's a plain corner inset);
    // z-[70] keeps it under every real modal (feedback panel z-85, premium
    // dialog z-120) while sitting above page chrome. SignupPromoPopup shares
    // this exact z-tier now too (it became a non-modal slide-in itself,
    // 2026-09-01) — safe, since the two audiences (signed-out here, signed-in
    // non-Premium there) can never both apply to the same visitor at once.
    <div
      role="region"
      aria-label="RiftCompare Premium offer"
      className={`above-bottombar fixed left-4 z-[70] w-[calc(100%-2rem)] max-w-sm transition-[opacity,transform] duration-slow ease-out sm:w-auto ${
        entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"
      }`}
    >
      {/* max-h + scroll (2026-09-15, matching SignupPromoPopup's own guard):
          the comparison table below made this card tall enough that the same
          short-viewport overflow this component never used to risk is now a
          real possibility. Belt to the panel's own internal height rules. */}
      <div className="relative max-h-[calc(100dvh-6.5rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-gold/50 bg-ink-900 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        {/* sticky, not just in-flow (2026-09-15): once the card can scroll, an
            in-flow header scrolls away with it, and the dismiss button inside
            it is exactly the control the short-phone incident documented in
            SignupPromoPopup's own header was about losing. z-10 + an opaque
            background keeps it above the scrolling body underneath it. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-800 bg-ink-950 px-4 py-2.5">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Premium
          </span>
          <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-200">{heading}</span>
          {/* .tap-icon (2026-09-23): 48px on touch, up from a px-1 glyph. The
              -my-3 keeps this py-2.5 header's height; the 48px box overhangs
              the header padding by ~2px, which the card's overflow clips.
              -ml-2 -mr-4 lend the box the gap and the header's right padding:
              with -mr-2 alone the default 210px heading got 200px at 390 and
              wrapped, growing the header 45 → 54. The glyph lands within 3px
              of where the old one sat (x≈349 vs 346 at 390). No ml-auto: the
              heading's flex-1 already pushes this right. */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="tap-icon -my-3 -ml-2 -mr-4 shrink-0 self-start rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3">
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
                <span className="font-bold text-white">{proof.deals} cards below TCGplayer market</span> on Deal Finder
                right now.
              </p>
            )
          )}
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
          {/* Same designed panel the signed-out popup leads with, so the two
              nudges read as one offer. showFeatures is back on: the panel's
              old four-row feature list was dropped for exactly this card's
              height budget, but it has since been replaced by the compact
              tick/✗ table, which is the format actually asked for and fits
              the same space — a returning, signed-in visitor should see the
              same quick comparison a brand-new one does, not a lesser pitch.
              This card still carries its own per-route contextual pitch above
              (a deck page sells Best Basket, a card page sells a target alert),
              pinned by tests/premium-slidein.test.ts — that stays, since it is
              more specific than any table row, and the table is what answers
              the very next question ("okay, but what does Premium get me").
              NB: no ISO date in this comment on purpose — it sits inside the
              400-character window after the price-increase banner above that
              tests/premium-price-increase.test.ts scans for hard-coded dates. */}
          <div className="-mx-4 mt-2.5 overflow-hidden">
            <PremiumPitchPanel showFeatures showPlus={premiumPlus} />
          </div>
          {/* PROMOTED above the CTA row, 2026-09-09 (previously an 11px
              footnote BELOW the button). ALWAYS shown. Two different framings
              by design, not an oversight:
              • trialEligible (true for nearly every logged-in free visitor):
                bare "$0 today", explicit product decision (2026-09-09) to
                lead the teaser with the number that's actually true right
                now rather than the recurring price. This is NOT the
                price-hiding bug fixed on 2026-09-06/08 (that one hid the
                price ENTIRELY behind !trialEligible, so most visitors never
                saw a number at all) — a real, correct "$0 today" is always
                shown here, and the recurring price is never more than one
                click away: /premium (this card's own CTA destination), the
                Premium dialog and the checkout page's own "Card required...
                then $X" disclosure all state it before any card is charged.
              • !trialEligible (already used a trial, or trials are off — the
                default since 2026-09-26): there is no $0 to claim, so this
                branch leads with the real recurring price + premiumLockInTail
                ("cancel anytime" unless an increase is announced) — dropping it here
                would leave the card with nothing but tool chips and a bare
                "Unlock Premium" button. */}
          {PREMIUM_PRICE_AMOUNT ? (
            <p className="mt-2 text-center text-[11px] text-slate-500">
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
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={accept}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {cta}
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-ink-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
