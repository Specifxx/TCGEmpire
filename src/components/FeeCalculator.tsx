"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCountry } from "@/components/CountryProvider";

// A net-proceeds calculator for selling Riftbound singles on a marketplace like
// TCGplayer or eBay. DELIBERATELY has no baked-in "current" commission or
// processing rate: both marketplaces run tiered, frequently-changing fee
// schedules (see /blog/tcgplayer-fees), and printing a specific percentage here
// that later goes stale would be worse than not printing one at all. Instead —
// same move as the Box EV calculator's "Riot has never published pull rates, so
// you supply the pack structure" — this asks the seller to type in their own
// current rate from their seller dashboard, and does the stacked-fee math for
// them from there. eBay's ~13.25% figure is offered as a starting point only
// because it's the same hedged ("commonly around") figure already published in
// that article, not a new claim.

type Marketplace = "tcgplayer" | "ebay" | "custom";

const PRESETS: Record<Marketplace, { label: string; commissionHint: string; processingPct: string; fixedFee: string }> = {
  tcgplayer: {
    label: "TCGplayer",
    commissionHint: "Tiered by seller plan — check your Seller Portal for your exact rate",
    processingPct: "2.9",
    fixedFee: "0.30",
  },
  ebay: {
    label: "eBay",
    commissionHint: "Commonly around 13.25% for trading cards — confirm your current rate",
    processingPct: "0",
    fixedFee: "0.30",
  },
  custom: {
    label: "Another marketplace",
    commissionHint: "Enter the marketplace's commission percentage",
    processingPct: "0",
    fixedFee: "0",
  },
};

function parseNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function FeeCalculator() {
  const { currency } = useCountry();
  const [marketplace, setMarketplace] = useState<Marketplace>("tcgplayer");
  const [itemPrice, setItemPrice] = useState("40.00");
  const [shippingCharged, setShippingCharged] = useState("1.00");
  const [shippingCost, setShippingCost] = useState("0.80");
  const [commissionPct, setCommissionPct] = useState("");
  const [processingPct, setProcessingPct] = useState(PRESETS.tcgplayer.processingPct);
  const [fixedFee, setFixedFee] = useState(PRESETS.tcgplayer.fixedFee);

  const preset = PRESETS[marketplace];

  const switchMarketplace = (m: Marketplace) => {
    setMarketplace(m);
    // Only the fields with a defensible default carry over — commission is
    // never pre-filled (see the note above), so it's always the seller's own
    // number, not a leftover from whichever marketplace they clicked first.
    setProcessingPct(PRESETS[m].processingPct);
    setFixedFee(PRESETS[m].fixedFee);
    setCommissionPct("");
  };

  const calc = useMemo(() => {
    const price = parseNum(itemPrice);
    const shipCharged = parseNum(shippingCharged);
    const shipCost = parseNum(shippingCost);
    const commission = (parseNum(commissionPct) / 100) * price;
    const processing = (parseNum(processingPct) / 100) * (price + shipCharged) + parseNum(fixedFee);
    const totalCollected = price + shipCharged;
    const totalFees = commission + processing;
    const net = totalCollected - totalFees - shipCost;
    const effectiveFeePct = price > 0 ? ((totalFees + shipCost) / price) * 100 : 0;
    return { price, shipCharged, shipCost, commission, processing, totalCollected, totalFees, net, effectiveFeePct };
  }, [itemPrice, shippingCharged, shippingCost, commissionPct, processingPct, fixedFee]);

  const money = (n: number) => `${currency === "USD" ? "$" : currency + " "}${n.toFixed(2)}`;

  return (
    <div className="space-y-4">
      <div className="card-surface p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as Marketplace[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMarketplace(m)}
              className={`chip transition-colors ${
                marketplace === m ? "bg-brand-500 text-ink-950" : "bg-ink-800 text-slate-300 hover:bg-ink-700"
              }`}
            >
              {PRESETS[m].label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Sale price</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Shipping charged to buyer</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shippingCharged}
              onChange={(e) => setShippingCharged(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Your actual shipping cost</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Commission %</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
            <span className="mt-1 block text-xs text-slate-500">{preset.commissionHint}</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Payment processing %</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={processingPct}
              onChange={(e) => setProcessingPct(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
            <span className="mt-1 block text-xs text-slate-500">Applied to item price + shipping charged</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Fixed fee per order</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fixedFee}
              onChange={(e) => setFixedFee(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-white"
            />
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-ink-800 bg-ink-900/60 p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your net payout</div>
          <div className="num font-display text-5xl font-extrabold leading-none text-white">{money(calc.net)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {calc.effectiveFeePct.toFixed(1)}% of the sale price went to fees and your own shipping cost
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-ink-800 sm:grid-cols-4">
          {[
            ["Collected", calc.totalCollected],
            ["Commission", -calc.commission],
            ["Processing", -calc.processing],
            ["Your shipping", -calc.shipCost],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-ink-900 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="num mt-1 text-lg font-bold text-white">{money(value as number)}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Fee rates and tiers change — this calculator does the stacked-fee math, but always confirm your current
        commission and processing rate on the marketplace itself before you price a listing. See{" "}
        <Link href="/blog/tcgplayer-fees" className="text-brand-400 hover:underline">
          how TCGplayer fees actually stack
        </Link>{" "}
        for the full breakdown, or{" "}
        <Link href="/browse" className="text-brand-400 hover:underline">
          check the going market price
        </Link>{" "}
        before you list.
      </p>
    </div>
  );
}
