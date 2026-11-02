"use client";

import { useState } from "react";
import { PremiumCta } from "@/components/PremiumCta";

// Monthly / Annual, a segmented control, one price, one button (2026-10-26;
// restyled in the site's theme 2026-11-02, see ProLanding). Annual is selected first: it is the
// price the page leads with ("$3.99/mo"), with the monthly price struck beside
// it. Every figure arrives from the server page, computed from lib/site.ts.

export interface ProPriceFigures {
  monthly: string; // "$6.99"
  annual: string; // "$47.88"
  perMonth: string; // "$3.99"
  save: number; // 43
  annualLive: boolean;
}

export interface ProCtaProps {
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
  trialFeeCents: number;
}

export function ProPricePicker({ prices, cta }: { prices: ProPriceFigures; cta: ProCtaProps }) {
  const [annual, setAnnual] = useState(prices.annualLive);
  const opt = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
      on ? "bg-ink-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
    }`;
  return (
    <div data-pro-price={annual ? "annual" : "monthly"}>
      {prices.annualLive && (
        <div role="radiogroup" aria-label="Billing period" className="mb-5 flex gap-1 rounded-md border border-ink-700 bg-ink-950 p-1">
          <button type="button" role="radio" aria-checked={!annual} onClick={() => setAnnual(false)} className={opt(!annual)}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={annual} onClick={() => setAnnual(true)} className={opt(annual)}>
            Annual
            <span className="rounded bg-buy/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-emerald-300">Save {prices.save}%</span>
          </button>
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums tracking-tight text-white">{annual ? prices.perMonth : prices.monthly}</span>
        <span className="text-sm font-medium text-slate-400">USD / month</span>
        {annual && <span className="ml-auto text-sm tabular-nums text-slate-500 line-through">{prices.monthly}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {annual ? `${prices.annual} billed once a year` : prices.annualLive ? `Billed monthly · save ${prices.save}% with annual` : "Billed monthly"}
      </p>
      <div className="mt-5">
        <PremiumCta
          key={annual ? "annual" : "monthly"}
          {...cta}
          tier="premium"
          plan={annual ? "annual" : "monthly"}
          priceLabel={annual ? `${prices.annual}/year` : `${prices.monthly}/month`}
          compact
          pro
        />
      </div>
    </div>
  );
}
