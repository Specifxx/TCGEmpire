"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { CardQuery } from "@/lib/cards";
import type { SetView } from "@/lib/set-view";
import { formatMoney } from "@/lib/format";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { useCountry } from "../CountryProvider";
import { CardTile } from "../CardTile";
import { CountUp } from "../CountUp";
import { Reveal } from "../Reveal";
import { Filters } from "../Filters";
import { ActiveFilters } from "../ActiveFilters";
import { SortSelect } from "../SortSelect";
import { PageSizeSelect } from "../PageSizeSelect";
import { Pagination } from "../Pagination";
import { SetOwnedStatus, SetTickLayer } from "../SetOwned";
import { SetPriceGuide } from "./SetPriceGuide";

// The market-dependent body of /sets/[set] (2026-11-05, DECISIONS.md "The set
// pages become one CDN copy per URL"): the hero's priced count, the filters,
// the count row and its controls, the grid with the owned ticks, the pager,
// the data-derived intro, the #price-guide table and "How to read … prices".
// The page is one CDN copy per URL for every visitor (no cookie, header or
// session read on the server, like /sealed, /price-guide and /browse), so its
// HTML carries the baseline market's view (the US, or the market a `?market=`
// link pins) and this island swaps in the visitor's market (CountryProvider:
// the baseline on the server, theirs after hydration) by fetching
// /api/set-view, which the CDN also keeps. Until that answer lands the
// baseline stays on screen, so there is never an empty grid.
//
// ONE FETCH FOR THE WHOLE PAGE: the hero's count sits far above the grid, so
// the view lives in a context (SetViewProvider, wrapped round the page body)
// and the hero's numbers (SetMarketValue, SetCountUp) and the board read it.
// Fetched views are keyed by market AND query: a filter or page change is a
// soft navigation that keeps the provider mounted with new searchParams, so
// the baseline is always the current prop, never a stored copy.
//
// A `?market=` link is pinned: the URL outranks the cookie, as it always did,
// so the island draws the HTML's view and fetches nothing.
interface SetViewCtx {
  view: SetView;
  baseline: SetView;
  /** `${market}|${query}`: what the fetched view is stored under. */
  key: string;
  loading: Country | null;
}

const Ctx = createContext<SetViewCtx | null>(null);

export function SetViewProvider({
  baseline,
  query,
  pinned,
  setSlug,
  children,
}: {
  baseline: SetView;
  /** The page's own query (every key but `market`), repeated to the API. */
  query: CardQuery;
  /** The URL carries `?market=`: show the HTML's market, whatever the cookie says. */
  pinned: boolean;
  setSlug: string;
  children: ReactNode;
}) {
  const { country: visitor } = useCountry();
  const country: Country = pinned ? baseline.country : visitor;
  const qs = useMemo(() => new URLSearchParams(query as Record<string, string>).toString(), [query]);
  const [fetched, setFetched] = useState<Record<string, SetView>>({});
  const [loading, setLoading] = useState<Country | null>(null);
  const key = `${country}|${qs}`;
  const wanted = country === baseline.country ? baseline : fetched[key];

  useEffect(() => {
    if (wanted) return;
    let cancelled = false;
    setLoading(country);
    fetch(`/api/set-view?set=${encodeURIComponent(setSlug)}&market=${country}${qs ? `&${qs}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<SetView>) : null))
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
  }, [wanted, country, qs, key, setSlug]);

  const value = useMemo<SetViewCtx>(() => ({ view: wanted ?? baseline, baseline, key, loading }), [wanted, baseline, key, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useSetView(): SetViewCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSetView must be used within <SetViewProvider>");
  return ctx;
}

/** A number or word of the visitor's market's view, inside the page's prose. */
export function SetMarketValue({ what }: { what: "priced" | "place" | "currency" }) {
  const { view } = useSetView();
  if (what === "priced") return <>{view.priced.toLocaleString("en-US")}</>;
  if (what === "place") return <>{view.place}</>;
  return <>{view.currency}</>;
}

/** The hero's counting-up "priced" chip, for the visitor's market. */
export function SetCountUp({ what, className }: { what: "priced"; className?: string }) {
  const { view } = useSetView();
  return <CountUp value={view[what]} className={className} />;
}

export function SetMarketBoard({
  setSlug,
  setName,
  trackerOpen,
  live,
  fullyRevealed,
  completeAt,
  preReleaseLinks,
  marketParam,
  query,
  rbs,
}: {
  setSlug: string;
  setName: string;
  /** The set has released: the owned ticks and their summary are offered. */
  trackerOpen: boolean;
  /** Singles trade (released, or trading ahead of release). */
  live: boolean;
  fullyRevealed: boolean;
  completeAt: number | null | undefined;
  preReleaseLinks: { href: string; label: string }[];
  /** The URL's own `?market=`, kept on the pager's links; absent otherwise. */
  marketParam?: string;
  /** The page's own query, for the pager. */
  query: CardQuery;
  /** The RiftboundStocks link, resolved by the page (a server read). */
  rbs: ReactNode;
}) {
  const { view, baseline, key, loading } = useSetView();
  const { total, totalPages, page, cards, priceGuide, intro, totalInSet, priced, guideTop, guideLow, topTenRarity } = view;
  const searchQ = view.q;
  const basePath = `/sets/${setSlug}`;
  const params = (marketParam ? { ...query, market: marketParam } : query) as Record<string, string | undefined>;

  return (
    <>
      {/* The ticks are portalled into the tiles and the guide's rows on the
          client (components/SetOwned.tsx), found through one marker each and
          paired with the ids by position; scanKey says when the grid really
          changed (a new query or market, or the visitor's market landing). */}
      {trackerOpen && <SetTickLayer tileIds={cards.map((c) => c.id)} rowIds={priceGuide.map((r) => r.id)} scanKey={`${key}|${view === baseline}`} />}

      {/* xl, not lg: the filter sidebar sits beside the grid only from 1280, as
          on /browse (Filters.tsx, 2026-09-23). currency is the market column's. */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <Filters basePath={basePath} hideSet currency={view.currency} />

        <section className="min-w-0 flex-1">
          {!live && (
            <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-300">
              {fullyRevealed ? (
                <><strong className="text-emerald-300">All revealed.</strong> Every one of the {completeAt} official {setName} cards is confirmed below — live store prices appear here the moment singles go on sale.</>
              ) : (
                <><strong className="text-emerald-300">Revealed so far.</strong> These are the {setName} cards officially
                revealed to date — more land through spoiler season, and live store prices appear here the moment singles
                go on sale.</>
              )}
              {/* The same PRE_RELEASE_LINKS the page's empty-state branch renders.
                  They used to live ONLY there, so the moment the first card
                  imported (Neeko, 2026-09-19) the hub silently lost every link
                  into the Radiance cluster for the whole of spoiler season
                  (tests/radiance-spoiler-tracker.test.ts). */}
              {preReleaseLinks.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {preReleaseLinks.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-brand-400 hover:underline">{l.label} →</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {trackerOpen && <SetOwnedStatus setName={setName} trackerHref={`/portfolio/sets/${setSlug}`} freeLimit={FREE_PORTFOLIO_LIMIT} />}

          {/* Filters' "Show results" target, on the count row rather than the
              section; scroll-mt-36 clears the 125px sticky header (2026-09-23). */}
          <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3" aria-busy={loading != null}>
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-white">{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "card" : "cards"}
              {/* The panel's keyword box narrows the set's grid (buildCardWhere
                  reads `q`; never metered: a set page is not a site search). */}
              {searchQ && (
                <> for <span className="text-brand-400">“{searchQ}”</span></>
              )}
              {total > 0 && <span className="text-slate-600"> · page {page} of {totalPages}</span>}
              {loading && <span className="ml-2 text-xs text-slate-500">Loading {COUNTRIES[loading].adjective} prices…</span>}
            </p>
            <div className="flex items-center gap-3">
              <PageSizeSelect size={view.size} basePath={basePath} />
              <SortSelect basePath={basePath} defaultSort="name" />
            </div>
          </div>

          <ActiveFilters basePath={basePath} />

          {cards.length === 0 ? (
            <div className="card-surface grid place-items-center p-16 text-center">
              <p className="text-lg font-semibold text-white">Nothing matches those filters</p>
              <p className="mt-1 text-sm text-slate-400">Try clearing a filter or two.</p>
              <Link href={basePath} className="btn-primary mt-4">Reset</Link>
            </div>
          ) : (
            <>
              {/* Sized from the column's own width from lg, as on /browse
                  (2026-09-23): the rail and the sidebar squeeze it, and the
                  10.5rem floor keeps CardTile's min-w-[6.5rem] price block
                  inside the tile. */}
              {/* The ticks are portalled into the tiles on the client
                  (components/SetOwned.tsx SetTickLayer), found through this
                  one marker and paired with the ids by position, so the
                  page's HTML carries no tick markup. */}
              <div {...(trackerOpen ? { "data-tick-grid": "" } : {})} className="contents">
                <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
                  {cards.map((c) => (
                    <CardTile key={c.id} card={c} />
                  ))}
                </Reveal>
              </div>
              <Pagination page={page} totalPages={totalPages} params={params} basePath={basePath} />
            </>
          )}
        </section>
      </div>

      {/* Data-derived intro: scale and price coverage, the range and where the
          value is concentrated, the cards worth knowing about by name. Every
          figure comes from this set's own rows. Default view only. Below the
          grid since 2026-09-24 so the grid is above the fold. */}
      {intro.length > 0 && (
        <section aria-label={`About ${setName}`} className="card-surface p-5" data-set-intro>
          <div className="max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
            {intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* The set's full price list (2026-09-24). "price guide" queries rank this
          page at 7-9 with no clicks, and the page had a 60-card grid but no
          list of every card's price on it. Default view only — it reads the
          same cached query as the intro above. */}
      <SetPriceGuide setName={setName} rows={priceGuide} currency={view.currency} adjective={view.adjective} ticks={trackerOpen} />

      {/* How to read the prices above (2026-09-26, "Blog and tools, joined up"
          in DECISIONS.md). Under the grid and the price guide like the intro,
          and ahead of the set's guides and the eBay block, so our own writing
          leads the commercial one. The middle paragraph is built from this
          set's own price guide (its dearest and cheapest cards, the rarity
          filling its top ten); the method sentences around it are shared on
          purpose. Released sets only: a set still in preview has no prices to
          read, and its reading list is the pre-release links above. */}
      {live && totalInSet > 0 && (
        <section aria-labelledby="set-read-h" className="card-surface p-5 sm:p-6">
          <h2 id="set-read-h" className="text-xl font-extrabold text-white">How to read {setName} prices</h2>
          <div className="mt-2 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
            <p>
              Each price on this page is the cheapest in-stock listing we have for that card in{" "}
              {view.place}, in {view.currency}: the item price, before postage.{" "}
              {priced.toLocaleString("en-US")} of {setName}&apos;s {totalInSet.toLocaleString("en-US")} cards have one right now
              {priced < totalInSet ? `; the other ${(totalInSet - priced).toLocaleString("en-US")} show no price until a seller in ${view.place} lists them in stock` : ""}.
              Prices come from two imports a day, at 07:00 and 19:00 UTC.
            </p>
            {guideTop && (
              <p>
                The dearest {setName} card in {view.place} right now is {guideTop.name}, at{" "}
                {formatMoney(guideTop.priceCents, view.currency)}
                {guideLow && (
                  <>
                    ; the cheapest priced one is {guideLow.name}, at{" "}
                    {formatMoney(guideLow.priceCents, view.currency)}
                  </>
                )}
                .{topTenRarity && <> {topTenRarity.n} of the ten dearest are {topTenRarity.rarity} cards.</>} The
                price guide lists all {priceGuide.length.toLocaleString("en-US")} cards dearest first; the grid above opens A–Z
                and can be re-sorted and filtered.
              </p>
            )}
            <p>
              Open any card for every store&apos;s price in {view.place}, cheapest first by item price,
              with the delivered total shown where the store publishes its postage — most stores quote it only at
              checkout. To cost a whole want-list with each store&apos;s measured postage, use{" "}
              <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link>; to weigh
              buying these singles against opening sealed product, the{" "}
              <Link href="/tools/box-ev" className="text-brand-400 hover:underline">box EV calculator</Link>.
            </p>
            {rbs}
          </div>
        </section>
      )}
    </>
  );
}
