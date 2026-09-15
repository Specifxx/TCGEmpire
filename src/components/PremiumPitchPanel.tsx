// THE PREMIUM PITCH (REDESIGNED 2026-09-15, see DECISIONS.md). Replaces the
// owner's original comp — character art bleeding behind a dark scrim, the
// RiftCompare wordmark and a gold PREMIUM badge, a three-line headline, four
// icon rows, then the price and the real sign-in buttons — which shipped
// 2026-09-10 and, per the owner's own review, wasn't converting: "the
// thumbnail at the back with [the character] doesn't really mean anything."
// Two changes, both explicit product instructions:
//   1. The character art is GONE. Nothing in this panel's copy referred to
//      her, so a visitor had no reason to connect the art to the pitch — it
//      was decoration competing with the offer, not reinforcing it. Replaced
//      with the site's own identity (BrandLogo, the same mark the nav and
//      hero use) so the panel reads as RiftCompare's, not a stock character
//      card.
//   2. The four icon rows — a claim + an icon, no comparison — became the
//      real Free-vs-Premium tick/✗ table (TierComparisonTable, compact),
//      the same one PremiumDialog and /premium already show. "A very quick
//      comparison, ticks and X's, of what Premium can do vs a free account"
//      is a materially different ask from four persuasive sentences: it lets
//      a visitor SEE the gap rather than be told about it, in the same
//      vertical space, and it can never drift from the real entitlements the
//      way hand-written feature copy already had once (see the retired
//      FEATURES array's own history, still checked against TIER_COMPARISON
//      by tests/premium-pitch-panel.test.ts).
//
// THE LAYOUT'S OWN SHAPE — short eyebrow line, big brand-coloured headline,
// small trailing line — is UNCHANGED, along with the exact headline wording
// (see DECISIONS.md, "the headline changed 2026-09-14" — that decision
// stands; only the art and the feature block underneath it changed here).
//
// BUILT AS REAL MARKUP, STILL. The table renders from the same shared rows
// /premium and the dialog use, and the price still comes from the shared
// helpers in the caller — nothing here is a flattened image.
//
// showPlus is a PROP, not a session read: this file stays presentational (no
// session hook, no fetch — tests/ad-free-tier.test.ts pins that), so a caller
// that already reads live session state for its own reasons (both current
// callers do) passes premiumPlus down rather than this component reading it
// itself.
//
// Presentational only — no hooks, no fetch — so it renders inside the server
// tree or a client nudge alike.

import { BrandLogo } from "./BrandLogo";
import { TierComparisonTable } from "./TierComparisonTable";

export function PremiumPitchPanel({
  badge,
  showFeatures = true,
  showPlus = false,
}: {
  // The gold PREMIUM badge is passed in rather than declared here: both callers
  // are pinned by tests that read their OWN source for the badge's classes.
  badge?: React.ReactNode;
  // The signed-in nudge used to set this false to save space for its own
  // per-route contextual pitch — the compact tick/✗ table below replaced the
  // old four-row feature list specifically because it fits that same budget,
  // so both callers now pass true. Kept as a real prop (not hard-coded) in
  // case a future surface genuinely has no room for either.
  showFeatures?: boolean;
  // Whether to render the Plus column in the comparison table — pass the
  // caller's own premiumPlus (from its own session read) once Plus is
  // actually configured, same contract as TierComparisonTable's own showPlus.
  showPlus?: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-950 to-ink-950">
      {/* The site's own mark, not a stock character — bled large and faint off
          the top-right corner as a watermark, the same spot the retired
          artwork occupied. Wrapped rather than relying on BrandLogo's own
          aria-label: at this size and opacity it is pure decoration, and the
          real wordmark right below already identifies the brand for anyone
          using a screen reader. */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 opacity-[0.10]">
        <BrandLogo className="h-36 w-36" />
      </div>

      <div className="relative px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-6 w-6" />
          <span className="font-display text-base font-extrabold italic tracking-tight text-white">
            Rift<span className="text-brand-400">compare</span>
          </span>
        </div>
        {badge ? <div className="mt-1.5">{badge}</div> : null}
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Spend less on every order.
        </p>

        <h2 className="mt-2 font-display text-[22px] font-extrabold uppercase italic leading-[0.95] tracking-tight text-white">
          Never
          <br />
          <span className="text-[26px] text-brand-400">Overpay</span>
          <br />
          <span className="text-[13px] text-slate-300">for a Riftbound card</span>
        </h2>

        {showFeatures && (
          <div className="mt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Free vs Premium, at a glance
            </p>
            {/* Same compact table PremiumDialog and /premium already render —
                see TierComparisonTable's own header for why this can never be
                a second, hand-typed comparison. Its own overflow-x-auto wrapper
                is what actually solves "fit this on a phone": narrower than
                that, the table scrolls sideways inside this card rather than
                crushing every column, exactly as it already does inside
                PremiumDialog today. */}
            <div className="mt-1.5 overflow-hidden rounded-lg border border-ink-800 bg-ink-950/60">
              <TierComparisonTable compact showPlus={showPlus} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
