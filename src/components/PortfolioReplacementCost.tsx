"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import type { BasketPlan } from "@/lib/basket";
import { readPostagePrefs } from "@/lib/postage-prefs";
import { useCountry } from "./CountryProvider";

// "What would it cost to buy this collection again?" — the delivered answer.
//
// Asked for directly (feedback cmu24pck9, 2026-09-15): the headline value prices
// each card at the cheapest listing anywhere in the market, which is often one
// far-off store, and postage never appears. This runs the Best-Basket optimiser
// over the whole collection instead, so delivery is counted the way it is
// actually charged — once per store, free where the order clears a store's
// threshold — and shows the gap against the headline.
//
// BEHIND A BUTTON, not computed on load: the route it calls reads every in-stock
// listing for every card held, which is a much heavier query than the page's own
// (see the route's header, and the egress rules at the top of lib/db.ts).

interface Result {
  plan: BasketPlan;
  valuedCents: number;
  pricedHoldings: number;
  skippedHoldings: number;
  shipping?: { regionLabel: string | null; trackedOnly: boolean; measuredAt: string | null };
}

export function PortfolioReplacementCost({ currency }: { currency: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { country } = useCountry();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Delivery is priced the way Best Basket prices it: each store's measured
      // checkout rate, for the region the buyer picked there (remembered in
      // this browser); none picked = each store's highest regional rate.
      const prefs = readPostagePrefs(country);
      const q = new URLSearchParams();
      if (prefs.region) q.set("region", prefs.region);
      if (prefs.trackedOnly) q.set("tracked", "1");
      const res = await fetch(`/api/portfolio/replacement${q.toString() ? `?${q}` : ""}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't price your collection just now. Try again in a moment.");
        return;
      }
      setResult(data as Result);
      trackEvent("portfolio_replacement_priced", { holdings: (data as Result).pricedHoldings });
    } catch {
      setError("Couldn't reach the pricing service. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const plan = result?.plan;
  // The delivered total against what the same cards contribute to the headline.
  // Signed both ways on purpose: a collection of cheap cards costs far more to
  // replace than it is "worth", and saying so is the honest answer.
  const gapCents = result ? plan!.totalCents - result.valuedCents : 0;

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-white">📦 Replacement cost, delivered</h2>
        {result && (
          <button type="button" onClick={run} disabled={loading} className="btn-ghost text-xs">
            {loading ? "Pricing…" : "Re-price"}
          </button>
        )}
      </div>

      {!result && (
        <>
          <p className="mt-2 text-sm text-slate-400">
            Your collection value above is the cheapest <strong className="text-slate-200">item</strong> price for each card — postage
            isn&apos;t in it, and the cheapest copy is often one store on the other side of the country. This prices the whole collection
            the way you&apos;d actually buy it — <strong className="text-slate-200">delivery included</strong>, charged once per store and
            free where an order clears a store&apos;s threshold — by running the Best-Basket optimiser over everything you own.
          </p>
          <div className="mt-3">
            <button type="button" onClick={run} disabled={loading} className="btn-primary text-sm">
              {loading ? "Pricing…" : "Price with delivery →"}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {plan && result && (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cards" value={formatMoney(plan.itemsCents, currency)} />
            <Stat label="Delivery" value={formatMoney(plan.shippingCents, currency)} />
            <Stat label="Total delivered" value={formatMoney(plan.totalCents, currency)} cls="text-gold" />
            <Stat
              label="vs. listed value"
              value={`${gapCents >= 0 ? "+" : "−"}${formatMoney(Math.abs(gapCents), currency)}`}
              cls={gapCents >= 0 ? "text-brand-400" : "text-rose-400"}
            />
          </div>

          <p className="text-sm text-slate-400">
            Re-buying {plan.matchedCards} of your card{plan.matchedCards === 1 ? "" : "s"} today would take{" "}
            <strong className="text-slate-200">{plan.storeCount} store{plan.storeCount === 1 ? "" : "s"}</strong> and{" "}
            <strong className="text-slate-200">{formatMoney(plan.shippingCents, currency)}</strong> of postage.
            {plan.savedCents > 0 && (
              <>
                {" "}
                Consolidating onto those stores saves {formatMoney(plan.savedCents, currency)} against buying each card from its own
                cheapest shop ({plan.naiveStoreCount} orders).
              </>
            )}
          </p>

          {plan.stores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-1 font-semibold">Store</th>
                    <th className="pb-1 text-right font-semibold">Cards</th>
                    <th className="pb-1 text-right font-semibold">Subtotal</th>
                    <th className="pb-1 text-right font-semibold">Delivery</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {plan.stores.map((s) => (
                    <tr key={s.key} className="border-t border-ink-800">
                      <td className="py-1.5 font-semibold text-white">{s.name}</td>
                      <td className="py-1.5 text-right">{s.lines.reduce((n, l) => n + l.qty, 0)}</td>
                      <td className="py-1.5 text-right">{formatMoney(s.subtotalCents, currency)}</td>
                      <td className="py-1.5 text-right" title={s.postage?.label}>
                        {s.freeShipping ? (
                          <span className="text-brand-400">Free</span>
                        ) : (
                          <>
                            {s.postage?.basis === "estimate" ? "est. " : s.postage?.upTo ? "up to " : ""}
                            {formatMoney(s.shippingCents, currency)}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1.5 text-[11px] text-slate-600">
            <p>
              Replacement cost is what re-buying costs, not what your cards are worth — two different numbers, and normally this is the
              higher one. It can land lower: a card nothing stocks today isn&apos;t in the basket at all, though it still counts towards
              the value above. Stores also sell what they have, so a replacement is priced at the listed condition rather than yours — a
              played copy is valued above at its condition multiplier and replaced here at the shop&apos;s price.
            </p>
            <p>
              The split across stores is the best one the optimiser finds, not a proof of the cheapest possible — consolidating orders
              against free-shipping thresholds has no fast exact answer, so it lands close rather than provably first. Store listings
              only: eBay is left out because its postage is quoted per listing and isn&apos;t comparable with a store&apos;s per-order rate.
              Delivery is each store&apos;s own checkout rate for an order that size
              {result.shipping?.measuredAt ? `, measured ${result.shipping.measuredAt}` : ""}
              {result.shipping?.regionLabel
                ? ` for delivery to ${result.shipping.regionLabel}`
                : " — the highest rate any region pays (pick your region in Best Basket for exact rates)"}
              ; stores marked est. haven&apos;t been measured, and a store&apos;s checkout is final.
              {plan.excludedStores.length > 0 && (
                <>
                  {" "}
                  Left out because they don&apos;t post to you: {plan.excludedStores.map((x) => x.name).join(", ")}.
                </>
              )}
              {plan.unbuyable.length > 0 && (
                <>
                  {" "}
                  {plan.unbuyable.length} card{plan.unbuyable.length === 1 ? " is" : "s are"} not in stock at any tracked store right now
                  and {plan.unbuyable.length === 1 ? "is" : "are"} left out of the total.
                </>
              )}
              {result.skippedHoldings > 0 && (
                <>
                  {" "}
                  Priced on your {result.pricedHoldings} most valuable holdings; {result.skippedHoldings} cheaper{" "}
                  {result.skippedHoldings === 1 ? "one is" : "ones are"} not included.
                </>
              )}
            </p>
            <p>
              <Link href="/guides/how-much-is-your-riftbound-collection-worth" className="text-brand-400 hover:underline">
                Market, cash and replacement value — what each one means →
              </Link>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-extrabold ${cls ?? "text-white"}`}>{value}</div>
    </div>
  );
}
