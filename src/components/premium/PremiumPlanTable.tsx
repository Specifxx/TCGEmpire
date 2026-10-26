import { PremiumCta } from "@/components/PremiumCta";
import { PremiumTicks, TICK_ROWS } from "@/components/PremiumTicks";
import {
  INTRO_MONTHS,
  PREMIUM_PRICE_PERIOD,
  annualSavingPct,
  introOfferEnabled,
  introPriceLine,
  premiumEffectiveMonthly,
  tierAnnualAmount,
  tierIntroMonthlyAmount,
  tierMonthlyAmount,
} from "@/lib/site";

// /premium, ONE TABLE (2026-10-25, owner: "way too much going on … we just need
// a price comparison table at the very top … an annual and monthly plan table,
// and then the comparison between features, and that's it"). DECISIONS.md,
// "/premium is one plan table and one comparison".
//
// The two ways to pay for Premium side by side, each with its own button (the
// page's only buttons), then Free vs Premium. The trial is said once, in the
// button's own small print (PremiumCta: what is charged today and when), never
// again under the price. No toggle: with two cards the
// choice IS the table, and both prices are visible at once. Annual is lit, as
// the better deal; every number comes from lib/site.ts, the same helpers the
// checkout charges from. A server component: PremiumCta and PremiumTicks are
// self-contained.

export interface PremiumPlanTableProps {
  annualLive: boolean;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
  trialFeeCents: number;
  introEligible: boolean;
  /** The comparison's headline rows; the rest sit under "Every other feature". */
  tickRows: string[];
}

export function PremiumPlanTable(p: PremiumPlanTableProps) {
  const monthly = tierMonthlyAmount("premium");
  const annual = tierAnnualAmount("premium");
  const perMonth = premiumEffectiveMonthly("premium");
  const save = annualSavingPct("premium");
  const intro = introOfferEnabled() && p.introEligible;
  const cta = { checkoutLive: p.checkoutLive, signedIn: p.signedIn, trialEligible: p.trialEligible, trialAvailable: p.trialAvailable, trialDays: p.trialDays, trialFeeCents: p.trialFeeCents, tier: "premium" as const };

  return (
    <div>
      <div className={`mx-auto grid gap-3 sm:gap-4 ${p.annualLive ? "max-w-3xl grid-cols-1 sm:grid-cols-2" : "max-w-sm grid-cols-1"}`} data-premium-plans>
        {p.annualLive && (
          <PlanCard
            best
            name="Annual"
            price={perMonth}
            unit="/mo"
            badge={save > 0 ? `Save ${save}%` : null}
            billing={`${annual} billed once a year`}
          >
            <PremiumCta {...cta} compact plan="annual" priceLabel={`${annual}/yr`} />
          </PlanCard>
        )}
        <PlanCard
          name="Monthly"
          price={monthly}
          unit={`/${PREMIUM_PRICE_PERIOD === "month" ? "mo" : PREMIUM_PRICE_PERIOD}`}
          badge={null}
          billing={intro ? `First ${INTRO_MONTHS} months ${tierIntroMonthlyAmount("premium")}/mo, half price` : "Billed monthly"}

        >
          <PremiumCta {...cta} compact plan="monthly" priceLabel={intro ? introPriceLine("premium") : `${monthly}/${PREMIUM_PRICE_PERIOD}`} />
        </PlanCard>
      </div>

      <section aria-labelledby="premium-compare" className="mx-auto mt-10 max-w-3xl">
        <h2 id="premium-compare" className="mb-3 text-center font-display text-xl font-extrabold text-white sm:text-2xl">
          Free vs Pro
        </h2>
        <PremiumTicks showPlus={false} prices={{ plus: "", premium: `${p.annualLive ? perMonth : monthly}/mo` }} selected="premium" only={p.tickRows} />
        <details className="mt-2">
          <summary className="mx-auto w-fit cursor-pointer rounded px-2 py-1 text-center text-xs font-semibold text-brand-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
            Every other feature and limit
          </summary>
          <div className="mt-2">
            <PremiumTicks
              showPlus={false}
              prices={{ plus: "", premium: `${p.annualLive ? perMonth : monthly}/mo` }}
              selected="premium"
              only={TICK_ROWS.map((r) => r.name).filter((n) => !p.tickRows.includes(n))}
            />
          </div>
        </details>
      </section>
    </div>
  );
}

function PlanCard({
  best = false,
  name,
  price,
  unit,
  badge,
  billing,
  children,
}: {
  best?: boolean;
  name: string;
  price: string;
  unit: string;
  badge: string | null;
  billing: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative rounded-2xl p-[2px] ${best ? "plan-glow" : "bg-ink-700"}`} data-plan={name.toLowerCase()}>
      <div className={`relative flex h-full flex-col rounded-[14px] px-5 pb-5 pt-6 text-center ${best ? "bg-gradient-to-b from-[#2a2110] to-ink-950" : "bg-ink-900"}`}>
        {best && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-950 shadow-lg shadow-gold/30">
            Best value
          </span>
        )}
        <div className={`text-sm font-extrabold uppercase tracking-widest ${best ? "text-gold" : "text-slate-300"}`}>{name}</div>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          {/* lnum only: the tabular figures `num` sets also widen the decimal point at this size. */}
          <span className="text-5xl font-extrabold tracking-tight text-white [font-feature-settings:'lnum'_1]">{price}</span>
          <span className="text-base font-semibold text-slate-400">{unit}</span>
        </div>
        {badge && <span className="mx-auto mt-2 rounded-full bg-buy/15 px-2.5 py-0.5 text-xs font-extrabold text-up">{badge}</span>}
        <p className="mt-2 text-sm text-slate-300">{billing}</p>
        <div className="mt-auto pt-5">{children}</div>
      </div>
    </div>
  );
}
