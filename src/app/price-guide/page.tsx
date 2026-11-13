import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_COUNTRY, normalizeCountry, type Country } from "@/lib/country";
import { parsePageSize } from "@/lib/cards";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { guidesForTool } from "@/lib/content/tool-guides";
import { loadPriceGuideRows } from "@/lib/price-guide";
import { listedGuideRows, type RawSearchParams } from "@/lib/price-guide-query";
import { buildPriceGuideView, priceGuideQuery } from "@/lib/price-guide-view";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { PriceGuideMarketBoard, PriceGuideMarketWord } from "@/components/price-guide/PriceGuideMarketBoard";

// THE SITE-WIDE RIFTBOUND PRICE GUIDE (DECISIONS.md, "Site-wide price guide at
// /price-guide: one cached catalogue, filtered in memory", 2026-10-02).
//
// ONE CDN COPY PER URL, KEPT SIX HOURS (2026-11-05, DECISIONS.md "The price guide
// becomes one CDN copy per URL"). force-dynamic over ONE cached catalogue — the
// /sealed shape. The page reads searchParams (filters, sort, paging, market), so
// every view is server-rendered and crawlable, but it never queries per request:
// the rows come from lib/price-guide.ts's in-process memo over a CONTENT_TAG Data
// Cache entry, and filtering, sorting and paging happen in lib/price-guide-view.ts,
// in memory. Until 2026-11-05 it ALSO read the market cookie (getCountry), so
// every visit was a function render no cache could share. Now it renders the
// baseline market (DEFAULT_COUNTRY, the US; or the market a `?market=` link pins,
// which is part of the URL) into its HTML, and next.config.js (`/price-guide`,
// QUERY_CDN_PAGES) keeps the response at Vercel's CDN, one copy per URL (the
// query string is part of the key). The market-dependent body is the
// PriceGuideMarketBoard island, which swaps in the visitor's market from
// /api/price-guide-view (the same computation, also CDN-kept). Nothing in this
// page's server tree reads a cookie, a header or the session
// (tests/card-cdn.test.ts walks it). No revalidate, no generateStaticParams and
// no loading.tsx (scripts/adsense-guard.ts §1c: a route-level Suspense boundary
// over searchParams served crawlers a spinner).
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
  // A `?market=` link pins the market: it is part of the URL (and so of the CDN
  // key), and it outranked the cookie before too. Otherwise the HTML carries the
  // baseline market and the island fetches the visitor's.
  const marketParam = one(searchParams.market);
  const country: Country = marketParam ? normalizeCountry(marketParam) : DEFAULT_COUNTRY;
  const pinned = !!marketParam;
  const [rows, view] = await Promise.all([loadPriceGuideRows(), buildPriceGuideView(country, searchParams)]);
  const listed = rows ? listedGuideRows(rows) : [];
  const isFiltered = Object.entries(searchParams).some(
    ([k, v]) => !["page", "size", "sort", "market"].includes(k) && one(v) != null && one(v) !== "",
  );

  // JSON-LD: market-neutral (no prices), and only the rows this URL renders.
  const cleanPages = rows ? Math.max(1, Math.ceil(listed.length / parsePageSize(undefined))) : null;
  const ix = priceGuideIndexing(searchParams, cleanPages);
  const description = priceGuideDescription(rows ? listed.length : null, ix.page, cleanPages);
  const pageRows = view?.items.map((it) => it.row) ?? [];
  const collectionLd = {
    ...webPage({ type: "CollectionPage", name: "Riftbound Price Guide", href: ix.canonical, description }),
    ...(view && pageRows.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: pageRows.map((r, i) => ({
              "@type": "ListItem",
              position: (view.page - 1) * view.size + i + 1,
              name: r.dn,
              url: SITE_URL + cardHref(r),
            })),
          },
        }
      : {}),
  };

  const word = (what: "place" | "currency") => <PriceGuideMarketWord baseline={country} pinned={pinned} what={what} />;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(collectionLd, faqPage(PRICE_GUIDE_FAQ)) }} />
      <Breadcrumbs trail={[{ name: "Price guide", href: PRICE_GUIDE_PATH }]} />

      <header className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-white">Riftbound Price Guide</h1>
        <HubIntro path="/price-guide" />
      </header>

      {view === null ? (
        <EmptyState
          icon="prices"
          title="The price list is being refreshed"
          body="Card prices are briefly unavailable while we reload them. Every card page still shows its own store prices, and this list will be back shortly."
          primary={{ href: "/browse", label: "Open the card database" }}
        />
      ) : (
        /* The stat strip, filters, toolbar, table and pager, then prices by set
           (under the list since 2026-11-13), for the visitor's market; the HTML
           carries the baseline market's. */
        <PriceGuideMarketBoard baseline={view} query={priceGuideQuery(searchParams)} pinned={pinned} />
      )}

      <RelatedGuides guides={guidesForTool("/price-guide")} />

      <section className="mt-8 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400" aria-labelledby="pg-how">
        <h2 id="pg-how" className="text-lg font-bold text-white">
          How to read this price guide
        </h2>
        <p>
          Each row is one printing, and its price is the lowest asking price we found on an in-stock listing in{" "}
          {word("place")}, in {word("currency")}: the item alone, with postage on top at the seller&apos;s checkout. Open a card to see
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
