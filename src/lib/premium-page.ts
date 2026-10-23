import { premiumMoneyNum, type PremiumTierKey, tierAnnualAmount, tierMonthlyAmount } from "./site";
import { convertCents } from "./fx";
import type { Deal } from "./top-deals";
import type { BasketResult } from "./basket";

// /premium's computed figures (2026-10-23, the conversion redesign; DECISIONS.md
// "/premium, rebuilt to convert, honestly"). Pure functions over data the page
// already has, so tests/premium-page.test.ts can hold every number to its
// source. Nothing here is typed by hand: the prices come from lib/site.ts (the
// same env-overridable display amounts the pricing cards read), the deals from
// getCachedTopDeals, the demo from lib/basket.ts's own planBasket.

/**
 * How many months of the monthly price the annual plan saves, to the nearest
 * whole month ($79.99 against 12 × $9.99 = $119.88: 3.99 → 4). 0 when either
 * price is missing or annual saves nothing. The page says "≈", since it is
 * rounded.
 */
export function annualMonthsFree(tier: PremiumTierKey = "premium"): number {
  const monthly = premiumMoneyNum(tierMonthlyAmount(tier));
  const annual = premiumMoneyNum(tierAnnualAmount(tier));
  if (!monthly || !annual) return 0;
  return Math.max(0, Math.round((monthly * 12 - annual) / monthly));
}

/** The monthly price in cents ($9.99 -> 999), from the configured display amount. */
export function monthlyPriceCents(tier: PremiumTierKey = "premium"): number {
  return Math.round(premiumMoneyNum(tierMonthlyAmount(tier)) * 100);
}

// The below-market deals the teaser may show: a real gap and a real price.
// A deal without an image still shows (the row reserves the image box).
export function teaserDeals(deals: readonly Deal[] | null | undefined, n = 3): Deal[] {
  return (deals ?? []).filter((d) => d.dealType === "savings-vs-market" && d.priceCents > 0 && (d.deltaCents ?? 0) > 0).slice(0, n);
}

export interface PaysForItself {
  /** Average gap below market across the deals, in the market's currency. */
  avgSavingCents: number;
  /** The monthly price converted into the market's currency (reference rate). */
  monthlyInMarketCents: number;
  dealCount: number;
}

/**
 * "Pays for itself": the average saving per card across today's top deals, but
 * ONLY when that average is above one month of Premium. The price is in US
 * dollars (PREMIUM_PRICE_AMOUNT); a non-US market's deals are in its own
 * currency, so the price is converted with the site's shared reference rates
 * (lib/fx.ts) before comparing. null means the line is not shown.
 */
export function paysForItself(deals: readonly Deal[], marketCurrency: string, priceUsdCents = monthlyPriceCents()): PaysForItself | null {
  const gaps = deals.map((d) => d.deltaCents ?? 0).filter((c) => c > 0);
  if (!gaps.length || priceUsdCents <= 0) return null;
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const monthlyInMarket = convertCents(priceUsdCents, "USD", marketCurrency);
  if (avg <= monthlyInMarket) return null;
  return { avgSavingCents: avg, monthlyInMarketCents: monthlyInMarket, dealCount: gaps.length };
}

// ── The "Try it free" savings demo ───────────────────────────────────────────
// A short list, priced by the real Best Basket solver (lib/basket.ts planBasket,
// called read-only by app/api/premium/demo). The answer is TOTALS only: the
// cheapest order from one store, the cheapest delivered split, and the gap.
// No store, line or link is in it; the store-by-store plan stays Premium's (and
// the free account's metered plans on /tools/best-basket).
export const DEMO_LINE_CAP = 10;
export const DEMO_QTY_CAP = 4;

export interface DemoAnswer {
  /** Cheapest delivered order, split across as many stores as it pays to. */
  splitCents: number;
  splitStores: number;
  /** Cheapest delivered order from ONE store that stocks every buyable card; null when none does. */
  singleStoreCents: number | null;
  /** singleStoreCents − splitCents, never below 0; null without a one-store order. */
  savedCents: number | null;
  covered: number;
  requested: number;
  unmatched: string[];
  /** Lines past DEMO_LINE_CAP that were not priced. */
  skippedLines: number;
}

export function demoAnswer(
  result: BasketResult,
  unmatched: { raw: string; qty: number }[],
  skippedLines: number
): DemoAnswer {
  const { plan, alternatives } = result;
  const unbuyable = plan.unbuyable.reduce((n, u) => n + u.qty, 0);
  const single = alternatives.singleStore && alternatives.singleStore.coveredCopies === plan.coveredCopies ? alternatives.singleStore.totalCents : null;
  return {
    splitCents: plan.totalCents,
    splitStores: plan.storeCount,
    singleStoreCents: single,
    savedCents: single == null ? null : Math.max(0, single - plan.totalCents),
    covered: plan.coveredCopies,
    requested: plan.coveredCopies + unbuyable + unmatched.reduce((n, u) => n + u.qty, 0),
    unmatched: unmatched.map((u) => u.raw).slice(0, DEMO_LINE_CAP),
    skippedLines,
  };
}
