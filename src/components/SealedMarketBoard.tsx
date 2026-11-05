"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import type { SealedGroup } from "@/lib/sealed-import";
import type { SealedView, SealedViewGroup } from "@/lib/sealed-view";
import { ENTRY_TIER_NAME } from "@/lib/site";
import { useCountry } from "./CountryProvider";
import { DiscoveryTip } from "./DiscoveryTip";
import { Reveal } from "./Reveal";
import { SealedFilters } from "./SealedFilters";
import { SealedSort } from "./SealedSort";
import { SealedTile } from "./SealedTile";

// The market-dependent body of /sealed (2026-11-05, DECISIONS.md "The sealed page
// becomes one CDN copy per URL"): the filters, the count, the sort and the grid. The
// page is one CDN copy per URL for every visitor (no cookie, header or session read
// on the server, like /card/[id] and /sealed/[slug]), so its HTML carries the
// baseline market's view (the US) and this island swaps in the visitor's market
// (CountryProvider: the baseline on the server, theirs after hydration) by fetching
// /api/sealed-view, which the CDN also keeps. Until that answer lands the baseline
// grid stays on screen, so there is never an empty page. A fetched view is kept
// per market for the life of the page, so switching back and forth costs nothing.
//
// The baseline is the one the server rendered: the view the island shows for a
// US visitor is byte-for-byte the HTML a crawler sees.
export function SealedMarketBoard({ baseline, query }: { baseline: SealedView; query: Record<string, string> }) {
  const { country, isEurDisplay } = useCountry();
  const qs = useMemo(() => new URLSearchParams(query).toString(), [query]);
  // Fetched views keyed by market AND query: a filter change is a soft
  // navigation that keeps this island mounted (same route, new searchParams),
  // so state keyed by market alone would show the old query's grid for a
  // visitor outside the baseline market. The baseline is never stored: it is
  // the prop, and the prop is always the current URL's.
  const [fetched, setFetched] = useState<Record<string, SealedView>>({});
  const [loading, setLoading] = useState<Country | null>(null);
  const key = `${country}|${qs}`;
  const wanted = country === baseline.country ? baseline : fetched[key];

  useEffect(() => {
    if (wanted) return;
    let cancelled = false;
    setLoading(country);
    fetch(`/api/sealed-view?market=${country}${qs ? `&${qs}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<SealedView>) : null))
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
  }, [wanted, country, qs, key]);

  const view = wanted ?? baseline;
  const info = COUNTRIES[view.country];
  const q = query.q ?? "";

  // A European shopper browsing the UK market's real GBP listings sees them
  // converted to EUR for display (the page's JSON-LD stays in the real currency).
  const showEur = view.priceCountry === "UK" && isEurDisplay;
  const displayCurrency = showEur ? "EUR" : COUNTRIES[view.priceCountry].currency;
  const displayGroups = useMemo(
    () =>
      showEur
        ? view.groups.map((g) => ({
            ...g,
            lowestPriceCents: g.lowestPriceCents != null ? gbpCentsToEur(g.lowestPriceCents) : null,
            listings: g.listings.map((l) => ({ ...l, priceCents: gbpCentsToEur(l.priceCents) })),
          }))
        : view.groups,
    [view, showEur],
  );
  const soldOut = useMemo(() => new Set(view.soldOutKeys), [view]);
  // Over JSON (and from the baseline, which is built the same way) firstSeenAt is
  // an ISO string or null; nothing the tile or the quick view reads depends on
  // it, the same understanding SearchBar's sealed rows rely on.
  const asGroup = (g: SealedViewGroup) => g as unknown as SealedGroup;

  return (
    <>
      {/* The fallback is DEFAULT_COUNTRY's listings, named from the data: this
          said "Australian listings (prices in AUD)" for months after the
          fallback became the US, and promised boxes "ship internationally",
          which nothing here checks. */}
      {view.usingFallback && (
        <p className="mb-4 text-xs text-slate-500">
          We don&apos;t track {info.adjective} sealed stores yet, so these are {COUNTRIES[view.priceCountry].adjective} listings,
          priced in {COUNTRIES[view.priceCountry].currency}. Check that a store ships to you before you order.
        </p>
      )}
      {/* xl, not lg: the filter sidebar sits beside the grid only from 1280
          (SealedFilters.tsx, 2026-09-23). At 1024 it left 3 columns of 131px. */}
      <div className="flex flex-col gap-6 xl:flex-row" aria-busy={loading != null}>
        <SealedFilters types={view.typeOptions} sets={view.setOptions} currency={displayCurrency} />
        <section className="min-w-0 flex-1">
          {/* SealedFilters' "Show results" target; scroll-mt-36 clears the 125px
              sticky header (2026-09-23). */}
          <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              <span className="num font-semibold text-white">{view.groups.length.toLocaleString()}</span>{" "}
              {view.groups.length === 1 ? "product" : "products"}
              {q && <> for <span className="text-brand-400">&ldquo;{q}&rdquo;</span></>}
              {loading && <span className="ml-2 text-xs text-slate-500">Loading {COUNTRIES[loading].adjective} prices…</span>}
            </p>
            <SealedSort />
          </div>
          {/* One inline line for a signed-in free account (2026-09-29), never
              a popup: the heart on every tile is a Plus feature. */}
          <DiscoveryTip id="sealed" surface="tip:sealed" tier="plus" cta={`See ${ENTRY_TIER_NAME}`} className="mb-4">
            {ENTRY_TIER_NAME} can email you when a box is back in stock or at RRP — tap the heart on a product to watch it.
          </DiscoveryTip>
          {view.groups.length === 0 ? (
            <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
              <div>
                <p className="text-lg font-semibold text-white">
                  {view.isFiltered ? "No sealed products match your filters" : "No sealed products yet"}
                </p>
                <p className="mt-1 text-sm">
                  {view.isFiltered ? (
                    <Link href="/sealed" className="text-brand-400 hover:underline">Clear filters</Link>
                  ) : (
                    "Our feeds refresh regularly — check back soon."
                  )}
                </p>
              </div>
            </div>
          ) : (
            <Reveal stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {displayGroups.map((g) => (
                <SealedTile
                  key={g.groupKey}
                  group={asGroup(g)}
                  currency={displayCurrency}
                  soldOutEverywhere={soldOut.has(g.groupKey)}
                />
              ))}
            </Reveal>
          )}
        </section>
      </div>
    </>
  );
}
