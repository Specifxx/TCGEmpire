"use client";

import { usePremiumDialog } from "./PremiumDialog";
import { PREMIUM_PRICE_LABEL } from "@/lib/site";

// Opens the site-wide Premium dialog (one click to subscribe / start the trial),
// so gated features don't have to send the user off to /premium. Defaults to a gold
// "Upgrade now · $X/mo" button; pass `children` for custom text (e.g. the navbar
// "✦ Premium") and/or `className` to override the styling (e.g. a ghost variant).
const GOLD =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink-950 transition hover:brightness-110";

export function PremiumButton({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const { open } = usePremiumDialog();
  return (
    <button type="button" onClick={open} className={className ?? GOLD} aria-label={ariaLabel}>
      {children ?? (
        <>
          Upgrade now{PREMIUM_PRICE_LABEL ? <span className="font-semibold opacity-80"> · {PREMIUM_PRICE_LABEL}</span> : null}
        </>
      )}
    </button>
  );
}
