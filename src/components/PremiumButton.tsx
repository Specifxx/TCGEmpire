"use client";

import { usePremiumDialog } from "./PremiumDialog";
import { useMe } from "@/lib/use-me";
import { PREMIUM_PRICE_LABEL, trialButtonLabel, introOfferEnabled, tierIntroMonthlyAmount, tierMonthlyAmount, INTRO_MONTHS, type PremiumTierKey } from "@/lib/site";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";

// Opens the site-wide Premium dialog (one click to subscribe / start the trial),
// so gated features don't have to send the user off to /premium. Defaults to a
// trial-aware label — "Start 30 days for $1" for anyone still eligible (the $1 first
// month, 2026-09-30; "Start 30 days free" only if the fee is configured to 0),
// "Upgrade now · $X/mo" otherwise; pass `children` for custom text (e.g. the
// navbar "✦ Premium") and/or `className` to override the styling (e.g. a ghost
// variant).
const GOLD =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink-950 transition hover:brightness-110";

// `surface` names the wall this button sits on ("gate:deal-finder") so the
// click and any checkout it leads to are attributed to it — see
// lib/premium-surface.ts. Every gate passes one; omitting it records "dialog".
//
// `tier` is the LOWEST tier that unlocks what this wall is guarding
// (2026-09-25). "plus" for the full lists and target-price alerts: the dialog
// opens on Plus and the label quotes Plus's price, because that is the honest
// answer to "what does this cost me". Omitted = "premium", as before.
export function PremiumButton({
  children,
  className,
  surface,
  tier: gateTier = "premium",
}: {
  children?: React.ReactNode;
  className?: string;
  surface?: string;
  tier?: PremiumTierKey;
}) {
  const { open } = usePremiumDialog();
  const { user, premium, tier, trialing, interval, trialEligible, trialDays, trialFeeCents, introEligible, premiumPlus, premiumAnnual, premiumCheckout } = useMe();
  // A Plus subscriber hitting a Premium-only gate is already paying — the
  // pitch is an upgrade, not a first subscription, and it names the real
  // recurring price rather than a trial (they've already had theirs). The
  // price follows their own interval: the upgrade route keeps it, so an
  // annual Plus member is billed Premium's yearly price.
  const isPlusUpgrade = premium && tier === "plus";
  // Who is offered the $1 first month: an account that has not had a trial, and a
  // SIGNED-OUT visitor (a brand-new account has never had one: the same reasoning
  // the dialog's own showTrial and /premium's trialAvailable use). Members and
  // accounts that already trialed see the plain "Upgrade now · $X/mo".
  const trialOffer = trialDays > 0 && (trialEligible || (!user && premiumCheckout));
  // …except mid-trial (2026-09-25): the upgrade route only handles ACTIVE
  // subscriptions, so the button must not offer one. It still opens the
  // dialog, which says when a plan change becomes possible.
  const upgradeLater = isPlusUpgrade && trialing;
  // Quote Plus only when Plus is actually on sale; otherwise checkout sells
  // Premium and the label must say Premium's price.
  const sellTier: PremiumTierKey = gateTier === "plus" && premiumPlus ? "plus" : "premium";
  const priceLabel = sellTier === "plus" ? `${tierMonthlyAmount("plus")}/mo` : PREMIUM_PRICE_LABEL;
  return (
    <button type="button" onClick={() => open(surface, { tier: sellTier })} className={className ?? GOLD}>
      {children ?? (
        upgradeLater ? (
          <>
            Premium<span className="font-semibold opacity-80"> · after your trial</span>
          </>
        ) : isPlusUpgrade ? (
          <>
            Upgrade to Premium
            {PREMIUM_PRICE_LABEL ? (
              <span className="font-semibold opacity-80"> · {planSwitchPriceLabel("premium", interval, premiumAnnual)}</span>
            ) : null}
          </>
        ) : trialOffer ? (
          <>
            {trialButtonLabel(trialDays, trialFeeCents)}
          </>
        ) : introEligible && introOfferEnabled() ? (
          // No trial left (e.g. a cancelled trialist) but never paid, so
          // checkout halves the first months — quote that, not the list price.
          <>
            Upgrade now<span className="font-semibold opacity-80"> · {tierIntroMonthlyAmount(sellTier)}/mo for {INTRO_MONTHS} months</span>
          </>
        ) : (
          <>
            Upgrade now{priceLabel ? <span className="font-semibold opacity-80"> · {priceLabel}</span> : null}
          </>
        )
      )}
    </button>
  );
}
