"use client";

import { useEffect, useMemo, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/country";
import { PRICE_GUIDE_PATH } from "@/lib/price-guide-seo";
import type { PriceGuideView } from "@/lib/price-guide-view";
import { useCountry } from "../CountryProvider";
import { Filters } from "../Filters";
import { ActiveFilters } from "../ActiveFilters";
import { Pagination } from "../Pagination";
import { EmptyState } from "../ui/EmptyState";
import { AffiliateDisclosure } from "../AffiliateDisclosure";
import { PriceGuideNavProvider, PriceGuideBusyRegion } from "./PriceGuideNav";
import { PriceGuideToolbar } from "./PriceGuideToolbar";
import { PriceGuideTable } from "./PriceGuideTable";
import { PriceGuideSummary } from "./PriceGuideSummary";

// The market-dependent body of /price-guide (2026-11-05, DECISIONS.md "The price
// guide becomes one CDN copy per URL"): the stat strip, prices by set, the
// filters, the toolbar, the table and the pager. The page is one CDN copy per
// URL for every visitor (no cookie, header or session read on the server, like
// /sealed and /card/[id]), so its HTML carries the baseline market's view (the
// US, or the market a `?market=` link pins) and this island swaps in the
// visitor's market (CountryProvider: the baseline on the server, theirs after
// hydration) by fetching /api/price-guide-view, which the CDN also keeps. Until
// that answer lands the baseline stays on screen, so there is never an empty
// table. A `?market=` link is pinned: the URL outranks the cookie, as it always
// did, so the island draws the HTML's view and fetches nothing.
//
// Fetched views are keyed by market, display currency AND query: a filter or
// page change is a soft navigation that keeps this island mounted with new
// searchParams, so the baseline is always the current prop, never a stored copy.
//
// The baseline is the one the server rendered: the view the island shows for a
// US visitor is byte-for-byte the HTML a crawler sees.
export function PriceGuideMarketBoard({
  baseline,
  query,
  pinned,
}: {
  baseline: PriceGuideView;
  /** The page's own query (every guide key but `market`), repeated to the API. */
  query: Record<string, string>;
  /** The URL carries `?market=`: show the HTML's market, whatever the cookie says. */
  pinned: boolean;
}) {
  const { country: visitor, isEurDisplay } = useCountry();
  const country: Country = pinned ? baseline.country : visitor;
  const cur = !pinned && country === "UK" && isEurDisplay ? "EUR" : COUNTRIES[country].currency;
  const qs = useMemo(() => new URLSearchParams(query).toString(), [query]);
  const [fetched, setFetched] = useState<Record<string, PriceGuideView>>({});
  const [loading, setLoading] = useState<Country | null>(null);
  const key = `${country}|${cur}|${qs}`;
  const wanted = country === baseline.country && cur === baseline.currency ? baseline : fetched[key];

  useEffect(() => {
    if (wanted) return;
    let cancelled = false;
    setLoading(country);
    const params = new URLSearchParams(query);
    params.set("market", country);
    if (cur === "EUR") params.set("cur", "EUR");
    fetch(`/api/price-guide-view?${params.toString()}`)
      .then((r) => (r.ok ? (r.json() as Promise<PriceGuideView>) : null))
      .then((v) => {
        if (cancelled || !v) return;
        setFetched((prev) => ({ ...prev, [key]: v }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => (l === country ? null : l));
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, country, cur, query, key]);

  const view = wanted ?? baseline;
  const { place, currency: display } = view;

  // "Back to page 1" keeps every filter, sort and market; only `page` goes.
  const params: Record<string, string | undefined> = pinned ? { ...query, market: baseline.country } : query;
  const pageOneQs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[0] !== "page" && !!e[1]),
  ).toString();
  const pageOneHref = PRICE_GUIDE_PATH + (pageOneQs ? `?${pageOneQs}` : "");

  return (
    <>
      <PriceGuideSummary part="stats" stats={view.stats} sets={view.bySet} currency={display} place={place} />

      <div className="mt-6 flex flex-col gap-6 xl:flex-row" aria-busy={loading != null}>
        {/* No keyword box in the panel here: the toolbar beside it already
            searches the guide (PriceGuideToolbar), and two boxes would
            write the one `q`. */}
        <Filters basePath={PRICE_GUIDE_PATH} currency={display} hidePreorderSets search={false} />

        <section id="results" aria-label="Price list" className="min-w-0 flex-1 scroll-mt-header">
          <PriceGuideNavProvider>
            <PriceGuideToolbar q={query.q ?? ""} size={view.size} marketOverride={pinned ? place : null}>
              {view.items.length > 0 ? (
                <p>
                  Showing{" "}
                  <span className="num font-semibold text-white">
                    {view.start.toLocaleString("en-US")}–{view.end.toLocaleString("en-US")}
                  </span>{" "}
                  of <span className="num font-semibold text-white">{view.total.toLocaleString("en-US")}</span>{" "}
                  {view.total === 1 ? "card" : "cards"}
                  <span className="text-slate-500">
                    {" "}
                    · {view.pricedHere.toLocaleString("en-US")} priced in {place}
                  </span>
                  {loading && <span className="ml-2 text-xs text-slate-500">Loading {COUNTRIES[loading].adjective} prices…</span>}
                </p>
              ) : view.total > 0 ? (
                <p>
                  <span className="num font-semibold text-white">{view.total.toLocaleString("en-US")}</span>{" "}
                  {view.total === 1 ? "card" : "cards"}
                  <span className="text-slate-500"> · 0 on this page</span>
                </p>
              ) : (
                <p>
                  <span className="num font-semibold text-white">0</span> of{" "}
                  <span className="num">{view.listed.toLocaleString("en-US")}</span> cards match these filters
                </p>
              )}
            </PriceGuideToolbar>

            <ActiveFilters basePath={PRICE_GUIDE_PATH} currency={display} />

            {view.total === 0 ? (
              <EmptyState
                icon="prices"
                title={`0 of ${view.listed.toLocaleString("en-US")} cards match these filters`}
                body="Loosen a filter or clear the search to bring cards back into the list."
                primary={{ href: PRICE_GUIDE_PATH, label: "Reset" }}
              />
            ) : view.items.length === 0 ? (
              <EmptyState
                icon="prices"
                title={`This list has ${view.totalPages} ${view.totalPages === 1 ? "page" : "pages"}`}
                body="The page in this link is past the end of the list."
                primary={{ href: pageOneHref, label: "Back to page 1" }}
              />
            ) : (
              <PriceGuideBusyRegion>
                <AffiliateDisclosure partner="both" className="mb-2" />
                <PriceGuideTable
                  items={view.items}
                  currency={display}
                  market={view.country}
                  sort={view.sort}
                  showD30={view.showD30}
                  caption={`Riftbound card prices in ${place}, ${display}, cards ${view.start} to ${view.end} of ${view.total}`}
                />
              </PriceGuideBusyRegion>
            )}
          </PriceGuideNavProvider>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            7-day change: the week-on-week move in the cheapest price across Australia, the US, the UK and
            Singapore, in US dollars, so it is the same in every market
            {view.asOf ? <>, to the week of {view.asOf}</> : null}. Blank until a card has two weekly prices on the current
            basis{view.changesUnavailable ? "; the weekly figures are unavailable right now" : ""}.
            {view.showD30
              ? " 30-day change: the same US-dollar basis over about a month, so it is also the same in every market; blank until a card has about a month of weekly prices."
              : null} Lowest: the
            cheapest in-stock price from any store or eBay seller we track in {place}; a dash means none has that
            printing in stock. TCGplayer: the cheapest English Near-Mint listing in the US; elsewhere, its US market
            price converted to {display} as a reference (postage and duty extra), never part of Lowest. eBay: the
            cheapest listing we track (item price, postage extra); the button searches eBay for the card.
          </p>

          <Pagination page={view.page} totalPages={view.totalPages} params={params} basePath={PRICE_GUIDE_PATH} />
        </section>
      </div>

      {/* "Prices by set" under the list and its pager (2026-11-13): above it, the first price row was below the first screen. */}
      <PriceGuideSummary part="sets" stats={view.stats} sets={view.bySet} currency={display} place={place} />
    </>
  );
}

/**
 * The market's name or currency inside the page's prose ("in the United
 * Kingdom, in GBP"): the baseline's words in the HTML, the visitor's after
 * hydration, the pinned market's when the URL carries `?market=`.
 */
export function PriceGuideMarketWord({ baseline, pinned, what }: { baseline: Country; pinned: boolean; what: "place" | "currency" }) {
  const { country: visitor, isEurDisplay } = useCountry();
  const country = pinned ? baseline : visitor;
  if (what === "place") return <>{COUNTRIES[country].place}</>;
  return <>{!pinned && country === "UK" && isEurDisplay ? "EUR" : COUNTRIES[country].currency}</>;
}
