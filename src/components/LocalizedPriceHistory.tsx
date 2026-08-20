"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "@/components/CountryProvider";
import { PriceChart } from "@/components/PriceChart";
import { currencyOf, type Country } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import type { PricePoint } from "@/lib/price-history";

// Steam-style localized price history using REAL per-market data. The importer records
// a genuine daily lowest-price series for every market (AU/US/UK), so instead of
// converting one market's numbers we show the visitor's OWN market history — client-
// fetched so the /card route stays cookie-free ISR. SSR renders the DEFAULT_COUNTRY
// baseline (so crawlers get a real series); after mount we swap to the visitor's
// market and re-fetch on every country switch. The API is CDN-cached per (card,market).
export function LocalizedPriceHistory({
  cardId,
  initialPoints,
  initialCountry,
  rows,
}: {
  cardId: string;
  initialPoints: PricePoint[];
  initialCountry: Country;
  /** Every market's listings — same data CardPriceMetrics/CardPriceComparison
   *  compute from, so "Now" below can read the identical live cheapest price
   *  instead of the daily-import snapshot the history series is built from.
   *  Optional so QuickView's compact chart (no full rows payload) keeps
   *  working unaffected. */
  rows?: MarketRow[];
}) {
  const { country, isEurDisplay } = useCountry();
  const [points, setPoints] = useState<PricePoint[]>(initialPoints);
  const [loaded, setLoaded] = useState<Country>(initialCountry);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (country === loaded) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/card/${encodeURIComponent(cardId)}/history?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.points)) {
          setPoints(d.points);
          setLoaded(country);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, loaded, cardId]);

  // Label with the currency of the data currently shown (not the pending selection),
  // so numbers and currency never disagree mid-fetch. Real history is only ever
  // tracked in the market's native currency (GBP for UK) — a European shopper
  // sees it converted to EUR here, same reference-only conversion as the live price.
  const showEur = loaded === "UK" && loaded === country && isEurDisplay;
  const currency = showEur ? "EUR" : currencyOf(loaded);
  const chartPoints = useMemo(() => (showEur ? points.map((p) => ({ ...p, v: gbpCentsToEur(p.v) })) : points), [points, showEur]);

  // Only trust the live figure once the chart has actually caught up to this
  // market (loaded === country) — mid-fetch, `chartPoints` is still the OLD
  // market's series, and computeMarket(rows, country) would already be in
  // the NEW market's currency, a mismatch worse than the one this exists to
  // fix. Same raw-cents-in-the-market's-native-currency convention as
  // `points`, so it gets the identical GBP→EUR conversion when showEur.
  const liveLowestCents = useMemo(() => {
    if (!rows || loaded !== country) return null;
    const lowest = computeMarket(rows, country).lowest;
    if (lowest == null) return null;
    return showEur ? gbpCentsToEur(lowest) : lowest;
  }, [rows, country, loaded, showEur]);

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        Price history{" "}
        <span className="text-xs font-normal text-slate-500">
          ({currency} · lowest price{loading ? " · updating…" : ""}
          {showEur && " · converted from GBP"})
        </span>
      </h2>
      <div className="mt-3">
        <PriceChart points={chartPoints} currency={currency} nowOverrideCents={liveLowestCents} />
      </div>
    </section>
  );
}
