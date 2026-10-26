"use client";

import { useState } from "react";
import { PremiumCta } from "@/components/PremiumCta";

// Monthly / Annual, one switch, one price, one button (2026-10-26, the
// Collectr-style Pro page; see ProLanding). Annual is selected first: it is the
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

export function ProPricePicker({ prices, cta, size = "hero" }: { prices: ProPriceFigures; cta: ProCtaProps; size?: "hero" | "card" }) {
  const [annual, setAnnual] = useState(prices.annualLive);
  const big = size === "hero" ? "text-6xl" : "text-5xl";
  return (
    <div data-pro-price={annual ? "annual" : "monthly"}>
      <div className="flex items-baseline gap-2">
        <span className={`${big} font-extrabold tracking-tight text-white [font-feature-settings:'lnum'_1]`}>{annual ? prices.perMonth : prices.monthly}</span>
        {annual && <span className="text-xl font-semibold text-slate-500 line-through decoration-2">{prices.monthly}</span>}
        <span className="text-base font-semibold text-slate-400">/mo</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {annual ? `Billed ${prices.annual} yearly · save ${prices.save}%` : prices.annualLive ? `Billed monthly · save ${prices.save}% with annual` : "Billed monthly"}
      </p>
      {prices.annualLive && (
        <div className="mt-4 flex items-center gap-3 text-sm font-semibold">
          <span className={annual ? "text-slate-400" : "text-white"}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Pay yearly"
            onClick={() => setAnnual((a) => !a)}
            className={`relative h-7 w-12 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${annual ? "bg-gold" : "bg-ink-700"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink-950 transition-all ${annual ? "left-6" : "left-1 bg-white"}`} />
          </button>
          <span className={annual ? "text-white" : "text-slate-400"}>Annual</span>
        </div>
      )}
      <div className="mt-5 max-w-md">
        <PremiumCta
          key={annual ? "annual" : "monthly"}
          {...cta}
          tier="premium"
          plan={annual ? "annual" : "monthly"}
          priceLabel={annual ? `${prices.annual}/year` : `${prices.monthly}/month`}
          compact
          gold
        />
      </div>
    </div>
  );
}
