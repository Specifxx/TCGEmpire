"use client";

import Link from "next/link";
import { PremiumButton } from "@/components/PremiumButton";
import { useMe } from "@/lib/use-me";
import { TIER_NAMES } from "@/lib/site";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";

// Client island for the (static, ISR) /movers page: turns its habitual price-checkers
// into the mouth of the paid funnel. Non-members see a teaser + a Plus button;
// members see quick links to their own tools. Kept client-side so /movers stays
// fully cacheable.
//
// 2026-09-25 lineup: the Value Finder this used to sell is gone (its /tools
// URL 301s to /movers itself), so the pitch is the two lists Plus unlocks —
// Deal Finder and Rising Cards — and the upgrade line for a Plus member is
// Best Basket. Membership reads useMe().premium, not usePremium(): that one
// answers "hide the ads?", a different question that only happens to agree
// today.
export function MoversToolsCta() {
  const { premium, tier, trialing, interval, premiumAnnual } = useMe();

  if (premium) {
    const isPlus = tier === "plus";
    return (
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold text-white">Your deal tools</h2>
        <p className="mt-1 text-sm text-slate-400">
          You&apos;re {TIER_NAMES[tier ?? "premium"]} — the full Deal Finder and Rising Cards lists are unlocked, and every
          page is ad-free.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/tools/deal-finder" className="btn-primary text-sm">
            Deal Finder →
          </Link>
          <Link href="/tools/rising" className="btn-ghost text-sm">
            Rising Cards →
          </Link>
          {!isPlus && (
            <Link href="/tools/best-basket" className="btn-ghost text-sm">
              Best Basket →
            </Link>
          )}
        </div>
        {/* Not mid-trial: the upgrade route handles paid subscriptions only. */}
        {isPlus && !trialing && (
          <p className="mt-2 text-xs text-slate-500">
            Buying a whole deck? Best Basket&apos;s store-by-store plan is on Premium —{" "}
            <Link href="/premium#top-pricing" className="font-semibold text-gold hover:underline">
              upgrade for {planSwitchPriceLabel("premium", interval, premiumAnnual)}
            </Link>
            .
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="card-surface relative overflow-hidden p-5">
      <span className="chip absolute right-4 top-4 bg-slate-500/15 text-slate-200">Plus</span>
      <h2 className="text-lg font-bold text-white">Know what a card should cost</h2>
      <p className="mt-1 max-w-xl text-sm text-slate-400">
        Movers tell you a price changed. Plus tells you whether today&apos;s price is a good one: the{" "}
        <strong className="text-slate-200">Deal Finder</strong> lists every card cheaper than TCGplayer market at a real
        store, and <strong className="text-slate-200">Rising Cards</strong> ranks cards by demand and price-timing signals
        — the full lists, with no ads on any page.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PremiumButton surface="nudge:movers" tier="plus" />
        <Link href="/tools/deal-finder" className="btn-ghost text-sm">Preview Deal Finder →</Link>
        <Link href="/tools/rising" className="btn-ghost text-sm">Preview Rising Cards →</Link>
      </div>
    </section>
  );
}
