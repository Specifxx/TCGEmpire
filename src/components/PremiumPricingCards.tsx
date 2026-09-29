"use client";

import { useState } from "react";
import { PremiumCta } from "./PremiumCta";
import {
  TIER_NAMES,
  tierMonthlyAmount,
  tierAnnualAmount,
  premiumEffectiveMonthly,
  annualSavingPct,
  PREMIUM_PRICE_PERIOD,
  tierIntroMonthlyAmount,
  introOfferEnabled,
  introPriceLine,
  INTRO_MONTHS,
  type PremiumTierKey,
} from "@/lib/site";
import { DECK_WATCH_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";

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
// PLANS FIRST (2026-09-29, owner: "way too wordy now and the buttons to get
// premium are at the bottom of the page and you have to scroll"). The cards are
// the first thing under the hero, TWO across at every width (a phone gets two
// narrow columns, not two stacked cards, so both buy buttons sit inside a
// 390x844 first screen), each with a name, the real price, ONE tagline, four
// bullets of a few words, and the button. The Free card is gone: what is free is
// the first group of the page's "What you get" list, and the cards sell only
// what is bought. Everything else on those cards (the monthly default, the
// real price, the trial and intro lines behind their switches) is unchanged.
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
  introEligible = true,
}: {
  plusLive: boolean;
  plusAnnualLive: boolean;
  annualLive: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
  /** Would checkout attach the half-price intro (never paid)? lib/premium.ts introEligibleFor. */
  introEligible?: boolean;
}) {
  const anyAnnualLive = annualLive || (plusLive && plusAnnualLive);
  // MONTHLY IS THE DEFAULT (2026-09-14, reversing the annual default of
  // 2026-09-11). Annual was chosen so the per-month figure would "look cheaper
  // at initial glance", and the per-month figure did get smaller, but the ASK
  // got eight times bigger: both buy buttons carry the selected cycle, so the
  // page ended up offering nothing but a yearly commitment, and the trial line
  // was suppressed in the annual branch, so the one zero-risk thing on offer
  // stopped being visible at all. This is the rule the Premium DIALOG has
  // followed the whole time: defaulting to annual shows a bigger number to
  // someone who has not decided to pay anything yet. Annual is one tap away and
  // keeps its "Save 33%" badge, an upgrade for someone already sold.
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
          className="mx-auto flex max-w-sm items-stretch gap-1 rounded-xl border border-ink-700 bg-ink-900/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-center text-sm font-bold transition ${
              cycle === "monthly" ? "bg-ink-800 text-white shadow-sm" : "text-slate-400 hover:bg-ink-800/60"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={`flex min-h-11 flex-1 flex-wrap items-center justify-center gap-x-1.5 rounded-lg px-3 text-center text-sm font-bold transition ${
              cycle === "annual" ? "bg-ink-800 text-white shadow-sm" : "text-slate-400 hover:bg-ink-800/60"
            }`}
          >
            <span className="whitespace-nowrap">Annual</span>
            {savePct > 0 && (
              <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-400">Save {savePct}%</span>
            )}
          </button>
        </div>
      )}

      {/* Two columns at every width: a phone gets two narrow cards side by
          side, so both buy buttons are on its first screen. Cards stretch to
          one height and each button sits at the bottom of its own card. */}
      <div className={`mx-auto mt-3 grid gap-2.5 sm:gap-4 ${plusLive ? "max-w-3xl grid-cols-2" : "max-w-sm grid-cols-1"}`}>
        {plusLive && (
          <PaidTierCard
            tier="plus"
            tagline="No ads, and price watches"
            features={PLUS_FEATURES}
            cycle={cycle}
            annualLiveForTier={plusAnnualLive}
            checkoutLive={checkoutLive}
            signedIn={signedIn}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={trialDays}
            introEligible={introEligible}
          />
        )}

        <PaidTierCard
          tier="premium"
          tagline={plusLive ? "Plans which stores to buy from" : "The full toolkit"}
          features={plusLive ? PREMIUM_FEATURES_ON_PLUS : PREMIUM_FEATURES_STANDALONE}
          highlight
          cycle={cycle}
          annualLiveForTier={annualLive}
          checkoutLive={checkoutLive}
          signedIn={signedIn}
          trialEligible={trialEligible}
          trialAvailable={trialAvailable}
          trialDays={trialDays}
          introEligible={introEligible}
        />
      </div>
    </div>
  );
}

// THE LINEUP — the same entitlements as TIER_COMPARISON's rows, in a few words
// each, four bullets a card (owner, 2026-09-29: "3–4 bullets of ≤8 words").
// Plus LEADS with "No ads on any page": it is the benefit a first-time payer
// understands without a tour, and every surface that describes Plus must say so
// (tests/ad-free-tier.test.ts). Every number is the enforced constant. The full
// list, feature by feature, is the page's "What you get" and the table.
//
// "N-day" is a placeholder, substituted for the real PREMIUM_TRIAL_DAYS value by
// PaidTierCard below — this file can't import the server-only constant
// directly, and the real count arrives as the `trialDays` prop instead. The
// row is dropped entirely when this viewer can't start a trial (TRIAL_ROW).
const TRIAL_ROW = "N-day free trial";
const PLUS_FEATURES = [
  "No ads on any page",
  "No watchlist or portfolio limit",
  `Target alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`,
  `Sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products`,
  "N-day free trial",
];
// Two different lists depending on whether Plus exists to build on top of —
// same reasoning TIER_COMPARISON's own header gives for keeping one row set
// rather than two near-duplicate copies of the feature list.
const PREMIUM_FEATURES_ON_PLUS = [
  "Everything in Plus, no ads",
  `Deck price watch on up to ${DECK_WATCH_LIMIT} lists`,
  "Store-by-store plan for any list",
  "Unlimited alerts and Demand Finder",
  "N-day free trial",
];
const PREMIUM_FEATURES_STANDALONE = [
  "No ads on any page",
  "No watchlist or portfolio limit",
  `Deck price watch on up to ${DECK_WATCH_LIMIT} lists`,
  "Unlimited alerts, sealed watches, Demand Finder",
  "Store-by-store plan for any list",
  "N-day free trial",
];

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
  introEligible,
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
  introEligible: boolean;
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
  // Intro offer (lib/site.ts): monthly only. The headline stays the REAL
  // recurring price (rule 2 above); the intro is its own line under it, and
  // the small print quotes the whole schedule.
  const intro = effectiveCycle === "monthly" && introOfferEnabled() && introEligible;
  const priceLabel =
    effectiveCycle === "annual" ? `${annualAmount}/yr` : intro ? introPriceLine(tier) : `${monthlyAmount}/${PREMIUM_PRICE_PERIOD}`;
  // The trial row is a claim about THIS viewer: someone who already used
  // their trial (or with trials switched off) must not be promised one.
  const features_ = features
    .filter((f) => f !== TRIAL_ROW || (trialAvailable && trialDays > 0))
    .map((f) => f.replace("N-day", `${trialDays}-day`));

  return (
    <div
      className={`card-surface relative flex flex-col overflow-hidden rounded-2xl ${
        highlight ? "border-2 border-gold/60 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" : "border border-ink-700"
      }`}
    >
      {highlight && (
        <span className="absolute right-0 top-0 hidden rounded-bl-lg bg-gold px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-950 sm:block">
          Recommended
        </span>
      )}
      <div className={`border-b border-ink-800 px-2.5 py-2.5 text-center sm:px-5 sm:py-4 ${highlight ? "bg-gold/10" : "bg-ink-900"}`}>
        <div className={`text-base font-extrabold ${highlight ? "text-gold" : "text-white"}`}>{TIER_NAMES[tier]}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="num text-2xl font-extrabold text-white sm:text-3xl">{headline}</span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{tagline}</p>
        {/* The trial survives BOTH cycles. This used to be an either/or, so
            selecting annual replaced "14-day free trial" with "Billed as
            $79.99/year" — the strongest and the scariest line on the card
            traded for one another. They are not alternatives: the trial is
            what happens today, the billing line is what happens in 14 days. */}
        {effectiveCycle === "annual" && (
          <p className="mt-0.5 text-[11px] font-semibold text-brand-400">Billed as {annualAmount}/year</p>
        )}
        {intro && (
          <p className="mt-1 text-[11px] font-semibold text-brand-400" data-intro-offer>
            First {INTRO_MONTHS} months {tierIntroMonthlyAmount(tier)}/mo — half price
          </p>
        )}
        {trialAvailable && trialDays > 0 && <p className="mt-1 text-[11px] text-slate-500">{trialDays}-day free trial</p>}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2.5 px-2.5 py-2.5 sm:px-5 sm:py-4">
        <ul className="space-y-1.5 text-left text-[12px] leading-snug text-slate-300 sm:text-[13px]">
          {features_.map((f) => (
            <li key={f} className="flex items-start gap-1.5 [font-feature-settings:'lnum'_1]">
              <span className={`font-bold ${highlight ? "text-gold" : "text-brand-400"}`}>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <PremiumCta
          compact
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
  );
}
