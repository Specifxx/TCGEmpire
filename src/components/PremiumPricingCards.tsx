"use client";

import { useState } from "react";
import Link from "next/link";
import { PremiumCta } from "./PremiumCta";
import {
  TIER_NAMES,
  tierMonthlyAmount,
  tierAnnualAmount,
  premiumEffectiveMonthly,
  annualSavingPct,
  PREMIUM_PRICE_PERIOD,
  type PremiumTierKey,
} from "@/lib/site";

// The /premium pricing section, rebuilt 2026-09-11 to match the layout at
// mtgstocks.com/go-premium (owner: "copy their formatting and pillars") —
// see DECISIONS.md for the full account. Three structural changes from the
// card grid this replaced:
//
//   1. ONE billing-cycle toggle above the cards, not a separate monthly card
//      and a separate annual card side by side. Every tier's price swaps
//      together when the visitor picks a cycle, the way a real pricing page
//      does it — the old layout effectively doubled the card count instead.
//   2. The headline number is always the REAL recurring price (or its
//      per-month equivalent under annual billing), never "$0". The trial is
//      still disclosed — honestly, and required by card-network rules — as
//      small print under the button, not the number the decision turns on.
//      "Maybe the $0 was a bad idea" was the owner's own call on this.
//   3. A plain tier-name button ("Get Plus", "Get Premium") instead of
//      "Start your N-day free trial" — same reasoning as (2).
//
// A CLIENT COMPONENT, not inline in page.tsx, because the toggle needs real
// state and page.tsx is a server component (it reads the session and Stripe).
// Every price shown here is computed from the same lib/site.ts helpers the
// rest of the funnel uses — no second hand-typed copy of a number that could
// drift the way PITCH_TOOLS's own header comment warns a duplicated list does.
export function PremiumPricingCards({
  plusLive,
  plusAnnualLive,
  annualLive,
  checkoutLive,
  signedIn,
  trialEligible,
  trialAvailable,
  trialDays,
}: {
  plusLive: boolean;
  plusAnnualLive: boolean;
  annualLive: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
}) {
  const anyAnnualLive = annualLive || (plusLive && plusAnnualLive);
  // Annual by default (2026-09-11, owner: "so the prices look cheaper at
  // initial glance") — this only works because the headline number under
  // MONTHLY IS THE DEFAULT AGAIN (2026-09-14). This defaulted to annual from
  // 2026-09-11 so the per-month figure would "look cheaper at initial glance",
  // and the per-month figure did get smaller — but the ASK got eight times
  // bigger, because both buy buttons carry the selected cycle. The live page
  // ended up offering nothing but a $79.99/year commitment, and the card's
  // trial line is suppressed in the annual branch (see PaidTierCard), so the
  // one genuinely zero-risk thing on offer stopped being visible at all.
  //
  // This is the rule the Premium DIALOG has followed the whole time, in its
  // own words: defaulting to annual shows a bigger number to someone who has
  // not decided to pay anything yet. The two surfaces now agree. Annual is one
  // tap away and keeps its "Save 33%" badge, which is where it belongs — an
  // upgrade for someone already sold, not the opening ask.
  //
  // A tier with no annual price of its own still falls back to monthly display
  // regardless of this default — see PaidTierCard's own effectiveCycle guard.
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const premiumSave = annualSavingPct("premium");
  const plusSave = annualSavingPct("plus");
  // The badge shows whichever live tier's saving is real — they're both ~33%
  // by design (DECISIONS.md), so this only ever differs while one tier's
  // annual price is configured and the other's isn't.
  const savePct = annualLive ? premiumSave : plusSave;

  return (
    <div>
      {anyAnnualLive && (
        <div
          role="tablist"
          aria-label="Billing cycle"
          className="mx-auto mt-6 flex max-w-md items-stretch gap-1.5 rounded-xl border border-ink-700 bg-ink-900/70 p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={`flex-1 rounded-lg px-3 py-2.5 text-center transition ${
              cycle === "annual" ? "bg-ink-800 shadow-sm" : "text-slate-400 hover:bg-ink-800/60"
            }`}
          >
            <span className="flex flex-wrap items-center justify-center gap-1.5 gap-y-0.5">
              <span className={`whitespace-nowrap text-sm font-bold ${cycle === "annual" ? "text-white" : "text-slate-300"}`}>Annual billing</span>
              {savePct > 0 && (
                <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-400">
                  Save {savePct}%
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500">One payment per year</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={`flex-1 rounded-lg px-3 py-2.5 text-center transition ${
              cycle === "monthly" ? "bg-ink-800 shadow-sm" : "text-slate-400 hover:bg-ink-800/60"
            }`}
          >
            <span className={`text-sm font-bold ${cycle === "monthly" ? "text-white" : "text-slate-300"}`}>Monthly billing</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">Cancel anytime</span>
          </button>
        </div>
      )}

      {/* From sm up each card is three subgrid rows (header, list, CTA) sharing
          tracks across the cards, so every header is one height, every list
          starts at one y and every button shares one top. Before (2026-09-23)
          the Free card's button sat ~100px below the paid ones at 1440
          (1069 vs 968/967) because each card's flex column sized on its own.
          sm:gap-y-0 because a subgrid inherits the parent's row gap, which
          would otherwise open gaps inside the cards. Phones keep the stacked
          flex column: every sm: class below is inert there. Without subgrid
          support the cards stack header/list/CTA in auto rows: unaligned,
          not broken. The toggle's "Annual billing" is whitespace-nowrap in a
          max-w-md bar: in max-w-sm it wrapped to two lines (40px) at every
          width, and on phones the Save pill now drops under the label. */}
      <div className={`mx-auto mt-6 grid gap-4 sm:gap-y-0 ${plusLive ? "max-w-4xl sm:grid-cols-3" : "max-w-2xl sm:grid-cols-2"}`}>
        <FreeCard signedIn={signedIn} />

        {plusLive && (
          <PaidTierCard
            tier="plus"
            tagline="The full lists, unlocked"
            features={PLUS_FEATURES}
            cycle={cycle}
            annualLiveForTier={plusAnnualLive}
            checkoutLive={checkoutLive}
            signedIn={signedIn}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={trialDays}
          />
        )}

        <PaidTierCard
          tier="premium"
          tagline={plusLive ? "Everything, including the pro tools" : "The full toolkit"}
          features={plusLive ? PREMIUM_FEATURES_ON_PLUS : PREMIUM_FEATURES_STANDALONE}
          highlight
          cycle={cycle}
          annualLiveForTier={annualLive}
          checkoutLive={checkoutLive}
          signedIn={signedIn}
          trialEligible={trialEligible}
          trialAvailable={trialAvailable}
          trialDays={trialDays}
        />
      </div>
    </div>
  );
}

const FREE_FEATURES = [
  "Unlimited price comparisons",
  "Deck builder, trade calculator & box EV",
  "Price alerts",
  "Portfolio tracker",
];
// "N-day" is a placeholder, substituted for the real PREMIUM_TRIAL_DAYS value
// by PaidTierCard below — this file can't import the server-only constant
// directly, and the real count arrives as the `trialDays` prop instead.
const PLUS_FEATURES = ["Everything free", "Full Deal Finder, Rising Cards & Rising Sealed lists", "N-day free trial"];
// Two different lists depending on whether Plus exists to build on top of —
// same reasoning TIER_COMPARISON's own header gives for keeping one row set
// rather than two near-duplicate copies of the feature list.
const PREMIUM_FEATURES_ON_PLUS = ["Everything in Plus", "Ad-free browsing", "Value Finder screener", "Bulk Pricer", "Best Basket optimiser", "Demand Finder", "N-day free trial"];
const PREMIUM_FEATURES_STANDALONE = [
  "Everything free",
  "Ad-free browsing",
  "Full Deal Finder, Rising Cards & Rising Sealed lists",
  "Value Finder, Bulk Pricer, Best Basket & Demand Finder",
  "N-day free trial",
];

function FreeCard({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="card-surface flex flex-col overflow-hidden rounded-2xl border border-ink-700 sm:row-span-3 sm:grid sm:grid-rows-subgrid">
      <div className="border-b border-ink-800 bg-ink-900 px-5 py-5 text-center">
        <div className="text-base font-extrabold text-white">Free account</div>
        <p className="mt-0.5 text-[11px] text-slate-500">Price comparison, always</p>
        <div className="mt-3 flex items-baseline justify-center gap-1">
          <span className="num text-3xl font-extrabold text-white">$0</span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-brand-400">Free forever</p>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-4 px-5 py-5 sm:contents">
        <ul className="space-y-2 text-left text-[13px] text-slate-300 sm:px-5 sm:pt-5">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 font-bold text-brand-400">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="sm:self-start sm:px-5 sm:pb-5 sm:pt-4">
          {signedIn ? (
            <div className="rounded-lg border border-ink-700 py-3 text-center text-sm text-slate-400">Included with your account</div>
          ) : (
            <Link href="/login?next=/premium" className="btn-ghost w-full py-3 text-center text-sm">
              Create a free account →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function PaidTierCard({
  tier,
  tagline,
  features,
  highlight = false,
  cycle,
  annualLiveForTier,
  checkoutLive,
  signedIn,
  trialEligible,
  trialAvailable,
  trialDays,
}: {
  tier: PremiumTierKey;
  tagline: string;
  features: string[];
  highlight?: boolean;
  cycle: "monthly" | "annual";
  annualLiveForTier: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
}) {
  // A tier whose OWN annual price isn't configured falls back to monthly
  // display even if the global toggle is on "annual" — priceIdFor() already
  // falls back the CHARGE the same way, so display and charge can never
  // disagree (showing "annual" framing while actually billing monthly would
  // be exactly the kind of claim this repo's honesty tests exist to catch).
  const effectiveCycle = cycle === "annual" && annualLiveForTier ? "annual" : "monthly";
  const monthlyAmount = tierMonthlyAmount(tier);
  const annualAmount = tierAnnualAmount(tier);
  const headline = effectiveCycle === "annual" ? premiumEffectiveMonthly(tier) || monthlyAmount : monthlyAmount;
  const priceLabel =
    effectiveCycle === "annual" ? `${annualAmount}/yr` : `${monthlyAmount}/${PREMIUM_PRICE_PERIOD}`;
  const features_ = features.map((f) => f.replace("N-day", `${trialDays}-day`));

  return (
    <div
      className={`card-surface relative flex flex-col overflow-hidden rounded-2xl sm:row-span-3 sm:grid sm:grid-rows-subgrid ${
        highlight ? "border-2 border-gold/60 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" : "border border-ink-700"
      }`}
    >
      {highlight && (
        <span className="absolute right-0 top-0 rounded-bl-lg bg-gold px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-950">
          Recommended
        </span>
      )}
      <div className={`border-b border-ink-800 px-5 py-5 text-center ${highlight ? "bg-gold/10" : "bg-ink-900"}`}>
        <div className={`text-base font-extrabold ${highlight ? "text-gold" : "text-white"}`}>{TIER_NAMES[tier]}</div>
        <p className="mt-0.5 text-[11px] text-slate-500">{tagline}</p>
        <div className="mt-3 flex items-baseline justify-center gap-1">
          <span className="num text-3xl font-extrabold text-white">{headline}</span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        {/* The trial survives BOTH cycles. This used to be an either/or, so
            selecting annual replaced "14-day free trial" with "Billed as
            $79.99/year" — the strongest and the scariest line on the card
            traded for one another. They are not alternatives: the trial is
            what happens today, the billing line is what happens in 14 days. */}
        {effectiveCycle === "annual" && (
          <p className="mt-1 text-[11px] font-semibold text-brand-400">Billed as {annualAmount}/year</p>
        )}
        {trialAvailable && trialDays > 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">{trialDays}-day free trial</p>
        ) : effectiveCycle === "annual" ? null : (
          <p className="mt-1 text-[11px] text-slate-500">&nbsp;</p>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-4 px-5 py-5 sm:contents">
        <ul className="space-y-2 text-left text-[13px] text-slate-300 sm:px-5 sm:pt-5">
          {features_.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className={`mt-0.5 font-bold ${highlight ? "text-gold" : "text-brand-400"}`}>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="sm:self-start sm:px-5 sm:pb-5 sm:pt-4">
          <PremiumCta
            checkoutLive={checkoutLive}
            signedIn={signedIn}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            priceLabel={priceLabel}
            trialDays={trialDays}
            plan={effectiveCycle}
            tier={tier}
          />
        </div>
      </div>
    </div>
  );
}
