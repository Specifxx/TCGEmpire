"use client";

import { useMemo, useState } from "react";
import { formatMoney, dollarsToCents } from "@/lib/format";
import {
  computeNetProceeds,
  MARKETPLACE_FEES,
  GRADING_TIERS,
  type Marketplace,
} from "@/lib/net-proceeds";
import { useCountry } from "./CountryProvider";

// Seller net-proceeds calculator. "This card is worth $X — what do I actually
// pocket after fees, postage and grading?" Fully client-side (pure arithmetic
// on public fee schedules); no data fetch. Prices in the visitor's market
// currency via CountryProvider.
export function NetProceeds({
  initialPriceCents,
  compact = false,
}: {
  initialPriceCents?: number | null;
  compact?: boolean;
}) {
  const { currency } = useCountry();
  const [priceStr, setPriceStr] = useState(
    initialPriceCents != null ? (initialPriceCents / 100).toFixed(2) : ""
  );
  const [marketplace, setMarketplace] = useState<Marketplace>("ebay");
  const [shipCharged, setShipCharged] = useState("0");
  const [shipCost, setShipCost] = useState("0");
  const [gradeTier, setGradeTier] = useState("none");

  const priceCents = dollarsToCents(priceStr || "0");

  const result = useMemo(
    () =>
      computeNetProceeds({
        salePriceCents: priceCents,
        currency,
        marketplace,
        shippingChargedCents: dollarsToCents(shipCharged || "0"),
        shippingCostCents: dollarsToCents(shipCost || "0"),
        gradingTierKey: gradeTier,
      }),
    [priceCents, currency, marketplace, shipCharged, shipCost, gradeTier]
  );

  const netColor =
    result.net <= 0 ? "text-red-400" : result.netPct >= 0.8 ? "text-emerald-400" : "text-white";
  const pctLabel = priceCents > 0 ? `${Math.round(result.netPct * 100)}% of sale price` : "";

  return (
    <div className="card-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sale price
          </span>
          <input
            inputMode="decimal"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            className="input"
            aria-label="Sale price"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selling on
          </span>
          <select
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value as Marketplace)}
            className="input"
            aria-label="Marketplace"
          >
            {MARKETPLACE_FEES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {!compact && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Postage buyer pays
              </span>
              <input
                inputMode="decimal"
                value={shipCharged}
                onChange={(e) => setShipCharged(e.target.value.replace(/[^0-9.]/g, ""))}
                className="input"
                aria-label="Postage charged to buyer"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your postage cost
              </span>
              <input
                inputMode="decimal"
                value={shipCost}
                onChange={(e) => setShipCost(e.target.value.replace(/[^0-9.]/g, ""))}
                className="input"
                aria-label="Your postage cost"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Grade it first?
              </span>
              <select
                value={gradeTier}
                onChange={(e) => setGradeTier(e.target.value)}
                className="input"
                aria-label="Grading tier"
              >
                {GRADING_TIERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* Result */}
      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">You&apos;d pocket</div>
            <div className={`num text-3xl font-extrabold ${netColor}`}>{formatMoney(result.net, currency)}</div>
            {pctLabel && <div className="mt-0.5 text-xs text-slate-500">{pctLabel}</div>}
          </div>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Sale price" value={formatMoney(result.gross, currency)} />
          <Row label={`${result.feeLabel} fees`} value={`− ${formatMoney(result.marketplaceFee, currency)}`} dim />
          {result.shippingCost > 0 && (
            <Row label="Your postage" value={`− ${formatMoney(result.shippingCost, currency)}`} dim />
          )}
          {result.gradingCost > 0 && (
            <Row label="Grading (est.)" value={`− ${formatMoney(result.gradingCost, currency)}`} dim />
          )}
        </dl>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        Estimate only. Fee rates are approximate public schedules and change; grading is billed in USD
        and shown converted at an indicative rate. Always confirm current fees with the marketplace.
      </p>
    </div>
  );
}

function Row({ label, value, dim = false }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`num ${dim ? "text-slate-400" : "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
