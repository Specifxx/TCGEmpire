import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/country";
import { riftboundEbayQuery } from "@/lib/affiliate";
import { newestReleasedSet, SETS } from "@/lib/constants";
import { buildSealedView, isFilteredParams, one, sealedQuery, type SealedParams } from "@/lib/sealed-view";
import { SealedMarketBoard } from "@/components/SealedMarketBoard";
import { SealedMarketplaceSearches } from "@/components/SealedMarketplaceSearches";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// ONE CDN COPY PER URL, KEPT SIX HOURS (2026-11-05, DECISIONS.md "The sealed page
// becomes one CDN copy per URL"). The page reads searchParams (q/type/set/min/max/
// instock/atmsrp/sort), which made it dynamic all along: until 2026-11-05 it ALSO
// read the market cookie (getCountry), so every visit was a function render that no
// cache could share. Now it is force-dynamic on purpose, renders the baseline
// market (DEFAULT_COUNTRY, the US) into its HTML, and next.config.js (`/sealed`,
// QUERY_CDN_PAGES) keeps the response at Vercel's CDN, one copy per URL (the query
// string is part of the key). The market-dependent body is the SealedMarketBoard
// island, which swaps in the visitor's market from /api/sealed-view (the same
// computation, lib/sealed-view.ts, also CDN-kept). Nothing in this page's server
// tree reads a cookie, a header or the session (tests/card-cdn.test.ts walks it).
//
// It was `revalidate = 86400` alongside a sealed/loading.tsx before that. That
// pair — an ISR window on a page that ALSO reads searchParams, with a route-level
// Suspense boundary — meant the first request for any filter combination the
// cache hadn't seen returned the loading spinner as the COMPLETE response.
export const dynamic = "force-dynamic";

// The first search follows the newest released set (2026-09-26, "Pushing eBay
// clicks" in DECISIONS.md) instead of naming one: it read "Vendetta sealed"
// and would have kept pointing at Vendetta after Radiance shipped. A function,
// not a constant, for the reason newestReleasedSet() takes `now`: a module-level
// value would freeze the set for the life of the process.
function sealedSearches(now: Date = new Date()): { label: string; q: string }[] {
  const current = newestReleasedSet(now);
  return [
    ...(current ? [{ label: `${current.name} sealed`, q: riftboundEbayQuery(`${current.name} sealed`) }] : []),
    { label: "Booster boxes", q: "Riftbound booster box" },
    { label: "Booster packs", q: "Riftbound booster pack" },
    { label: "Proving Grounds kits", q: "Riftbound Proving Grounds" },
    { label: "All sealed Riftbound", q: "Riftbound TCG sealed" },
  ];
}

// Internal search-result views (?q=) are noindex'd (Google/Bing discourage indexing
// site-search results); every variant canonicalises to the clean /sealed so crawl
// signals concentrate on the one page we want ranked. Mirrors browse/page.tsx.
export async function generateMetadata({ searchParams }: { searchParams: SealedParams }): Promise<Metadata> {
  const q = one(searchParams.q).trim();
  return {
    title: q
      ? `${q} — Riftbound sealed products`
      : "Riftbound Sealed Prices — Boxes, Packs & Sets",
    // Market-neutral since 2026-09-26: it named four markets (sealed is read
    // wherever we track stores) and said "daily" of an import that runs twice a
    // day (.github/workflows/refresh-prices.yml).
    description:
      "Compare prices on Riftbound booster boxes, packs, bundles & Proving Grounds across the stores we track in your market, with an at-MSRP flag — find the cheapest sealed. Updated twice a day.",
    alternates: pageAlternates("/sealed"),
    robots: isFilteredParams(searchParams) ? { index: false, follow: true } : undefined,
  };
}

export default async function SealedPage({ searchParams }: { searchParams: SealedParams }) {
  // The baseline market's view goes into the HTML (and the JSON-LD); the island
  // fetches any other market's. The same filters, sort and sold-out mark for both.
  const view = await buildSealedView(DEFAULT_COUNTRY, searchParams);
  const { groups, priceCountry } = view;
  const q = one(searchParams.q).trim();
  const newest = newestReleasedSet();
  // The newest-set callout shows only on the unfiltered view, and only when
  // that set's sealed actually exists in the feed.
  const featuredSet = view.featuredSetCode ? SETS.find((s) => s.code === view.featuredSetCode) ?? null : null;

  // Structured data: BreadcrumbList (mirrors the visible nav) + an ItemList of the
  // rendered groups. Google requires a Product to carry "offers", "review", or
  // "aggregateRating" — a Product without any of these is a Search Console error
  // (flagged live: every currently-out-of-stock Champion Deck etc. was emitting a
  // bare Product with no offers). So a group only gets a ListItem at all when it
  // has a live price AND ≥1 in-stock listing to back a real AggregateOffer;
  // out-of-stock/unpriced groups are omitted from the structured data entirely
  // (they still render as a normal, visible "out of stock" tile on the page).
  // It states the baseline market's REAL currency, as the card page's does.
  const currency = COUNTRIES[priceCountry].currency;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Sealed", item: `${SITE_URL}/sealed` },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound Sealed Products",
    url: `${SITE_URL}/sealed`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    itemListElement: groups
      .filter((g) => g.lowestPriceCents != null && g.listings.some((l) => l.inStock))
      .map((g, i) => {
        const inStock = g.listings.filter((l) => l.inStock);
        const inStockCount = inStock.length;
        // highPrice: the dearest in-stock listing the tile's comparison shows,
        // never below lowPrice (the group's low can come from a fresher read).
        const highCents = Math.max(g.lowestPriceCents!, ...inStock.map((l) => l.priceCents));
        return {
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: g.name,
            category: "Trading Card Game Sealed Product",
            ...(g.imageUrl ? { image: g.imageUrl.startsWith("http") ? g.imageUrl : `${SITE_URL}${g.imageUrl}` } : {}),
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: currency,
              lowPrice: (g.lowestPriceCents! / 100).toFixed(2),
              highPrice: (highCents / 100).toFixed(2),
              offerCount: inStockCount,
              availability: "https://schema.org/InStock",
            },
          },
        };
      }),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, itemListLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Sealed</span>
      </nav>

      {/* Compact hero: flat panel with a brand accent rule. */}
      <section className="card-surface mb-5 overflow-hidden border-l-2 border-brand-500 bg-ink-900">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-extrabold text-white">Sealed Products</h1>
          {/* How to read a tile, what MSRP means and the guides (2026-09-26,
              "Blog and tools, joined up"): lib/content/hub-intros.ts. It
              replaced a one-line lede; the box EV link moved into it. */}
          <HubIntro path="/sealed" />
          {q && (
            <p className="mt-2 text-sm text-slate-400">
              Showing matches for <span className="text-brand-400">“{q}”</span>.{" "}
              <Link href="/sealed" className="text-brand-400 hover:underline">Show all</Link>
            </p>
          )}
        </div>
      </section>

      {/* Newest-set callout — only on the default (unfiltered) view. "Newest
          set", not "NEW": newestReleasedSet() is the newest set however long
          ago it shipped. Brand, not gold: gold marks Premium. */}
      {featuredSet && newest && (
        <div className="card-surface mb-5 flex flex-wrap items-center gap-3 border-l-2 border-brand-500 bg-ink-900 px-5 py-4">
          <span className="chip bg-brand-500/15 font-semibold text-brand-300">Newest set</span>
          {/* basis-56 (2026-09-23): flex-1 alone is a 0 basis, so this flex-wrap
              row never wrapped and the copy took all the squeeze (72px, 11 lines
              at 344). Now the button wraps below once the copy drops under 14rem. */}
          <p className="min-w-0 flex-1 basis-56 text-sm text-slate-300">
            <span className="font-semibold text-white">{featuredSet.name} sealed</span> — product from the newest
            released set, priced across stores.
          </p>
          <Link href={`/sealed?set=${featuredSet.code}`} className="btn-primary px-3 py-1.5 text-xs">
            Shop {featuredSet.name} →
          </Link>
        </div>
      )}

      {/* The filters, count, sort and grid for the visitor's market; the HTML
          carries the baseline market's (see the island). */}
      <SealedMarketBoard baseline={view} query={sealedQuery(searchParams)} />

      {/* The guides that explain this page, after its own data and before the
          marketplace searches below: our content leads, the affiliate block
          follows (lib/content/tool-guides.ts). */}
      <RelatedGuides guides={guidesForTool("/sealed")} className="card-surface mt-8 p-5" />

      {/* High-AOV marketplace searches: sealed boxes are the biggest baskets on the
          site, and eBay/Amazon both carry them. Affiliate-tagged per market, in the
          browser (SealedMarketplaceSearches). */}
      <section className="card-surface mt-8 p-5">
        <h2 className="text-lg font-extrabold text-white">Search the big marketplaces too</h2>
        {/* Reworded 2026-09-26: it said eBay and Amazon "often have stock (or
            better prices) when stores don't". Nothing here measures either
            against the stores, or knows what they list today, so the copy
            offers a search and claims neither a price nor stock. */}
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Boxes sell out and restock constantly, so it can be worth searching eBay and Amazon as well
          before you buy.
        </p>
        <SealedMarketplaceSearches searches={sealedSearches()} />
        {/* Amazon's own required statement, beside the Amazon links it covers;
            the eBay line is the "both" disclosure at the foot of the page. */}
        <AffiliateDisclosure partner="amazon" />
      </section>


      <div className="mt-6 text-center">
        <p className="text-[11px] text-slate-500">
          Sealed prices are collected from public store listings and may change.
        </p>
        <AffiliateDisclosure partner="both" tight />
      </div>
    </div>
  );
}
