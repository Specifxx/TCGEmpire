import Link from "next/link";
import { getPopularCards } from "@/lib/cheapest-cards";
import { getHomeStats } from "@/lib/home-stats";
import { getCachedTopDeals, type TopDeals } from "@/lib/top-deals";
import { getRecentlyUpdated, getPriceMovers, type PriceMovers } from "@/lib/price-history";
import { COUNTRIES, COUNTRY_LIST, type Country } from "@/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "@/lib/seo";
import { ebayLabel } from "@/lib/affiliate";
import { CinematicHero } from "./CinematicHero";
import { HomeSections } from "./HomeSections";
import { PriceTodayTable } from "./PriceTodayTable";
import { EditorialHub } from "./EditorialHub";
import { getPriceTable } from "@/lib/price-table";
import { webPage, faqPage, breadcrumb, ldJson } from "@/lib/jsonld";

// Every market, so the cross-market strips on a region page show them all.
// Derived rather than hand-listed would be better still, but this file needs a
// stable ARRAY order for the Promise.all/zip below, and COUNTRY_LIST is that
// order — see the import.
const COUNTRY_CODES: Country[] = COUNTRY_LIST.map((c) => c.code);

// Region home pages (/au, /uk, /sg, /ca — see app/au/page.tsx etc): the
// homepage's own hero/search/stat building blocks, reused rather than
// duplicated, PLUS the exact same feature set as "/" (Market Pulse, the
// popular-cards carousel, Today's Top Deals, How It Works, Explore, reviews,
// partners — see HomeSections.tsx), PLUS genuinely region-specific content
// below all of that (real counts from THIS market, a link to that market's
// own buying guide, a region-scoped FAQ).
//
// AN EARLIER VERSION OF THIS PAGE deliberately left HomeSections' entire
// feature set out, reasoning that four near-identical copies of it would be
// the near-duplicate-content problem this site's SEO work has fought
// elsewhere. In practice that made the region toggle in the hero feel
// broken: picking AU/UK/SG/CA silently dropped the site down to a stub
// page with the deals ticker, movers, popular cards and How It Works all
// gone. A visitor who picks a market must land on the SAME site, not a
// thinner one — see the region-specific block below for how the genuine
// per-market content (real counts, that market's own buying guide, a
// region-scoped FAQ) still earns the page its own query without needing to
// starve it of the features every other page on the site has.
//
// The underlying data reuses the SAME caches "/" already populates
// (getCachedTopDeals/getPriceMovers/getRecentlyUpdated are all keyed by
// market, not by route — see their own doc comments), so this costs no
// extra DB egress beyond what "/" was already computing once an hour.
export async function RegionHome({ region }: { region: Country }) {
  const info = COUNTRIES[region];
  const [
    { totalCards, statsByCountry, freshness },
    popularCards,
    topDealsArr,
    recentlyUpdated,
    moversArr,
    priceTable,
  ] = await Promise.all([
    getHomeStats(),
    getPopularCards(12, region),
    Promise.all(COUNTRY_CODES.map((c) => getCachedTopDeals(c))),
    getRecentlyUpdated(region, 24),
    Promise.all(COUNTRY_CODES.map((c) => getPriceMovers(c, 6))),
    getPriceTable(region),
  ]);
  const trendingCards = popularCards.slice(0, 6);
  const stat = statsByCountry[region];
  const storeWord = stat.stores === 1 ? "store" : "stores";
  const guideSlug = COUNTRY_GUIDE_SLUGS[region];
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const moversByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, moversArr[i]])) as Record<Country, PriceMovers>;

  // Both answers corrected 2026-09-26 ("Blog and tools, joined up" in
  // DECISIONS.md). The first claimed a ranking "by total delivered cost":
  // computeMarket (lib/market-rows.ts) sorts by item price, with postage only
  // breaking ties and a delivered total only where the store publishes it. The
  // second said "no conversion" in every market, but Canada's "eBay US" rows
  // are US listings the import converts to CAD (lib/price-import.ts).
  const faqs = [
    {
      q: `Where can I buy Riftbound cards in ${info.place}?`,
      a: `RiftCompare tracks ${stat.stores} ${info.adjective} ${storeWord} stocking Riftbound: League of Legends TCG singles and sealed product, plus ${ebayLabel(region)}, and lists every result cheapest first by item price. Where a store publishes its postage to ${info.place}, the delivered total is shown beside the price; otherwise postage is added at that store's checkout.`,
    },
    {
      q: `Are prices shown in ${info.currency}?`,
      a:
        region === "CA"
          ? `Yes — every store price on this page and across the ${info.adjective} store listings is in ${info.currency}, the currency those stores charge in. Two kinds of figure are converted at our reference rate: rows marked "eBay US", which are US listings, and figures from our weekly worldwide price history, such as the 7-day change and price drops.`
          : `Yes — every store price on this page and across the ${info.adjective} store listings is in ${info.currency}, the real currency those stores charge in. Figures from our weekly worldwide price history, such as the 7-day change and price drops, are converted into ${info.currency} at our reference rate.`,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        trendingCards={trendingCards}
        freshness={freshness}
        region={{ code: region, adjective: info.adjective }}
      />

      {/* Guides, news & market updates, in the same slot as on "/": directly
          under the hero, above the price table (owner, 2026-09-28; see
          EditorialHub.tsx). `market` makes "Start here" lead with this
          market's own buying guide. */}
      <EditorialHub freshness={freshness} market={region} />

      <PriceTodayTable
        rows={priceTable}
        country={region}
        totalPriced={stat.priced}
        buyingGuide={guideSlug ? { href: `/blog/${guideSlug}`, label: `Buying in ${info.place}` } : undefined}
      />

      {/* The full "/" feature set — Top Deals, eBay Picks, popular cards, How
          It Works, Explore, reviews, partners — see HomeSections.tsx and this
          file's own header comment for why this exists here now. */}
      <HomeSections
        country={region}
        totalCards={totalCards}
        storeCount={stat.stores}
        storeWord={storeWord}
        // The "Most popular" shelf is back (owner, 2026-09-26); the price table
        // keeps the ItemList for these cards when it renders.
        popularCards={popularCards}
        popularItemList={priceTable.length === 0}
        topDealsByCountry={topDealsByCountry}
        moversByCountry={moversByCountry}
        recentlyUpdated={recentlyUpdated}
      />

      <section className="container-app">
        <h2 className="text-xl font-extrabold text-white">Buying Riftbound cards in {info.place}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare compares live prices across {stat.stores} {info.adjective} {storeWord} for Riftbound: League of
          Legends TCG — {stat.priced.toLocaleString()} cards priced so far. Each card&apos;s stores are listed cheapest
          first by item price, with the delivered total beside any store that publishes its {info.adjective} postage,
          and store prices are imported twice a day. It&apos;s the same database and the same ranking logic used
          everywhere else on the site, scoped to what&apos;s actually available in {info.place}.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse the full database →
          </Link>
          <Link href="/stores/tracked" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            See every store we track →
          </Link>
          <Link href="/methodology" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Read our methodology →
          </Link>
          <Link href="/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse by set →
          </Link>
          <Link href="/deck" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Price a decklist →
          </Link>
          {guideSlug && (
            <Link href={`/blog/${guideSlug}`} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              Full {info.label} buying guide →
            </Link>
          )}
        </div>

        <div className="mt-6 divide-y divide-ink-800 border-t border-ink-800">
          {faqs.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-white [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <svg
                  className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({
              name: `RiftCompare ${info.label} — Riftbound Card Prices`,
              href: `/${region.toLowerCase()}`,
              description: `Compare live Riftbound TCG card prices across ${info.adjective} stores and ${ebayLabel(region)}, in ${info.currency}: cheapest first by item price, with the delivered total where the store publishes its postage.`,
              type: "CollectionPage",
            }),
            breadcrumb([{ name: info.label, href: `/${region.toLowerCase()}` }]),
            faqPage(faqs),
          ),
        }}
      />
    </div>
  );
}
