"use client";

import { useState } from "react";
import { PremiumCta } from "./PremiumCta";
import { PremiumTicks } from "./PremiumTicks";
import { planBullets, planTagline } from "@/lib/premium-plan-copy";
import {
  TIER_NAMES,
  tierMonthlyAmount,
  tierAnnualAmount,
  premiumEffectiveMonthly,
  trialThenLine,
  annualSavingPct,
  PREMIUM_PRICE_PERIOD,
  tierIntroMonthlyAmount,
  introOfferEnabled,
  introPriceLine,
  INTRO_MONTHS,
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
//   (2026-09-30, the $1 first month: the headline is STILL the real recurring
//   price. What changed is one line under it, "First 30 days for $1, then
//   $2.99/mo", and the button of a viewer who would get the trial, which reads
//   "Start 30 days for $1". Both are shown only where checkout would really
//   charge $1: signed out, or an account with no trialStartedAt.)
//
// PLANS FIRST (2026-09-29, owner: "way too wordy now and the buttons to get
// premium are at the bottom of the page and you have to scroll"). The cards are
// the first thing under the hero, TWO across at every width (a phone gets two
// narrow columns, not two stacked cards, so both buy buttons sit inside a
// 390x844 first screen), each with a name, the real price, ONE tagline and the
// button. The Free card is gone: the cards sell only what is bought.
// (2026-10-17: the four bullets went too, and the ticks table now sits under
// the cards inside this component, so the toggle drives its prices. DECISIONS.md,
// "/premium, 70% simpler".)
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
  trialFeeCents,
  introEligible = true,
  market = "AU",
  afterCards = null,
}: {
  plusLive: boolean;
  plusAnnualLive: boolean;
  annualLive: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
  /** What the trial costs today, in cents (PREMIUM_TRIAL_FEE_CENTS), from the server page. */
  trialFeeCents: number;
  /** Would checkout attach the half-price intro (never paid)? lib/premium.ts introEligibleFor. */
  introEligible?: boolean;
  /** The visitor's market (lib/get-country.ts): US leads with alerts, the rest with Best Basket. */
  market?: string;
  /** Server-rendered lines that belong right under the cards (the no-card options). */
  afterCards?: React.ReactNode;
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
  //
  // ANNUAL IS THE DEFAULT AGAIN (2026-10-22, owner: "Default the billing toggle
  // to Annual. Show per-month equivalents and Save 33%"). The trial line still
  // shows under each card in the annual branch (it was the 2026-09-14 worry), so
  // the zero-cost first step stays visible; monthly is one tap away.
  // DECISIONS.md, "/premium shows each plan's real limits".
  const [cycle, setCycle] = useState<"monthly" | "annual">(anyAnnualLive ? "annual" : "monthly");
  // The picked plan lights its card and its column in the ticks table below.
  // Premium by default: it is the recommended plan.
  const [picked, setPicked] = useState<PremiumTierKey>("premium");
  const shownMonthly = (tier: PremiumTierKey, live: boolean) =>
    `${cycle === "annual" && live ? premiumEffectiveMonthly(tier) || tierMonthlyAmount(tier) : tierMonthlyAmount(tier)}/mo`;
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
              <span className="rounded-full bg-buy/15 px-1.5 py-0.5 text-[10px] font-extrabold text-up">Save {savePct}%</span>
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
            tagline={planTagline("plus", market)}
            bullets={planBullets("plus", market)}
            picked={picked === "plus"}
            onPick={() => setPicked("plus")}
            cycle={cycle}
            annualLiveForTier={plusAnnualLive}
            checkoutLive={checkoutLive}
            signedIn={signedIn}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={trialDays}
            trialFeeCents={trialFeeCents}
            introEligible={introEligible}
          />
        )}

        <PaidTierCard
          tier="premium"
          tagline={plusLive ? planTagline("premium", market) : "The full toolkit"}
          bullets={planBullets("premium", market)}
          highlight
          picked={picked === "premium"}
          onPick={() => setPicked("premium")}
          cycle={cycle}
          annualLiveForTier={annualLive}
          checkoutLive={checkoutLive}
          signedIn={signedIn}
          trialEligible={trialEligible}
          trialAvailable={trialAvailable}
          trialDays={trialDays}
          trialFeeCents={trialFeeCents}
          introEligible={introEligible}
        />
      </div>

      {afterCards}

      {/* The comparison, ticks and crosses only (PremiumTicks' own header). Its
          prices follow the Monthly / Annual toggle and its lit column follows
          the picked card; tapping a column header picks that plan. */}
      <div className="mx-auto mt-5 max-w-3xl">
        <PremiumTicks
          showPlus={plusLive}
          prices={{ plus: shownMonthly("plus", plusAnnualLive), premium: shownMonthly("premium", annualLive) }}
          selected={picked}
          onSelect={(t) => t !== "free" && setPicked(t)}
        />
      </div>
    </div>
  );
}

// FOUR BULLETS ON EACH CARD AGAIN (2026-10-22, owner), reversing 2026-10-17's
// "no bullets": a card is the plan's name, its real price (per month under
// annual), one tagline, three or four bullets saying what the plan is FOR
// (lib/premium-plan-copy.ts, from the same limit constants as the table), the
// trial or intro line where it applies, and the button. The table below still
// carries every limit.
function PaidTierCard({
  tier,
  tagline,
  bullets = [],
  highlight = false,
  picked,
  onPick,
  cycle,
  annualLiveForTier,
  checkoutLive,
  signedIn,
  trialEligible,
  trialAvailable,
  trialDays,
  trialFeeCents,
  introEligible,
}: {
  tier: PremiumTierKey;
  tagline: string;
  bullets?: string[];
  highlight?: boolean;
  picked: boolean;
  onPick: () => void;
  cycle: "monthly" | "annual";
  annualLiveForTier: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
  trialFeeCents: number;
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
  // The trial line is a claim about THIS viewer: someone who already used their
  // trial (or with trials switched off) must not be promised one.
  const showTrial = trialAvailable && trialDays > 0;

  return (
    <div
      onClick={onPick}
      className={`card-surface relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 transition ${highlight ? "bg-gold/[0.06]" : ""} ${
        picked
          ? highlight
            ? "border-gold/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            : "border-brand-500/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          : "border-ink-700 opacity-90 hover:opacity-100"
      }`}
    >
      {highlight && (
        <span className="absolute right-0 top-0 rounded-bl-lg bg-gold px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-ink-950 sm:px-2 sm:text-[9px]">
          Most features
        </span>
      )}
      <div className="px-2.5 pb-1 pt-4 text-center sm:px-5 sm:pt-5">
        <div className={`text-base font-extrabold ${highlight ? "text-gold" : "text-white"}`}>{TIER_NAMES[tier]}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="num text-2xl font-extrabold text-white sm:text-3xl">{headline}</span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-300 sm:text-xs">{tagline}</p>
        {bullets.length > 0 && (
          <ul className="mx-auto mt-2 space-y-1 text-left text-[11px] leading-snug text-slate-300 sm:max-w-[16rem] sm:text-xs" data-plan-bullets>
            {bullets.map((b) => (
              <li key={b} className="flex gap-1.5">
                <span aria-hidden className={highlight ? "text-gold" : "text-brand-400"}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {/* The trial survives BOTH cycles. This used to be an either/or, so
            selecting annual replaced the trial line with "Billed as
            $79.99/year" — the strongest and the scariest line on the card
            traded for one another. They are not alternatives: the trial is
            what happens today, the billing line is what happens after it. With a
            trial the ONE line below states both ("First 30 days for $1, then
            $23.99/yr"), so "Billed as" is dropped rather than said twice. */}
        {effectiveCycle === "annual" && !showTrial && (
          <p className="mt-0.5 text-[11px] font-semibold text-brand-400">Billed as {annualAmount}/year</p>
        )}
        {intro && (
          <p className="mt-1 text-[11px] font-semibold text-brand-400" data-intro-offer>
            First {INTRO_MONTHS} months {tierIntroMonthlyAmount(tier)}/mo — half price
          </p>
        )}
        {showTrial && (
          <p className="mt-1 text-[11px] font-semibold text-slate-300" data-trial-offer>
            {trialThenLine(trialDays, trialFeeCents, effectiveCycle === "annual" ? `${annualAmount}/yr` : `${monthlyAmount}/mo`)}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-end px-2.5 py-2.5 sm:px-5 sm:py-4">
        <PremiumCta
          compact
          checkoutLive={checkoutLive}
          signedIn={signedIn}
          trialEligible={trialEligible}
          trialAvailable={trialAvailable}
          priceLabel={priceLabel}
          trialDays={trialDays}
          trialFeeCents={trialFeeCents}
          plan={effectiveCycle}
          tier={tier}
        />
      </div>
    </div>
  );
}
