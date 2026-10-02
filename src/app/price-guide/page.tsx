import type { Metadata } from "next";
import Link from "next/link";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES, normalizeCountry, type Country } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { parsePageNum, parsePageSize } from "@/lib/cards";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { guidesForTool } from "@/lib/content/tool-guides";
import { getPriceGuideChanges, loadPriceGuideRows } from "@/lib/price-guide";
import {
  filterGuideRows,
  guideMarketIndex,
  guideStats,
  listedGuideRows,
  normalizeGuideSort,
  parseGuideQuery,
  pricesBySet,
  sortGuideRows,
  thirtyDayCoverage,
  THIRTY_DAY_MIN_COVERAGE,
  type RawSearchParams,
} from "@/lib/price-guide-query";
import {
  PRICE_GUIDE_FAQ,
  PRICE_GUIDE_PATH,
  priceGuideDescription,
  priceGuideIndexing,
  priceGuideTitle,
} from "@/lib/price-guide-seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubIntro } from "@/components/HubIntro";
import { HubFaq } from "@/components/HubFaq";
import { RelatedGuides } from "@/components/RelatedGuides";
import { AdSlot } from "@/components/AdSlot";
import { Filters } from "@/components/Filters";
import { ActiveFilters } from "@/components/ActiveFilters";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { PriceGuideNavProvider, PriceGuideBusyRegion } from "@/components/price-guide/PriceGuideNav";
import { PriceGuideToolbar } from "@/components/price-guide/PriceGuideToolbar";
import { PriceGuideTable, type GuideTableItem } from "@/components/price-guide/PriceGuideTable";
import { PriceGuideSummary } from "@/components/price-guide/PriceGuideSummary";

// THE SITE-WIDE RIFTBOUND PRICE GUIDE (DECISIONS.md, "Site-wide price guide at
// /price-guide: one cached catalogue, filtered in memory", 2026-10-02).
//
// force-dynamic over ONE cached catalogue — the /sealed shape. The page reads
// searchParams (filters, sort, paging, market), so every view is server-
// rendered and crawlable, but it never queries per request: the rows come from
// lib/price-guide.ts's in-process memo over a CONTENT_TAG Data Cache entry, and
// filtering, sorting and paging happen here, in memory. No revalidate, no
// generateStaticParams and no loading.tsx (scripts/adsense-guard.ts §1c: a
// route-level Suspense boundary over searchParams served crawlers a spinner).
//
// Owns the UNSCOPED "riftbound price guide / price list" (docs/seo-keyword-map.md);
// "Riftbound card prices" stays the homepage's head term, so it is never the
// lead of this title, H1 or description (lib/price-guide-seo.ts).
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: RawSearchParams }): Promise<Metadata> {
  const rows = await loadPriceGuideRows();
  const listed = rows ? listedGuideRows(rows).length : null;
  const totalPages = listed != null ? Math.max(1, Math.ceil(listed / parsePageSize(undefined))) : null;
  const ix = priceGuideIndexing(searchParams, totalPages);
  const title = priceGuideTitle(listed, ix.page, totalPages);
  const description = priceGuideDescription(listed, ix.page, totalPages);
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(ix.canonical),
    openGraph: pageOpenGraph({ title, description, url: ix.canonical }),
    ...(ix.index ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function PriceGuidePage({ searchParams }: { searchParams: RawSearchParams }) {
  const marketParam = one(searchParams.market);
  const country: Country = marketParam ? normalizeCountry(marketParam) : getCountry();
  const place = COUNTRIES[country].place;
  // A UK-market visitor in Europe may read the GBP listings in euros (the
  // /sealed precedent): a display conversion, applied to every figure shown
  // and to the min/max filter, which the visitor types in that same currency.
  const display = getDisplayCurrency(country);
  const toDisplay = country === "UK" && display === "EUR" ? gbpCentsToEur : (c: number) => c;
  const mi = guideMarketIndex(country);

  const [rows, changes] = await Promise.all([loadPriceGuideRows(), getPriceGuideChanges()]);
  const listed = rows ? listedGuideRows(rows) : [];
  const query = parseGuideQuery(searchParams);
  const sort = normalizeGuideSort(query.sort);
  const filtered = filterGuideRows(listed, query, country, { toDisplayCents: toDisplay });
  const sorted = sortGuideRows(filtered, sort, country, changes?.d7 ?? null);
  const size = parsePageSize(query.size);
  const page = parsePageNum(query.page);
  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const pageRows = sorted.slice((page - 1) * size, page * size);
  const showD30 = changes ? thirtyDayCoverage(listed, country, changes.d30) >= THIRTY_DAY_MIN_COVERAGE : false;

  const items: GuideTableItem[] = pageRows.map((row) => {
    const p = row.p[mi];
    return {
      row,
      price: p != null ? toDisplay(p) : null,
      stores: row.s[mi] ?? 0,
      d7: changes?.d7.get(row.id) ?? null,
      d30: changes?.d30.get(row.id) ?? null,
    };
  });

  const stats = guideStats(listed, country, toDisplay);
  const bySet = pricesBySet(listed, country, toDisplay);
  const pricedHere = sorted.reduce((n, r) => n + (r.p[mi] != null ? 1 : 0), 0);
  const isFiltered = Object.entries(searchParams).some(
    ([k, v]) => !["page", "size", "sort", "market"].includes(k) && one(v) != null && one(v) !== "",
  );
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, sorted.length);

  // JSON-LD: market-neutral (no prices), and only the rows this URL renders.
  const cleanPages = rows ? Math.max(1, Math.ceil(listed.length / parsePageSize(undefined))) : null;
  const ix = priceGuideIndexing(searchParams, cleanPages);
  const description = priceGuideDescription(rows ? listed.length : null, ix.page, cleanPages);
  const collectionLd = {
    ...webPage({ type: "CollectionPage", name: "Riftbound Price Guide", href: ix.canonical, description }),
    ...(pageRows.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: pageRows.map((r, i) => ({
              "@type": "ListItem",
              position: (page - 1) * size + i + 1,
              name: r.dn,
              url: SITE_URL + cardHref(r),
            })),
          },
        }
      : {}),
  };

  const asOf = changes?.asOf ? new Date(changes.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const flatParams = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, one(v)]));
  // "Back to page 1" keeps every filter, sort and market; only `page` goes.
  const pageOneQs = new URLSearchParams(
    Object.entries(flatParams).filter((e): e is [string, string] => e[0] !== "page" && !!e[1]),
  ).toString();
  const pageOneHref = PRICE_GUIDE_PATH + (pageOneQs ? `?${pageOneQs}` : "");

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(collectionLd, faqPage(PRICE_GUIDE_FAQ)) }} />
      <Breadcrumbs trail={[{ name: "Price guide", href: PRICE_GUIDE_PATH }]} />

      <header className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-white">Riftbound Price Guide</h1>
        <HubIntro path="/price-guide" />
      </header>

      {rows === null ? (
        <EmptyState
          icon="prices"
          title="The price list is being refreshed"
          body="Card prices are briefly unavailable while we reload them. Every card page still shows its own store prices, and this list will be back shortly."
          primary={{ href: "/browse", label: "Open the card database" }}
        />
      ) : (
        <>
          <PriceGuideSummary stats={stats} sets={bySet} currency={display} place={place} />

          <div className="mt-6 flex flex-col gap-6 xl:flex-row">
            <Filters basePath={PRICE_GUIDE_PATH} currency={display} hidePreorderSets />

            <section id="results" aria-label="Price list" className="min-w-0 flex-1 scroll-mt-header">
              <PriceGuideNavProvider>
                <PriceGuideToolbar
                  q={one(searchParams.q) ?? ""}
                  size={size}
                  marketOverride={marketParam ? place : null}
                >
                  {pageRows.length > 0 ? (
                    <p>
                      Showing{" "}
                      <span className="num font-semibold text-white">
                        {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")}
                      </span>{" "}
                      of <span className="num font-semibold text-white">{sorted.length.toLocaleString("en-US")}</span>{" "}
                      {sorted.length === 1 ? "card" : "cards"}
                      <span className="text-slate-500">
                        {" "}
                        · {pricedHere.toLocaleString("en-US")} priced in {place}
                      </span>
                    </p>
                  ) : sorted.length > 0 ? (
                    <p>
                      <span className="num font-semibold text-white">{sorted.length.toLocaleString("en-US")}</span>{" "}
                      {sorted.length === 1 ? "card" : "cards"}
                      <span className="text-slate-500"> · 0 on this page</span>
                    </p>
                  ) : (
                    <p>
                      <span className="num font-semibold text-white">0</span> of{" "}
                      <span className="num">{listed.length.toLocaleString("en-US")}</span> cards match these filters
                    </p>
                  )}
                </PriceGuideToolbar>

                <ActiveFilters basePath={PRICE_GUIDE_PATH} currency={display} />

                {sorted.length === 0 ? (
                  <EmptyState
                    icon="prices"
                    title={`0 of ${listed.length.toLocaleString("en-US")} cards match these filters`}
                    body="Loosen a filter or clear the search to bring cards back into the list."
                    primary={{ href: PRICE_GUIDE_PATH, label: "Reset" }}
                  />
                ) : pageRows.length === 0 ? (
                  <EmptyState
                    icon="prices"
                    title={`This list has ${totalPages} ${totalPages === 1 ? "page" : "pages"}`}
                    body="The page in this link is past the end of the list."
                    primary={{ href: pageOneHref, label: "Back to page 1" }}
                  />
                ) : (
                  <PriceGuideBusyRegion>
                    <PriceGuideTable
                      items={items}
                      currency={display}
                      sort={sort}
                      showD30={showD30}
                      caption={`Riftbound card prices in ${place}, ${display}, cards ${start} to ${end} of ${sorted.length}`}
                    />
                  </PriceGuideBusyRegion>
                )}
              </PriceGuideNavProvider>

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                7-day change: the week-on-week move in the cheapest price across Australia, the US, the UK and
                Singapore, in US dollars, so it is the same in every market
                {asOf ? <>, to the week of {asOf}</> : null}. Blank until a card has two weekly prices on the current
                basis{changes === null ? "; the weekly figures are unavailable right now" : ""}.
                {showD30
                  ? " 30-day change: the same US-dollar basis over about a month, so it is also the same in every market; blank until a card has about a month of weekly prices."
                  : null} A dash in the price
                column means no store or eBay seller we track has that printing in stock in {place}.
              </p>

              <Pagination page={page} totalPages={totalPages} params={flatParams} basePath={PRICE_GUIDE_PATH} />
            </section>
          </div>
        </>
      )}

      <RelatedGuides guides={guidesForTool("/price-guide")} />

      <section className="mt-8 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400" aria-labelledby="pg-how">
        <h2 id="pg-how" className="text-lg font-bold text-white">
          How to read this price guide
        </h2>
        <p>
          Each row is one printing, and its price is the lowest asking price we found on an in-stock listing in{" "}
          {place}, in {display}: the item alone, with postage on top at the seller&apos;s checkout. Open a card to see
          every store and eBay listing behind that figure, cheapest first, and the delivered total wherever a store
          publishes its postage.
        </p>
        <p>
          The list opens dearest first. Sort a column header for the cheapest cards, the biggest weekly moves or the
          printings most widely in stock, and use the filters to cut it down to one set, rarity, domain, card type or
          printing.{isFiltered ? null : <> Each set&apos;s own table lives on its <Link href="/sets" className="text-brand-400 hover:underline">set page</Link>.</>}
        </p>
      </section>

      <HubFaq faqs={PRICE_GUIDE_FAQ} />

      <AdSlot format="horizontal" height={90} className="mt-6" />
    </div>
  );
}
