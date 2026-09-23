"use client";

import { useMemo } from "react";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";
import { compareMarkets, marketSpreadSentence, type MarketQuote } from "@/lib/market-comparison";
import type { MarketRow } from "@/lib/market-rows";

// ── "Price by market" — the multi-currency comparison, on one scale ──────────
//
// Replaces a flat list that printed each market's cheapest price in its own
// currency and stopped there: A$14.00, £6.50, US$8.20, S$12.90. Every figure was
// correct and the block was useless, because nobody ranks four currencies by
// eye — the site's most distinctive data read as four unrelated numbers.
//
// Now every market is also converted into ONE comparison currency, ranked, and
// the spread is stated in words. The native price stays the headline on each row,
// because that is the figure the visitor can actually act on; the converted one
// is a small aside, exactly as prominent as an indicative number deserves to be.
//
// A CLIENT COMPONENT ON PURPOSE, and it costs no extra data. `rows` already
// carries all six markets (the card page serialises them unfiltered — that is
// what makes the instant market switch work), so this is arithmetic on bytes the
// page has already sent. Being a client component is what lets the comparison
// currency follow the visitor's own market after hydration: an Australian sees
// every market converted to AUD, which is the whole point.
//
// AND IT IS STILL FULLY SERVER-RENDERED. CountryProvider is initialised with
// DEFAULT_COUNTRY (app/layout.tsx), so SSR emits a complete, populated table with
// USD comparisons and the full prose summary — a crawler gets every market's real
// price in every real currency in the HTML, which is what makes "how much is
// <card> in GBP" answerable from this page at all. Same pattern, same reasoning,
// as CardPriceComparison.
//
// WHAT THIS BLOCK MUST NOT BECOME: a recommendation to import. Tracked stores
// ship within their own market, and nothing here models international postage,
// duty or GST/VAT thresholds — see the honesty rules at the top of
// lib/market-comparison.ts. It reports where listings are cheaper. It does not
// tell anyone to buy there, and the footnote says so in the visitor's own words.

function ShippingNote({ quote }: { quote: MarketQuote }) {
  return (
    <span className="mt-0.5 block text-xs font-normal text-slate-500">
      {quote.shippingCents == null
        ? "postage at checkout"
        : quote.shippingCents === 0
          ? "free postage"
          : `+ ${formatMoney(quote.shippingCents, quote.currency)} postage`}
    </span>
  );
}

export function CardMarketsTable({ rows, cardName }: { rows: MarketRow[]; cardName: string }) {
  const { country, currency } = useCountry();

  // Recomputed only when the visitor's market changes — the row set is static for
  // the life of the page.
  const cmp = useMemo(() => compareMarkets(rows, currency), [rows, currency]);
  const summary = useMemo(() => marketSpreadSentence(cmp, cardName), [cmp, cardName]);

  // One market with a listing is not a comparison. Render nothing rather than a
  // table with a single row calling itself the cheapest.
  if (cmp.quotes.length < 2) return null;

  const cheapestCode = cmp.cheapest?.country;

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="font-bold text-white">{cardName} price by market</h2>

      {summary && <p className="mt-2 text-sm leading-relaxed text-slate-400">{summary}</p>}

      {/* Wide content scrolls inside its own container rather than pushing the
          page sideways on a phone — kept as a safety net, but the table no
          longer relies on it (2026-09-23). It had a min-w-[30rem], so at 390
          the whole ≈ USD and Stores columns, 164px, sat past the edge with
          nothing to say they were there. Below sm the ≈ figure now folds into
          the Cheapest cell and its own column is hidden, and the table simply
          fills its box. No min-width from sm either: the four columns' own
          minimum measured 305–359px, and the box is never narrower than 478px
          there (1024, beside the 160px art column), where a 30rem minimum
          would leave exactly a 2px scroll. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-3">Market</th>
              <th scope="col" className="py-2 pr-3">Cheapest</th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">≈ {cmp.compareCurrency}</th>
              <th scope="col" className="py-2 text-right">Stores</th>
            </tr>
          </thead>
          <tbody>
            {cmp.quotes.map((q) => {
              const isCheapest = q.country === cheapestCode;
              const isYours = q.country === country;
              return (
                <tr key={q.country} className="border-t border-ink-800 align-top">
                  {/* Both chips live here rather than beside the figures. The
                      "Cheapest" one sat in the conversion column and rendered as
                      "— Cheapest" for a visitor whose own currency IS the
                      comparison currency (that column is a dash there), which
                      read as broken. `label`, not `place`: a cell reading "the
                      United States" is wrong; the prose summary above uses the
                      prepositional form instead. */}
                  <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-slate-200">
                    <span className="mr-1.5" aria-hidden>{q.flag}</span>
                    {q.label}
                    {/* No whitespace-nowrap on these chips, deliberately
                        (2026-09-23). Once the table can narrow below sm, a
                        nowrap "YOUR MARKET" (105px) sets the Market column's
                        minimum at 126px, and at 320 the table overflowed its
                        246px box by 15px — hiding the right-aligned store
                        counts behind a scroll. Allowed to wrap, the chip goes
                        to two lines at 320 only; from 360 the column is
                        ≥137px and it stays on one. */}
                    {isCheapest && (
                      <span className="ml-2 chip bg-accent/15 text-[10px] font-bold uppercase tracking-wider text-accent">
                        Cheapest
                      </span>
                    )}
                    {isYours && (
                      <span className="ml-2 chip bg-ink-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Your market
                      </span>
                    )}
                  </th>
                  <td className={`num py-2.5 pr-3 font-semibold ${isCheapest ? "text-accent" : "text-white"}`}>
                    {formatMoney(q.nativeCents, q.currency)}
                    <ShippingNote quote={q} />
                    {/* The ≈ column, folded in below sm where that column is
                        hidden. Rows already in the comparison currency get no
                        line, matching the column's "—". */}
                    {q.currency !== cmp.compareCurrency && (
                      <div className="text-[11px] font-normal text-slate-400 sm:hidden">
                        ≈ {formatMoney(q.comparableCents, cmp.compareCurrency)}
                      </div>
                    )}
                  </td>
                  {/* The indicative column. Deliberately the quietest thing in the
                      row: it exists to make the ranking legible, not to be read as
                      a price. Suppressed where it would just restate the native
                      figure in the same currency. */}
                  <td className="num hidden py-2.5 pr-3 text-slate-400 sm:table-cell">
                    {q.currency === cmp.compareCurrency ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      formatMoney(q.comparableCents, cmp.compareCurrency)
                    )}
                  </td>
                  <td className="num py-2.5 text-right text-slate-400">{q.storeCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The disclaimer is not boilerplate — it is the difference between a
          comparison and bad advice. Both halves matter: the rate is indicative
          (lib/fx.ts is hand-set), and a cheaper market is usually not one you can
          buy from, because tracked stores ship domestically and nothing here
          models postage, duty or GST/VAT thresholds. */}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Prices are live listings from stores in each market, in the currency that store actually charges. The
        “≈ {cmp.compareCurrency}” column is an indicative conversion for comparison only — not a quote, and not what
        you&apos;ll be billed. Stores generally ship within their own market, and international postage, duty and
        GST/VAT aren&apos;t included, so a cheaper market elsewhere isn&apos;t necessarily cheaper to get delivered
        to you.
      </p>
    </section>
  );
}
