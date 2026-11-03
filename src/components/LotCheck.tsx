"use client";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { lotVerdict, parseAskCents } from "@/lib/lot-check";
import { ebaySearchUrl } from "@/lib/affiliate";
import { OutboundLink } from "./OutboundLink";

// The lot checker under the deck pricer's total (lib/lot-check.ts). Compares an
// asking price for a lot against the singles total of the cards matched in it.
export function LotCheck({ country, singlesCents, pricedQty, totalQty }: { country: Country; singlesCents: number; pricedQty: number; totalQty: number }) {
  const [ask, setAsk] = useState("");
  const currency = COUNTRIES[country].currency;
  const money = (c: number) => formatMoney(c, currency);
  const askCents = parseAskCents(ask);
  const v = askCents != null ? lotVerdict(askCents, singlesCents) : null;
  return (
    <div className="card-surface p-4" data-lot-check>
      <label htmlFor="lot-ask" className="block text-sm font-semibold text-white">
        Buying a lot? Check it against singles
      </label>
      <p className="mt-0.5 text-xs text-slate-400">Paste the cards in the lot above, then type its asking price including postage.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm text-slate-300">
          {currency}
          <input
            id="lot-ask"
            inputMode="decimal"
            autoComplete="off"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="0.00"
            className="w-28 rounded-lg border border-ink-600 bg-ink-900 px-2 py-1.5 text-white"
          />
        </span>
        {v && (
          <p className="text-sm" role="status">
            {v.kind === "cheaper" ? (
              <span className="font-semibold text-emerald-400">
                {money(v.diffCents)} ({v.pct}%) less than buying these {pricedQty} cards as singles ({money(singlesCents)}).
              </span>
            ) : v.kind === "dearer" ? (
              <span className="font-semibold text-rose-400">
                {money(-v.diffCents)} ({v.pct}%) more than buying these {pricedQty} cards as singles ({money(singlesCents)}).
              </span>
            ) : (
              <span className="font-semibold text-slate-200">About the same as buying them as singles ({money(singlesCents)}).</span>
            )}
          </p>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Singles are each card&apos;s cheapest in-stock {country} price, postage extra, so a lot within a few percent is usually the better buy.
        {pricedQty < totalQty ? ` ${totalQty - pricedQty} card${totalQty - pricedQty === 1 ? " has" : "s have"} no price and ${totalQty - pricedQty === 1 ? "is" : "are"} left out.` : ""}{" "}
        <OutboundLink
          href={ebaySearchUrl(country, "Riftbound card lot", "lot-check")}
          retailer={country === "AU" ? "ebay" : `ebay_${country.toLowerCase()}`}
          country={country}
          pageType="deck"
          surface="ebay_search"
          className="font-semibold text-brand-400 hover:underline"
        >
          Riftbound lots on eBay
        </OutboundLink>{" "}
        <span className="text-slate-600">(paid link)</span>
      </p>
    </div>
  );
}
