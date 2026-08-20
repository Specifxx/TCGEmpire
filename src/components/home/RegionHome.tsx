import Link from "next/link";
import { getPopularCards } from "@/lib/cheapest-cards";
import { getHomeStats } from "@/lib/home-stats";
import { getCachedTopDeals, type TopDeals } from "@/lib/top-deals";
import { getRecentlyUpdated, getPriceMovers, type PriceMovers } from "@/lib/price-history";
import { COUNTRIES, type Country } from "@/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "@/lib/seo";
import { CinematicHero } from "./CinematicHero";
import { HomeSections } from "./HomeSections";
import { webPage, faqPage, breadcrumb, ldJson } from "@/lib/jsonld";

const COUNTRY_CODES: Country[] = ["AU", "US", "UK", "SG", "CA"];

// Region home pages (/au, /uk, /sg, /ca — see app/au/page.tsx etc): the
// homepage's own hero/search/stat building blocks, reused rather than
// duplicated, PLUS the exact same feature set as "/" (Today's Top Deals,
// Market Pulse, the popular-cards carousel, How It Works, Explore, reviews,
// partners — see HomeSections.tsx), PLUS genuinely region-specific content
// below all of that (real counts from THIS market, a link to that market's
// own buying guide, a region-scoped FAQ).
//
// AN EARLIER VERSION OF THIS PAGE deliberately left HomeSections' entire
// feature set out, reasoning that five near-identical copies of it would be
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
    popularVendetta,
    topDealsArr,
    recentlyUpdated,
    moversArr,
  ] = await Promise.all([
    getHomeStats(),
    getPopularCards(12, region),
    getPopularCards(8, region, "VEN"),
    Promise.all(COUNTRY_CODES.map((c) => getCachedTopDeals(c))),
    getRecentlyUpdated(region, 24),
    Promise.all(COUNTRY_CODES.map((c) => getPriceMovers(c, 6))),
  ]);
  const trendingCards = popularCards.slice(0, 6);
  const stat = statsByCountry[region];
  const storeWord = stat.stores === 1 ? "store" : "stores";
  const guideSlug = COUNTRY_GUIDE_SLUGS[region];
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const moversByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, moversArr[i]])) as Record<Country, PriceMovers>;

  const faqs = [
    {
      q: `Where can I buy Riftbound cards in ${info.place}?`,
      a: `RiftCompare tracks ${stat.stores} ${info.adjective} ${storeWord} stocking Riftbound: League of Legends TCG singles and sealed product, plus eBay ${region}, and ranks every result by total delivered cost — item price plus ${info.adjective} shipping — so you see what you'd actually pay, not just the sticker price.`,
    },
    {
      q: `Are prices shown in ${info.currency}?`,
      a: `Yes — every price on this page and across the ${info.adjective} store listings is in ${info.currency}, the real currency those stores charge in. No conversion, no surprise exchange-rate markup.`,
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

      {/* The full "/" feature set — Market Pulse, Today's Top Deals, popular
          cards, How It Works, Explore, reviews, partners — see HomeSections.tsx
          and this file's own header comment for why this exists here now. */}
      <HomeSections
        country={region}
        totalCards={totalCards}
        storeCount={stat.stores}
        storeWord={storeWord}
        popularCards={popularCards}
        popularVendetta={popularVendetta}
        topDealsByCountry={topDealsByCountry}
        moversByCountry={moversByCountry}
        recentlyUpdated={recentlyUpdated}
      />

      <section className="container-app">
        <h2 className="text-xl font-extrabold text-white">Buying Riftbound cards in {info.place}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare compares live prices across {stat.stores} {info.adjective} {storeWord} for Riftbound: League of
          Legends TCG — {stat.priced.toLocaleString()} cards priced so far — ranked by total delivered cost (item plus
          {" "}{info.adjective} shipping), updated daily. It&apos;s the same database and the same ranking logic used
          everywhere else on the site, scoped to what&apos;s actually available in {info.place}.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse the full database →
          </Link>
          <Link href="/stores/tracked" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            See every store we track →
          </Link>
          <Link href="/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse by set →
          </Link>
          <Link href="/decks" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Top meta decks →
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
              description: `Compare live Riftbound TCG card prices across ${info.adjective} stores — total delivered cost including ${info.adjective} shipping, in ${info.currency}.`,
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
