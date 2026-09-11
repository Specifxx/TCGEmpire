import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_ANNUAL_AMOUNT,
  PREMIUM_ANNUAL_PERIOD,
  annualSavingPct,
  premiumZeroAmount,
  premiumEffectiveMonthly,
  tierMonthlyAmount,
  tierAnnualAmount,
  type PremiumTierKey,
} from "@/lib/site";

// The shared "$0 due today" headline for a trial-eligible visitor — used
// wherever a pricing card or the Premium dialog currently leads with the
// full recurring price ($9.99) instead of what a trial-eligible visitor
// actually pays right now (nothing). Presentational only (no hooks), so it's
// usable in both the server /premium page and the client Premium dialog,
// exactly like AnnualPriceBlock.
//
// "$0" is the honest number ONLY alongside the real price and WHEN it starts
// — both render in the same block here, never split into a big "$0" with the
// real price buried elsewhere, which is what /premium and the dialog did
// before this (see DECISIONS.md, 2026-09-09).
export function TrialPriceBlock({
  plan,
  trialDays,
  size = "lg",
  tier = "premium",
}: {
  plan: "monthly" | "annual";
  trialDays: number;
  // "compact" (2026-09-10) exists so /premium's cards can put the CTA button
  // first: the owner's brief was that the biggest thing on the card should be
  // "start your 14-day free trial", not the price. At text-4xl this block was
  // out-shouting the button. The block itself is unchanged otherwise — the
  // "then $X after your N-day trial" line stays exactly where it is, for the
  // reason in this file's header.
  size?: "lg" | "sm" | "compact";
  // Which tier is being sold — defaults to "premium" (the only tier before
  // Plus existed), so the Premium branch below still reads the flat
  // PREMIUM_PRICE_AMOUNT/PREMIUM_ANNUAL_AMOUNT constants and the zero-arg
  // helpers directly, unchanged.
  tier?: PremiumTierKey;
}) {
  const big = size === "lg" ? "text-4xl" : size === "sm" ? "text-3xl" : "text-2xl";
  const dayPhrase = `${trialDays}-day`;
  const perMonth = tier === "plus" ? premiumEffectiveMonthly("plus") : premiumEffectiveMonthly();
  const save = tier === "plus" ? annualSavingPct("plus") : annualSavingPct();
  const monthlyAmount = tier === "plus" ? tierMonthlyAmount("plus") : PREMIUM_PRICE_AMOUNT;
  const annualAmount = tier === "plus" ? tierAnnualAmount("plus") : PREMIUM_ANNUAL_AMOUNT;

  return (
    <div className="text-center">
      <div className="flex items-baseline justify-center gap-1.5">
        <span className={`num ${big} font-extrabold text-white`}>{premiumZeroAmount()}</span>
        <span className="text-sm text-slate-400">due today</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        then{" "}
        <span className="font-semibold text-slate-200">
          {plan === "annual" ? `${annualAmount}/${PREMIUM_ANNUAL_PERIOD}` : `${monthlyAmount}/${PREMIUM_PRICE_PERIOD}`}
        </span>{" "}
        {plan === "annual" && perMonth && <span className="text-slate-400">(≈ {perMonth}/mo) </span>}
        after your {dayPhrase} free trial
      </p>
      {plan === "annual" && save > 0 && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-brand-500/15 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-400 ring-1 ring-brand-500/40 shadow-[0_0_14px_rgba(52,209,126,0.28)]">
          <span aria-hidden>▼</span> Save {save}%
        </span>
      )}
    </div>
  );
}
