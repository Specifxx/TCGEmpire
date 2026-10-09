"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "@/components/CountryProvider";
import { PriceChart } from "@/components/PriceChart";
import { currencyOf, type Country } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import type { PricePoint } from "@/lib/price-history";
import { useMe } from "@/lib/use-me";
import { usePremiumDialog } from "@/components/PremiumDialog";
import { PremiumButton } from "@/components/PremiumButton";
import { FREE_HISTORY_DAYS } from "@/lib/history-access";

// Steam-style localized price history using REAL per-market data — genuinely
// tracked for AU/US/UK/SG, and historySource()-derived (a currency conversion
// of US/UK's own tracked series, applied server-side in getPriceHistory) for
// CA/EU, so this component shows the visitor's OWN market history either way
// without needing to know which — client-fetched so the /card route stays
// cookie-free ISR. SSR renders the DEFAULT_COUNTRY baseline (so crawlers get a
// real series); after mount we swap to the visitor's market and re-fetch on
// every country switch. The API is CDN-cached per (card,market). (Unrelated to
// the separate showEur/gbpCentsToEur path below, which is a UK-market
// visitor's own OPT-IN display-currency preference, not a market's data.)
export function LocalizedPriceHistory({
  cardId,
  initialPoints,
  initialOlderFrom = null,
  initialCountry,
  rows,
}: {
  cardId: string;
  /** The free window: the last FREE_HISTORY_DAYS (lib/history-access.ts). */
  initialPoints: PricePoint[];
  /** When the series older than the free window starts, or null if there is none. */
  initialOlderFrom?: number | null;
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
  // Plus and Premium read the whole series (./history/full); everyone else the
  // free 30-day window the page rendered with.
  const me = useMe();
  const member = me.loaded && me.premium;
  const [fullFor, setFullFor] = useState<Country | null>(null);
  const [older, setOlder] = useState<number | null>(initialOlderFrom);
  const { open } = usePremiumDialog();

  useEffect(() => {
    const wantFull = member && fullFor !== country;
    if (country === loaded && !wantFull) return;
    let cancelled = false;
    setLoading(true);
    const base = `/api/card/${encodeURIComponent(cardId)}/history`;
    fetch(member ? `${base}/full?country=${country}` : `${base}?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.points)) {
          setPoints(d.points);
          setLoaded(country);
          if (d.full) setFullFor(country);
          else setOlder(typeof d.olderFrom === "number" ? d.olderFrom : null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, loaded, cardId, member, fullFor]);

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
        <PriceChart
          key={member ? "full" : "free"}
          points={chartPoints}
          currency={currency}
          nowOverrideCents={liveLowestCents}
          rawCardHistory
          onLockedRange={!member && older != null ? () => open("gate:price-history", { tier: "plus" }) : undefined}
        />
      </div>
      {member ? (
        <p className="mt-3 text-xs text-slate-400">
          <a
            href={`/api/card/${encodeURIComponent(cardId)}/history.csv?country=${loaded}`}
            className="font-semibold text-brand-400 hover:underline"
            download
          >
            Download price history (CSV)
          </a>
        </p>
      ) : older != null ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-400">
          <span>
            Showing the last {FREE_HISTORY_DAYS} days. Plus shows the full history since{" "}
            {new Date(older).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} and downloads it as CSV.
          </span>
          <PremiumButton tier="plus" surface="gate:price-history" className="btn-ghost min-h-11 px-3 text-xs">
            See full history
          </PremiumButton>
        </p>
      ) : null}
    </section>
  );
}
