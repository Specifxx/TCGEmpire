// Seller net-proceeds model. Everything a buyer sees is "what will this cost me
// delivered"; this is the missing other half — "if I SELL this, what do I
// actually pocket?" — after marketplace fees, payment processing, shipping and
// (optionally) the cost of grading it first.
//
// All money is integer cents in ONE market's currency (the caller passes the
// market; we never convert). Fee rates are PUBLIC, APPROXIMATE schedules as of
// 2026 — they shift, so we label outputs as estimates and keep the numbers here
// where they're easy to update. No external data dependency.

import { USD_TO } from "./fx";

export type Marketplace = "ebay" | "tcgplayer" | "cardmarket" | "private";

export interface MarketplaceFee {
  key: Marketplace;
  label: string;
  // Percentage fee taken on (item + shipping charged to buyer).
  feePct: number;
  // Fixed per-order fee in cents (of the seller's market currency, approx).
  fixedCents: number;
  note: string;
  // Which markets this venue is realistically used in (for sensible defaults).
  markets: string[];
}

// Approximate 2026 seller fee schedules. Sources: each marketplace's public fee
// pages. eBay/TCGplayer take the fee on shipping too; Cardmarket is commission
// only. "private" = local pickup / buylist / cash — no marketplace fee.
export const MARKETPLACE_FEES: MarketplaceFee[] = [
  {
    key: "ebay",
    label: "eBay",
    feePct: 0.132, // ~13.25% final value fee (category-dependent)
    fixedCents: 30, // ~$0.30 per order
    note: "≈13.25% final value fee + a fixed per-order fee, charged on item + postage.",
    markets: ["AU", "NZ", "US", "GB"],
  },
  {
    key: "tcgplayer",
    label: "TCGplayer",
    feePct: 0.1275, // ~10.25% commission + ~2.5% payment processing
    fixedCents: 30,
    note: "≈10.25% commission + payment processing, US-focused. Not available in AU/NZ.",
    markets: ["US"],
  },
  {
    key: "cardmarket",
    label: "Cardmarket",
    feePct: 0.05, // ~5% commission (EU)
    fixedCents: 0,
    note: "≈5% commission, Europe-focused (relevant for UK/EU sellers).",
    markets: ["GB"],
  },
  {
    key: "private",
    label: "Private / local sale",
    feePct: 0,
    fixedCents: 0,
    note: "Local pickup, a buylist or cash — no marketplace fee, but usually a lower price.",
    markets: ["AU", "NZ", "US", "GB"],
  },
];

// Approximate grading fees per card (USD, converted roughly to the seller's
// market for display honesty — these are indicative, not live). Tier value is
// the all-in cost you'd model as a deduction if you grade before selling.
export interface GradingTier {
  key: string;
  label: string;
  // Approx per-card cost in USD cents (grading is priced in USD by PSA/CGC).
  usdCents: number;
  note: string;
}

export const GRADING_TIERS: GradingTier[] = [
  { key: "none", label: "Don't grade — sell raw", usdCents: 0, note: "No grading cost." },
  { key: "value", label: "PSA Value (bulk)", usdCents: 1900, note: "≈US$19/card at bulk tiers; slowest turnaround." },
  { key: "regular", label: "PSA Regular", usdCents: 7500, note: "≈US$75/card; for cards worth a few hundred." },
  { key: "cgc", label: "CGC (mid tier)", usdCents: 2500, note: "≈US$25/card; a common CGC economy option." },
];

// Rough USD→local multipliers for showing grading cost in the seller's market are
// the shared USD_TO table (imported above); grading itself is billed in USD.

export interface NetProceedsInput {
  salePriceCents: number; // what the card sells for, in the market currency
  currency: string; // "AUD" | "NZD" | "USD" | "GBP"
  marketplace: Marketplace;
  shippingChargedCents?: number; // postage the buyer pays you (fees apply to it)
  shippingCostCents?: number; // what postage actually costs you to send
  gradingTierKey?: string; // from GRADING_TIERS; "none" default
}

export interface NetProceedsResult {
  gross: number; // sale price
  marketplaceFee: number; // % + fixed, on item + shipping charged
  shippingCost: number; // your real postage cost
  gradingCost: number; // grading cost in the market currency (est.)
  net: number; // what you actually pocket
  netPct: number; // net / gross (0..1), can be negative on cheap graded cards
  feeLabel: string;
}

export function computeNetProceeds(input: NetProceedsInput): NetProceedsResult {
  const fee = MARKETPLACE_FEES.find((f) => f.key === input.marketplace) ?? MARKETPLACE_FEES[0];
  const shipCharged = Math.max(0, input.shippingChargedCents ?? 0);
  const shipCost = Math.max(0, input.shippingCostCents ?? 0);
  const gross = Math.max(0, input.salePriceCents);

  const marketplaceFee = Math.round((gross + shipCharged) * fee.feePct) + fee.fixedCents;

  const tier = GRADING_TIERS.find((t) => t.key === (input.gradingTierKey ?? "none")) ?? GRADING_TIERS[0];
  const usdMult = USD_TO[input.currency] ?? 1;
  const gradingCost = Math.round(tier.usdCents * usdMult);

  // Net = (item + shipping the buyer paid) − fees − your real postage − grading.
  const net = gross + shipCharged - marketplaceFee - shipCost - gradingCost;
  const netPct = gross > 0 ? net / gross : 0;

  return {
    gross,
    marketplaceFee,
    shippingCost: shipCost,
    gradingCost,
    net,
    netPct,
    feeLabel: fee.label,
  };
}

// Default marketplace for a market (US → TCGplayer is common; else eBay).
export function defaultMarketplace(market: string): Marketplace {
  return market === "US" ? "ebay" : "ebay";
}
