"use client";

import { usePremiumDialog } from "./PremiumDialog";

// Opens the site-wide Premium dialog (one click to subscribe / start the trial),
// so gated features don't have to send the user off to /premium. Drop it in wherever
// a "Get Premium" prompt is needed. Defaults to the gold Premium styling; pass
// `className` to override (e.g. a ghost variant).
const GOLD =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink-950 transition hover:brightness-110";

export function PremiumButton({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { open } = usePremiumDialog();
  return (
    <button type="button" onClick={open} className={className ?? GOLD}>
      {children ?? "Get Premium"}
    </button>
  );
}
