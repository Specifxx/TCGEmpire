"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe, invalidateMe } from "@/lib/use-me";
import { trackEvent, firePremiumClickBeacon } from "@/lib/analytics";
import { recallPremiumSurface } from "@/lib/premium-surface";
import { AuthForm } from "./AuthForm";
import { premiumStartHref } from "@/lib/premium-start";
import { AnnualPriceBlock } from "./AnnualPriceBlock";
import { Dialog } from "./ui/Dialog";
import { Spinner } from "./ui/Skeleton";
import { TrialPriceBlock } from "./TrialPriceBlock";
import { TierComparisonTable } from "./TierComparisonTable";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";
import {
  PREMIUM_PRICE_LABEL,
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_NEXT_PRICE_AMOUNT,
  PREMIUM_COPY_VERSION,
  TIER_NAMES,
  annualSavingPct,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumLockInHeadline,
  premiumEffectiveMonthly,
  tierMonthlyAmount,
  tierAnnualAmount,
  tierIntroMonthlyAmount,
  introOfferEnabled,
  introPriceLine,
  INTRO_MONTHS,
  type PremiumTierKey,
} from "@/lib/site";

// A site-wide Premium upsell dialog so users can subscribe / start the trial from
// wherever they hit a wall — no navigating to /premium first. Any client component
// can trigger it via usePremiumDialog().open(). Styled as a compact market-terminal
// panel (ink surfaces, gold accent, monospace figures) — deliberately not the green
// "bubble" look.
// `open(surface)` names WHERE the dialog was opened from — "gate:deal-finder",
// "gate:portfolio" … (lib/premium-surface.ts) — so the click beacon, and the
// checkout it may lead to, can be attributed. No argument = "dialog", the
// pre-2026-09-23 catch-all, kept for any caller that has no better name.
//
// `opts.tier` (2026-09-25) preselects the tier being SOLD. A wall whose tool
// Plus already unlocks (Deal Finder, Rising Cards, target-price alerts) passes
// "plus", so the dialog opens on the $4.99 answer that fits instead of the
// $9.99 one that merely includes it. Omitted = "premium", as before.
export type PremiumDialogOpenOpts = { tier?: PremiumTierKey };
const PremiumDialogContext = createContext<{ open: (surface?: string, opts?: PremiumDialogOpenOpts) => void }>({ open: () => {} });
export function usePremiumDialog() {
  return useContext(PremiumDialogContext);
}

const GOLD_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110 disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-70";

export function PremiumDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTier, setInitialTier] = useState<PremiumTierKey>("premium");
  const open = useCallback((surface?: string, opts?: PremiumDialogOpenOpts) => {
    setInitialTier(opts?.tier === "plus" ? "plus" : "premium");
    setIsOpen(true);
    // Fire-and-forget premium-interest beacon (who clicked Premium, and from
    // which surface). The shared helper is keepalive, swallows failures, and
    // remembers the surface for the tab so checkout can carry it.
    firePremiumClickBeacon(surface ?? "dialog");
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <PremiumDialogContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onClose={close} size="xl" z="modal" labelledBy="premium-dialog-title">
        <PremiumDialog onClose={close} initialTier={initialTier} />
      </Dialog>
    </PremiumDialogContext.Provider>
  );
}

function PremiumDialog({ onClose, initialTier }: { onClose: () => void; initialTier: PremiumTierKey }) {
  const { user, premium, tier, trialing, interval, premiumCheckout, premiumPlus, trialEligible, trialDays, introEligible, premiumAnnual, plusAnnual, providers, loaded } = useMe();
  // Where the visitor was when the wall interrupted them — carried through
  // sign-in and Stripe so /premium/welcome can put them back on it.
  const pathname = usePathname();
  // Which tier is being SOLD — only meaningful while shopping (below). Defaults
  // to "premium" so every render before Plus existed, and every render with
  // Plus unconfigured, behaves exactly as before.
  // The Dialog unmounts its children while closed, so this initial value is
  // re-read on every open — a Plus-level wall opens on Plus. /api/me may still
  // be loading here, so the effect below falls back to Premium once it says
  // Plus isn't configured (checkout would sell Premium anyway).
  const [sellTier, setSellTier] = useState<PremiumTierKey>(initialTier);
  useEffect(() => {
    if (loaded && !premiumPlus) setSellTier("premium");
  }, [loaded, premiumPlus]);
  const savePct = annualSavingPct(sellTier);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monthly is the default even when annual is offered. Annual is the better
  // value and says so on its own toggle (−33%), but defaulting to it puts the
  // larger number (PREMIUM_ANNUAL_AMOUNT) in front of someone who has not decided
  // to pay anything yet. Monthly is the lower-commitment first step; annual is
  // one tap away for anyone who wants it — and the monthly price block now
  // carries its own one-line pointer to the annual rate (see below), so that
  // tap is never more than a click away from the number that sells it.
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const annualForSellTier = sellTier === "plus" ? plusAnnual : premiumAnnual;
  const activePlan = annualForSellTier ? plan : "monthly";
  // A SIGNED-OUT visitor has, by definition, never started a trial — the same
  // reasoning /premium's own trialAvailable uses, and why trialEligible (which
  // needs a signed-in account to check trialStartedAt) can't answer for them.
  // Without this the signed-out card quoted the full price for a purchase that
  // will actually charge $0 today.
  const showTrial = trialEligible || (!user && trialDays > 0);

  async function checkout(selected: "monthly" | "annual") {
    setBusy(true);
    setError(null);
    // Fired BEFORE the fetch — dual-destination (see PremiumCta.tsx's own
    // comment on why this event isn't in GA4_ONLY_EVENTS).
    trackEvent("premium_checkout_started", { plan: selected, tier: sellTier, trial_eligible: trialEligible, source: "dialog", copy: PREMIUM_COPY_VERSION });
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected, tier: sellTier, surface: recallPremiumSurface() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't start checkout");
        setBusy(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  // Plus → Premium, in-app, same interval — for a Plus subscriber who hits
  // this dialog from a pro-tool wall. See api/premium/upgrade/route.ts.
  async function upgradeTier() {
    setBusy(true);
    setError(null);
    trackEvent("premium_tier_upgrade_started", { source: "dialog", copy: PREMIUM_COPY_VERSION });
    try {
      const res = await fetch("/api/premium/upgrade", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't upgrade — try again");
        setBusy(false);
        return;
      }
      invalidateMe();
      trackEvent("premium_tier_upgrade_success", { source: "dialog" });
      onClose();
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  // THE SELECTION — tier, plan and the price for it. Rendered for a SIGNED-OUT
  // visitor too, not just the checkout branch below, so the choice is made
  // BEFORE sign-in and rides through the OAuth round trip in the start URL.
  // Previously the signed-out state was a bare "create an account" link: the
  // visitor signed in, landed on /premium and had to make the choice from
  // scratch, on a different page, having lost the tool they were looking at.
  const selector = (
    <>
              {/* Tier toggle (only when Plus is actually configured) —
                  which tier is being SOLD, independent of the monthly/annual
                  plan toggle below. */}
              {premiumPlus && (
                <div className="mb-2 flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-950/50 p-1">
                  <button
                    onClick={() => setSellTier("plus")}
                    aria-pressed={sellTier === "plus"}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${sellTier === "plus" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Plus
                  </button>
                  <button
                    onClick={() => setSellTier("premium")}
                    aria-pressed={sellTier === "premium"}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${sellTier === "premium" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Premium
                  </button>
                </div>
              )}

              {/* Plan toggle (only when annual is configured for the selected tier) */}
              {annualForSellTier && (
                <div className="mb-3 flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-950/50 p-1">
                  <button
                    onClick={() => setPlan("monthly")}
                    aria-pressed={activePlan === "monthly"}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activePlan === "monthly" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setPlan("annual")}
                    aria-pressed={activePlan === "annual"}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activePlan === "annual" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Annual{savePct > 0 && <span className="ml-1 text-[10px] font-extrabold text-brand-300">−{savePct}%</span>}
                  </button>
                </div>
              )}

              {/* Price for the selected plan.
                  While the visitor is trial-eligible the headline number is
                  what they will actually be charged today — zero — because
                  that is the number the decision turns on. The real price and
                  the day it starts sit directly underneath in the same block,
                  not in fine print further down: "$0" alone would be a lie by
                  omission, and a card IS required to start. */}
              {showTrial ? (
                <div className="mb-3">
                  <TrialPriceBlock plan={activePlan} trialDays={trialDays} tier={sellTier} introEligible={introEligible} />
                </div>
              ) : activePlan === "annual" ? (
                <div className="mb-3">
                  <AnnualPriceBlock size="sm" tier={sellTier} />
                </div>
              ) : (
                <div className="mb-3 text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="num text-3xl font-extrabold text-white">{sellTier === "plus" ? tierMonthlyAmount("plus") : PREMIUM_PRICE_AMOUNT}</span>
                    <span className="text-sm text-slate-400">/{PREMIUM_PRICE_PERIOD}</span>
                  </div>
                  {/* A cancelled trialist has no trial left but has never paid, so
                      checkout still halves their first months — say so here. */}
                  {introEligible && introOfferEnabled() && (
                    <p className="mt-1 text-[11px] font-semibold text-brand-400" data-intro-offer>
                      First {INTRO_MONTHS} months {tierIntroMonthlyAmount(sellTier)}/mo — half price
                    </p>
                  )}
                  {/* One tap from the smaller monthly number to the one that
                      actually sells Premium — the effective annual rate. Only
                      rendered when there's an annual plan to switch to. */}
                  {annualForSellTier && premiumEffectiveMonthly(sellTier) && (
                    <button
                      onClick={() => setPlan("annual")}
                      className="mt-1 text-[11px] font-semibold text-brand-400 transition hover:underline"
                    >
                      or from {premiumEffectiveMonthly(sellTier)}/mo billed yearly →
                    </button>
                  )}
                </div>
              )}
    </>
  );

  return (
    // Dialog (ui/Dialog.tsx) now owns the "overlay scrolls, not the card"
    // shape this comment used to document in full — the h-[100dvh] +
    // safe-area + overflow-y-auto overlay, the min-h-full centering wrapper,
    // all of it. This is just the panel itself.
    <div className="relative w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        {/* Terminal-style header bar */}
        <div className="flex items-center justify-between border-b border-ink-700 bg-ink-950/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">RiftCompare</span>
            {/* The plan being sold: a Plus gate opens on Plus (QA, 2026-09-25). */}
            <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              {TIER_NAMES[sellTier]}
            </span>
          </div>
          {/* One close-button shape across every ✕ (2026-09-23): .tap-icon is
              44px below sm, 36px from sm and 48px under pointer:coarse; the
              bare glyph measured 13x24. -my-3 (not -my-2) is what keeps this
              py-3 header bar at 49px on touch — -my-2 still grew it to 57. */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-icon -my-3 -mr-2 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5">
          <h2 id="premium-dialog-title" className="text-lg font-extrabold text-white">Never overpay for a Riftbound card</h2>
          <p className="mt-1 text-sm text-slate-400">
            {premiumPlus
              ? "Plus and Premium are ad-free. Plus shows every deal and emails you the store when a card you watch hits your price; Premium buys your whole list for less. Price comparison and the portfolio tracker stay free."
              : "Premium is ad-free, shows every deal, and buys your whole list for less. Price comparison and the portfolio tracker stay free."}
          </p>

          {/* Only for someone who could still act on it — already-Premium
              visitors are grandfathered regardless, so the urgency has nothing
              left to say to them. */}
          {/* Shown whether or not a specific rise is announced — same change
              and same reasoning as /premium's banner (2026-09-22). Still only
              for someone who could act on it: an already-Premium visitor is
              grandfathered regardless, so the urgency has nothing to say to
              them. And only while PREMIUM is the plan selected: the lock-in
              is Premium's price policy, and a Plus gate opens this dialog on
              Plus — "lock in $9.99/month" over a $4.99 Plus checkout was the
              wrong price on the main conversion surface (QA, 2026-09-25). */}
          {!premium && sellTier === "premium" && (
            <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-center text-xs font-semibold text-gold">
              {premiumPriceIncreaseAnnounced() ? (
                <>
                  Price increasing soon — lock in {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} before it rises to{" "}
                  {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD}.
                </>
              ) : (
                <>
                  {premiumLockInHeadline()} — the price rises as the site grows, your rate never does.
                </>
              )}
            </div>
          )}

          {/* The SAME rows /premium shows — see TierComparisonTable's header for
              why this is imported rather than restated. Capped in height with its
              own scroll so a 14-row table can never push the CTA below the fold
              on a short screen. */}
          <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-lg border border-ink-800">
            <TierComparisonTable compact showPlus={premiumPlus} />
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Scroll the table for the full list · every row is a real entitlement
          </p>

          <div className="mt-5">
            {!loaded ? (
              <div className="h-11 animate-pulse rounded-lg bg-ink-800" />
            ) : premium && tier === "plus" ? (
              // A Plus subscriber hitting a Premium-only gate — this IS a real
              // upgrade opportunity, not the "you already have it" dead end the
              // plain `premium` branch below would show.
              //
              // Keyed on the member's OWN tier alone, never on premiumPlus:
              // that flag says Plus is currently SELLABLE, and if the Plus
              // price ids are ever unset or rotated, existing Plus accounts
              // don't stop existing — they'd just fall through to "You're
              // Premium" while still locked out of the list tools. The
              // upgrade button below handles its own unavailability.
              //
              // NOT MID-TRIAL (2026-09-25): /api/premium/upgrade selects only
              // ACTIVE subscriptions, so a Plus trialist pressing this got an
              // error. They are told when it opens instead. The quoted price
              // follows the subscriber's own interval — the route keeps it, so
              // an annual Plus member is billed Premium's yearly price.
              <div className="text-center">
                <p className="text-sm font-semibold text-gold">✓ You&apos;re on Plus</p>
                <p className="mt-1 text-xs text-slate-400">
                  Premium adds Best Basket&apos;s store-by-store plan, Buy this list for your deck, watchlist or binder,
                  Demand Finder and unlimited target alerts.
                </p>
                {trialing ? (
                  <p className="mt-3 rounded-lg border border-ink-700 px-3 py-2 text-xs text-slate-300">
                    Plan changes open once your free trial has converted — upgrade from{" "}
                    <Link href="/premium" onClick={onClose} className="font-semibold text-gold hover:underline">
                      your membership page
                    </Link>{" "}
                    then.
                  </p>
                ) : (
                  <button onClick={upgradeTier} disabled={busy} className={`${GOLD_BTN} mt-3`}>
                    {busy ? "Upgrading…" : `Upgrade to Premium — ${planSwitchPriceLabel("premium", interval, premiumAnnual)} →`}
                  </button>
                )}
                {error && <p role="alert" className="mt-2 text-center text-xs text-rose-400">{error}</p>}
              </div>
            ) : premium ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-gold">✓ You&apos;re Premium</p>
                <Link href="/tools" onClick={onClose} className="btn-ghost mt-2 text-sm">Go to your tools →</Link>
              </div>
            ) : !premiumCheckout ? (
              // Checked BEFORE the signed-out branch: with Stripe unconfigured
              // there is nothing to sign in for, and the sign-in copy below
              // would promise a checkout that cannot open. The honest waitlist
              // CTA is the right answer for signed-out and signed-in alike.
              <div className="text-center">
                <p className="text-sm text-slate-300">Premium is launching very soon.</p>
                <Link href="/contact" onClick={onClose} className="btn-ghost mt-2 text-sm">Join the waitlist</Link>
              </div>
            ) : !user ? (
              // SIGN-IN IN PLACE, not a link to /login. This branch used to send
              // the visitor to /login?next=/premium — six clicks to Stripe, and
              // the hardcoded /premium destination threw away the deck or card
              // page whose blur-wall they had just hit. The provider buttons are
              // right here now, and ?next= carries the tier, the plan and the
              // page they were on into /premium/start, which opens Stripe the
              // moment sign-in completes. See lib/premium-start.ts.
              <>
                {selector}
                <p className="mb-2 text-center text-xs font-semibold text-slate-300">
                  Sign in to continue to secure checkout
                </p>
                <AuthForm
                  providers={providers}
                  bare
                  compact
                  source="premium_dialog"
                  next={premiumStartHref({ tier: sellTier, plan: activePlan, back: pathname, src: "dialog" })}
                />
                <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                  {showTrial
                    ? "Your account is free and needs no card. A card is required to start the trial · cancel anytime before it converts."
                    : "Your account is free and needs no card · cancel your subscription anytime."}
                </p>
              </>
            ) : (
              <>
                {selector}

                <button onClick={() => checkout(activePlan)} disabled={busy} aria-busy={busy} className={GOLD_BTN}>
                  {busy && <Spinner size="sm" />}
                  {busy
                    ? "Opening checkout…"
                    : trialEligible
                    ? `Start ${trialDays}-day free trial →`
                    : activePlan === "annual"
                    ? `Get annual — ${tierAnnualAmount(sellTier)}/yr →`
                    : `Upgrade to ${TIER_NAMES[sellTier]} →`}
                </button>
                <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                  {(() => {
                    const priceAfter =
                      activePlan === "annual"
                        ? `${tierAnnualAmount(sellTier)}/yr`
                        : introEligible && introOfferEnabled()
                        ? introPriceLine(sellTier)
                        : sellTier === "plus"
                        ? `${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD}`
                        : PREMIUM_PRICE_LABEL || "billed monthly";
                    // On the trial path the price block above already states the
                    // amount and when it starts, so repeating it here just makes
                    // the same sentence twice. What is left to say is the part
                    // the block above does NOT cover: a card is needed up front,
                    // and cancelling is free.
                    return trialEligible ? (
                      <>Card required to start · cancel anytime before it converts.</>
                    ) : (
                      <>{priceAfter} · cancel anytime.</>
                    );
                  })()}
                </p>
                {error && <p role="alert" className="mt-2 text-center text-xs text-rose-400">{error}</p>}
              </>
            )}
          </div>

          {!premium && sellTier === "premium" && (
            <p className="mt-3 text-center text-[11px] font-medium text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
          )}
          <p className="mt-3 text-center text-xs text-slate-600">
            <Link href="/premium" onClick={onClose} className="transition hover:text-slate-400 hover:underline">
              See all plans &amp; details →
            </Link>
          </p>
        </div>
    </div>
  );
}
