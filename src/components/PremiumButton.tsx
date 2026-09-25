"use client";

import { usePremiumDialog } from "./PremiumDialog";
import { useMe } from "@/lib/use-me";
import { PREMIUM_PRICE_LABEL, premiumZeroToday, introOfferEnabled, tierIntroMonthlyAmount, tierMonthlyAmount, INTRO_MONTHS, type PremiumTierKey } from "@/lib/site";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";

// Opens the site-wide Premium dialog (one click to subscribe / start the trial),
// so gated features don't have to send the user off to /premium. Defaults to a
// trial-aware label — "Start free trial · $0 today" for anyone still eligible,
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
// opens on Plus and the label quotes Plus's price, because $4.99 is the honest
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
  const { premium, tier, trialing, interval, trialEligible, trialDays, introEligible, premiumPlus, premiumAnnual } = useMe();
  // A Plus subscriber hitting a Premium-only gate is already paying — the
  // pitch is an upgrade, not a first subscription, and it names the real
  // recurring price rather than a trial (they've already had theirs). The
  // price follows their own interval: the upgrade route keeps it, so an
  // annual Plus member is billed Premium's yearly price.
  const isPlusUpgrade = premium && tier === "plus";
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
        ) : trialEligible && trialDays > 0 ? (
          <>
            Start free trial<span className="font-semibold opacity-80"> · {premiumZeroToday()}</span>
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
