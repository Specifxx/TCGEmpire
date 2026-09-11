"use client";

import { usePremiumDialog } from "./PremiumDialog";
import { useMe } from "@/lib/use-me";
import { PREMIUM_PRICE_LABEL, premiumZeroToday } from "@/lib/site";

// Opens the site-wide Premium dialog (one click to subscribe / start the trial),
// so gated features don't have to send the user off to /premium. Defaults to a
// trial-aware label — "Start free trial · $0 today" for anyone still eligible,
// "Upgrade now · $X/mo" otherwise; pass `children` for custom text (e.g. the
// navbar "✦ Premium") and/or `className` to override the styling (e.g. a ghost
// variant).
const GOLD =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink-950 transition hover:brightness-110";

export function PremiumButton({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { open } = usePremiumDialog();
  const { premium, tier, trialEligible, trialDays } = useMe();
  // A Plus subscriber hitting a Premium-only gate is already paying — the
  // pitch is an upgrade, not a first subscription, and it names the real
  // recurring price rather than a trial (they've already had theirs).
  const isPlusUpgrade = premium && tier === "plus";
  return (
    <button type="button" onClick={open} className={className ?? GOLD}>
      {children ?? (
        isPlusUpgrade ? (
          <>
            Upgrade to Premium{PREMIUM_PRICE_LABEL ? <span className="font-semibold opacity-80"> · {PREMIUM_PRICE_LABEL}</span> : null}
          </>
        ) : trialEligible && trialDays > 0 ? (
          <>
            Start free trial<span className="font-semibold opacity-80"> · {premiumZeroToday()}</span>
          </>
        ) : (
          <>
            Upgrade now{PREMIUM_PRICE_LABEL ? <span className="font-semibold opacity-80"> · {PREMIUM_PRICE_LABEL}</span> : null}
          </>
        )
      )}
    </button>
  );
}
