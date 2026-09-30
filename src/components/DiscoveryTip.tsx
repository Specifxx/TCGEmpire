"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/use-me";
import { PremiumButton } from "./PremiumButton";
import type { PremiumTierKey } from "@/lib/site";

// A ONE-LINE "DID YOU KNOW" ON THE PAGE WHERE A PAID FEATURE LIVES (2026-09-29,
// DECISIONS.md "Premium works while you're away").
//
// The owner's second ask was that every paid feature be discoverable by
// someone who has never used the site, "highly accessible to new users" —
// and the 2026-09-28 rule stands: no popups, no overlays, no gold header
// CTAs. So this is a sentence in the page's own flow, in plain words, with
// the same PremiumButton every gate uses (its surface names the placement,
// `tip:*` in lib/premium-surface.ts) and a Dismiss that is remembered in
// this browser. Nothing is rendered for a signed-out visitor (the in-page
// sign-up prompts, InlineSignupPrompt, sell them the free account), for a member who already has the
// tier, or while the session is unknown — so a cached page never flashes it.
//
// NOT a Dialog, NOT fixed, NOT portalled — tests/watches-discovery.test.ts
// pins that: it is inline, and only for signed-in non-members.
export function DiscoveryTip({
  id,
  surface,
  tier = "plus",
  children,
  cta = "See what it adds",
  className = "",
}: {
  /** Remembers the dismissal: localStorage "rc_tip:<id>". */
  id: string;
  /** The placement, a `tip:*` surface (lib/premium-surface.ts). */
  surface: string;
  /** The lowest tier that has the feature; the line hides for members at or above it. */
  tier?: PremiumTierKey;
  children: React.ReactNode;
  cta?: string;
  className?: string;
}) {
  const { user, loaded, premium, tier: mine } = useMe();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read: no flash
  const key = `rc_tip:${id}`;
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);
  if (!loaded || !user || dismissed) return null;
  const has = tier === "plus" ? premium : premium && mine === "premium";
  if (has) return null;
  return (
    <p
      data-discovery-tip={surface}
      role="note"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs leading-relaxed text-slate-300 ${className}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <PremiumButton tier={tier} surface={surface} className="text-xs font-semibold text-brand-300 hover:underline">
        {cta}
      </PremiumButton>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* not remembered — harmless */
          }
          setDismissed(true);
        }}
        className="text-[11px] text-slate-500 hover:text-slate-300"
        aria-label="Dismiss this tip"
      >
        Dismiss
      </button>
    </p>
  );
}
