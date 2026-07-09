"use client";

import { useEffect, useState } from "react";
import { useCountry } from "@/components/CountryProvider";
import { PriceChart } from "@/components/PriceChart";
import { currencyOf, type Country } from "@/lib/country";
import type { PricePoint } from "@/lib/price-history";

// Steam-style localized price history using REAL per-market data. The importer records
// a genuine daily lowest-price series for every market (AU/NZ/US/UK), so instead of
// converting one market's numbers we show the visitor's OWN market history — client-
// fetched so the /card route stays cookie-free ISR. SSR renders the DEFAULT_COUNTRY
// baseline (so crawlers get a real series); after mount we swap to the visitor's
// market and re-fetch on every country switch. The API is CDN-cached per (card,market).
export function LocalizedPriceHistory({
  cardId,
  initialPoints,
  initialCountry,
}: {
  cardId: string;
  initialPoints: PricePoint[];
  initialCountry: Country;
}) {
  const { country } = useCountry();
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
  // so numbers and currency never disagree mid-fetch.
  const currency = currencyOf(loaded);

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        Price history{" "}
        <span className="text-xs font-normal text-slate-500">
          ({currency} · lowest price{loading ? " · updating…" : ""})
        </span>
      </h2>
      <div className="mt-3">
        <PriceChart points={points} currency={currency} />
      </div>
    </section>
  );
}
