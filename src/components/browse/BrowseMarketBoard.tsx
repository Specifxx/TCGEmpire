"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { BrowseView } from "@/lib/browse-view";
import { BROWSE_DEFAULT_SORT } from "@/lib/browse-shared";
import type { CardQuery } from "@/lib/cards";
import type { SealedGroup } from "@/lib/sealed-import";
import type { SealedViewGroup } from "@/lib/sealed-view";
import { useCountry } from "../CountryProvider";
import { ActiveFilters } from "../ActiveFilters";
import { EbayBuyCta } from "../EbayBuyCta";
import { SortSelect } from "../SortSelect";
import { CardTile } from "../CardTile";
import { SealedTile } from "../SealedTile";
import { Pagination } from "../Pagination";
import { PageSizeSelect } from "../PageSizeSelect";
import { FamilySearch } from "../FamilySearch";
import { InlineSignupPrompt } from "../InlineSignupPrompt";

/** The free-account prompt sits after this many tiles (fewer on a short page: after the last). */
const BROWSE_PROMPT_AFTER = 12;

// The market-dependent body of /browse (2026-11-05, DECISIONS.md "The card list
// becomes one CDN copy per URL"): the count, the sort and size controls, the
// eBay search by the count, the active filters, the sealed matches, the grid
// and the pager. The page is one CDN copy per URL for every visitor (no cookie,
// header or session read on the server, like /sealed and /card/[id]), so its
// HTML carries the baseline market's view (the US, or the market a `?market=`
// link pins) and this island swaps in the visitor's market (CountryProvider:
// the baseline on the server, theirs after hydration) by fetching
// /api/browse-view, which the CDN also keeps. Until that answer lands the
// baseline stays on screen, so there is never an empty grid.
//
// PINNED views fetch nothing: a `?market=` link (the URL outranks the cookie,
// as it always did) and a text search, which app/browse/search/page.tsx meters
// and renders for the visitor's own market, since the search API stays private.
//
// Fetched views are keyed by market AND query: a filter or page change is a
// soft navigation that keeps this island mounted with new searchParams, so the
// baseline is always the current prop, never a stored copy.
//
// The server halves that cannot live in a client file (EbayPicks reads the
// database; RelatedGuides reads the article index) come in as slots, drawn in
// the same places they always were.
export function BrowseMarketBoard({
  baseline,
  query,
  pinned,
  marketParam,
  picks,
  guides,
}: {
  baseline: BrowseView;
  /** The page's own query (every key but `market`), repeated to the API. */
  query: CardQuery;
  pinned: boolean;
  /** The URL's own `?market=`, kept on the pager's links; absent otherwise. */
  marketParam?: string;
  picks: ReactNode;
  guides: ReactNode;
}) {
  const { country: visitor } = useCountry();
  const country: Country = pinned ? baseline.country : visitor;
  const qs = useMemo(() => new URLSearchParams(query as Record<string, string>).toString(), [query]);
  const [fetched, setFetched] = useState<Record<string, BrowseView>>({});
  const [loading, setLoading] = useState<Country | null>(null);
  const key = `${country}|${qs}`;
  const wanted = country === baseline.country ? baseline : fetched[key];

  useEffect(() => {
    if (wanted) return;
    let cancelled = false;
    setLoading(country);
    fetch(`/api/browse-view?market=${country}${qs ? `&${qs}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<BrowseView>) : null))
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
  const { q, total, totalPages, page, cards } = view;
  // Whether anything at all answers the search: single cards or sealed products.
  const hasResults = total > 0 || view.sealedMatches > 0;
  // The tile the free-account prompt follows: the 12th, or the last on a short page.
  const promptAfterId = cards[Math.min(BROWSE_PROMPT_AFTER, cards.length) - 1]?.id;
  const soldOut = useMemo(() => new Set(view.soldOutKeys), [view]);
  // Over JSON firstSeenAt is an ISO string or null; nothing the tile or the
  // quick view reads depends on it (the SealedMarketBoard understanding).
  const asGroup = (g: SealedViewGroup) => g as unknown as SealedGroup;
  const params = (marketParam ? { ...query, market: marketParam } : query) as Record<string, string | undefined>;

  return (
    <>
      {/* #results is where Filters' "Show results" lands. On this row, not the
          section: the section's top is ~750px above the first tile. scroll-mt-36
          clears the 125px sticky header below xl (2026-09-23). */}
      <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3" aria-busy={loading != null}>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{total.toLocaleString("en-US")}</span>{" "}
          {total === 1 ? "card" : "cards"}
          {q && (
            <> for <span className="text-brand-400">“{q}”</span></>
          )}
          {view.sealedMatches > 0 && (
            <>
              {" "}· <span className="font-semibold text-white">{view.sealedMatches.toLocaleString("en-US")}</span> sealed{" "}
              {view.sealedMatches === 1 ? "product" : "products"}
            </>
          )}
          {total > 0 && <span className="text-slate-600"> · page {page} of {totalPages}</span>}
          {loading && <span className="ml-2 text-xs text-slate-500">Loading {COUNTRIES[loading].adjective} prices…</span>}
        </p>
        <div className="flex items-center gap-3">
          <PageSizeSelect size={view.size} />
          <SortSelect defaultSort={BROWSE_DEFAULT_SORT} />
        </div>
      </div>

      {/* SEARCH EBAY FOR THE SAME WORDS (2026-09-26, "Pushing eBay clicks" in
          DECISIONS.md). A visitor who typed a search has said what they want
          to buy, so eBay's search for those words sits by the count that
          answers them. freeText copy ("Search eBay for “q”", never "Buy q"):
          the words are the visitor's, not a card name, and we do not know
          eBay has a listing for them. Compact here; with no results at all the
          full one below takes its place, as the only way forward. */}
      {q && hasResults && (
        <EbayBuyCta query={q} freeText compact source="browse-search" pageType="browse" surface="ebay_search" className="mb-4" />
      )}

      <ActiveFilters />

      {/* SEALED MATCHES, above the cards: a search like "origins" names a set,
          and its boxes and packs are often the whole answer. Each tile opens
          the sealed quick view in place (SealedTile), like a card tile does. */}
      {view.sealedShown.length > 0 && (
        <section aria-labelledby="browse-sealed-heading" className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="browse-sealed-heading" className="font-display text-lg font-extrabold text-white">
              Sealed products
            </h2>
            <Link href={`/sealed?q=${encodeURIComponent(q)}`} className="text-sm text-brand-400 hover:underline">
              {view.sealedMatches > view.sealedShown.length
                ? `See all ${view.sealedMatches} sealed products →`
                : "Open in Sealed →"}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {view.sealedShown.map((g) => (
              <SealedTile
                key={g.groupKey}
                group={asGroup(g)}
                currency={view.sealedCurrency}
                soldOutEverywhere={soldOut.has(g.groupKey)}
              />
            ))}
          </div>
        </section>
      )}

      {cards.length === 0 ? (
        <>
          {/* With sealed matches above and no single cards, say so in one line
              instead of a full "No cards found" panel under the answer. */}
          {total === 0 && view.sealedMatches > 0 ? (
            <p className="card-surface p-4 text-sm text-slate-400">
              No single cards match “{q}”. The sealed products above do.{" "}
              <Link href="/browse" className="text-brand-400 hover:underline">Browse all cards</Link>
            </p>
          ) : (
            <div className="card-surface grid place-items-center p-16 text-center">
              <p className="text-lg font-semibold text-white">
                {total > 0 ? "Nothing on this page" : "No cards found"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {total > 0 ? "Try an earlier page." : "Try adjusting your filters or search."}
              </p>
              <Link href="/browse" className="btn-primary mt-4">Reset</Link>
            </div>
          )}
          {/* A search our database has no card for (a typo, a set we have
              not loaded yet, a product that is not a single) can still be on
              eBay — the full CTA, since here it is the one route left. With
              sealed matches the compact one above already covers it. */}
          {q && !hasResults && (
            <EbayBuyCta query={q} freeText source="browse-no-results" pageType="browse" surface="ebay_search" className="mt-4" />
          )}
        </>
      ) : (
        <>
          {/* Sized from the column's own width from lg (2026-09-23): the rail and
              the sidebar squeeze it, and the 10.5rem floor keeps CardTile's
              min-w-[6.5rem] price block inside the tile. Was lg:4 / xl:5 by
              viewport, i.e. 94px tiles at 1024 and 123px at 1280. */}
          {/* grid-flow-row-dense: the sign-up prompt below is a full-width
              row after the 12th tile, and where 12 does not fill the last row
              (5 columns) the next tiles fill the gap before it rather than
              leaving holes. The tiles keep their order. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] grid-flow-row-dense">
            {cards.map((c) => (
              <Fragment key={c.id}>
                <CardTile card={c} />
                {/* THE CARD LIST'S SIGN-UP PROMPT (2026-09-30, "The sign-up
                    slider is gone"): after the first rows, never above the
                    results, signed-out visitors only, a client island that
                    renders nothing on the server. Six rows down on a phone,
                    three or four on a desktop: below the first screen. */}
                {c.id === promptAfterId && (
                  <InlineSignupPrompt
                    surface="inline_browse"
                    className="col-span-full"
                    title="Keep track of the cards you're after"
                    body={`A free account keeps a watchlist of as many cards as you like and emails you when one drops in price, and tracks what your collection is worth, with profit and loss, for every card you own.`}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} params={params} />
        </>
      )}

      {/* The same search on the other card-game sites (2026-10-28): a
          Pokémon or One Piece name typed here finds its own site. */}
      {q && <FamilySearch q={q} className="mt-6" />}

      {/* The guides behind the card list (RelatedGuides, a server component
          passed in by the page), after the grid and before the ad — our
          writing ahead of the commercial slot. Not on a ?q search, whose view
          is noindexed and whose reader came for one card. */}
      {!q && guides}

      {/* The one in-page ad block (InlineAds, passed in by the page; owner, 2026-11-13): after the grid, never above the results. */}
      {picks}
    </>
  );
}

/**
 * The market's name or currency inside the page's intro ("in the United
 * Kingdom, in GBP"), and Canada's converted eBay US note: the baseline's words
 * in the HTML, the visitor's after hydration, the pinned market's when the URL
 * carries `?market=` or the view is a metered search.
 */
export function BrowseMarketWord({ baseline, pinned, what }: { baseline: Country; pinned: boolean; what: "place" | "currency" | "ebay-us-note" }) {
  const { country: visitor } = useCountry();
  const country = pinned ? baseline : visitor;
  if (what === "place") return <>{COUNTRIES[country].place}</>;
  if (what === "currency") return <>{COUNTRIES[country].currency}</>;
  // Canada's "eBay US" note retired 2026-11-10: its eBay rows are eBay Canada listings in CAD now, nothing converted.
  return null;
}
