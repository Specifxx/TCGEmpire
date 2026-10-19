"use client";

import { useMe } from "@/lib/use-me";
import { PremiumNavLink } from "./PremiumNavLink";

// THE HEADER'S PREMIUM CALL TO ACTION (2026-10-15, owner, with nine active
// subscribers and churn high: "premium … at the very top, in the header … catchy,
// like get premium … shiny … a gradient and shining, and when you hover over it
// … even more shiny … constantly catching your attention"). Reverses the
// 2026-09-28 rule that the header carry a plain "Pricing" link (DECISIONS.md,
// "Premium gets loud: no search limit, a sign-up card, a shiny header button").
//
// Who sees what, so a paying member is never sold what they already have:
//   - signed out, or a free account: the gold "Get Premium" (.premium-cta)
//   - Plus: the same button, "Upgrade" (Premium is the step up)
//   - Premium: a plain gold-text "Premium" link, no shine, no animation
// The server render (useMe not loaded yet) is the "Get Premium" button, which
// is what nearly every visitor sees, so there is no flash for them.
//
// `short` is the label where the row has no room for three words: the phone
// slot and the lg row (tests/mobile-header-fit.test.ts). From xl the inline
// search gives up the width and the full "Get Premium" shows.
// `full` (the homepage hero, 2026-10-19) always reads "✦ Get Premium": the hero
// has the room the header rows do not.
export function GetPremiumLink({
  className = "",
  surface,
  compact = false,
  full = false,
}: {
  className?: string;
  surface: string;
  compact?: boolean;
  full?: boolean;
}) {
  const { tier, loaded } = useMe();
  if (loaded && tier === "premium") {
    return (
      <PremiumNavLink surface={surface} className={`${className} font-semibold text-gold hover:bg-ink-800`}>
        Premium
      </PremiumNavLink>
    );
  }
  const upgrade = loaded && tier === "plus";
  return (
    <PremiumNavLink surface={surface} className={`premium-cta ${className}`} title={upgrade ? "Upgrade to Premium" : "Get Premium: every deal, price watches, ad-free"}>
      {/* One label span carries the gold text and its sheen (.premium-cta-label). */}
      <span className="premium-cta-label">
        <span aria-hidden="true" className={full ? "" : "hidden xl:inline"}>✦ </span>
        {upgrade ? (
          <span>Upgrade</span>
        ) : full ? (
          <span>Get Premium</span>
        ) : compact ? (
          <span>Premium</span>
        ) : (
          <>
            <span className="hidden xl:inline">Get Premium</span>
            <span className="xl:hidden">Premium</span>
          </>
        )}
      </span>
    </PremiumNavLink>
  );
}
