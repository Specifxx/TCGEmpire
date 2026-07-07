import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { Reveal } from "@/components/Reveal";
import { getPopularCards } from "@/lib/cheapest-cards";
import { COUNTRIES, DEFAULT_COUNTRY, priceField } from "@/lib/country";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { getTopDeals } from "@/lib/top-deals";
import { TodaysTopDeals } from "@/components/TodaysTopDeals";
import { getMarketIndex } from "@/lib/market-index";
import { getLatestMarketReport } from "@/lib/posts";
import { CinematicHero } from "@/components/home/CinematicHero";
import { MarketPulse } from "@/components/home/MarketPulse";
import { HowItWorks } from "@/components/home/HowItWorks";
import { DailyWrapHero } from "@/components/DailyWrapHero";
import { CONTENT_TAG } from "@/lib/revalidate-content";

// REAL ISR: renders a market-NEUTRAL baseline (no cookie/header reads — the
// indexed copy names all four markets, data is fetched for the AU baseline) so
// Google gets one coherent global page and every visitor gets cached HTML.
// Client components localise prices after hydration via CountryProvider.
export const revalidate = 86400;

// Market-neutral metadata (no country in the title) so search results aren't biased
// to one country — the visible page below is still tailored to the visitor's market.
export const metadata: Metadata = {
  title: { absolute: "Buy & Compare Riftbound Card Prices | RiftCompare" },
  // Kept to 25–160 chars (Bing/Google snippet limit) while staying market-neutral.
  description:
    "Compare live Riftbound TCG card prices across AU, NZ, US & UK stores to find the cheapest place to buy singles and sealed. Updated daily.",
  keywords: [
    "buy Riftbound cards",
    "Riftbound prices",
    "compare Riftbound card prices",
    "cheapest Riftbound cards",
    "Riftbound singles",
    "Riftbound TCG",
    "Riftbound card prices",
  ],
  alternates: { canonical: "/" },
};

// MARKET-NEUTRAL FAQs: this page is cached (real ISR) and Googlebot crawls
// from US IPs, so exactly one version is ever indexed — copy that names all
// four markets ranks in all four, and the country names double as keywords.
const FAQS: { q: string; a: string }[] = [
  {
    q: "Where can I buy Riftbound cards?",
    a: "RiftCompare compares live Riftbound prices across a wide range of local stores in Australia, New Zealand, the US and the UK, plus eBay (AU, US and UK), so you can buy Riftbound cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.",
  },
  {
    q: "How do I find the cheapest Riftbound prices?",
    a: "Search or browse the card database — every card shows the lowest live price across the stores in your market, ranked by total delivered cost (item plus shipping). It's the fastest way to find the cheapest Riftbound cards wherever you are.",
  },
  {
    q: "Does RiftCompare cover Riftbound singles and sealed products?",
    a: "Yes — compare prices on individual Riftbound singles as well as sealed products like booster boxes, booster packs, Proving Grounds and Nexus Night packs, all priced across local retailers.",
  },
  {
    q: "Are the Riftbound prices shown in my local currency?",
    a: "Yes. Prices are shown in the local currency of your selected market — AUD in Australia, NZD in New Zealand, USD in the US and GBP in the UK — so there are no surprise currency conversions.",
  },
];

export default async function HomePage() {
  // AU-baseline data on the cached render (deal sections are honestly labelled
  // "Australia"); CardTile re-prices to the visitor's market after hydration.
  // The copy Google indexes (hero, FAQs, about) is market-neutral.
  const country = DEFAULT_COUNTRY;
  const info = COUNTRIES[country];
  const field = priceField(country);
  const [totalCards, pricedCards, inStockUnits, popularCards, storeGroups, topDeals, index, latestWrap] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { [field]: { not: null } } }),
    // Live, in-stock store listings analysed in this market — the real units we
    // compared (the market-guide reference rows are not a buyable unit, so excluded).
    prisma.retailerPrice.count({ where: { country, inStock: true, NOT: { retailer: { startsWith: "marketguide" } } } }),
    // Most-searched singles (ties → more expensive card) — the cards people most want.
    getPopularCards(12, country),
    // Stores serving the selected market (eBay excluded from the count).
    prisma.retailerPrice.groupBy({ by: ["retailer"], where: { country, NOT: { retailer: { startsWith: "ebay" } } } }),
    // Today's Top Deals blends four signals; cache per-market. Tagged so the daily
    // import refreshes it on-demand (the page itself is cached 24h).
    unstable_cache(() => getTopDeals(country), ["top-deals", country], { revalidate: 86400, tags: [CONTENT_TAG] })(),
    // The GLOBAL RiftCompare Index for the hero + Market Pulse. Global = always
    // populated (PriceHistory is AU-only today) and its base-100 level is
    // currency-agnostic, so it reads the same for every market.
    // Key versioned (v2): the MarketIndex shape gained `stats`; the data cache
    // persists across deploys, so a stale pre-stats blob would crash Market Pulse.
    unstable_cache(() => getMarketIndex("GLOBAL"), ["home-index-global-v3"], { revalidate: 86400, tags: [CONTENT_TAG] })(),
    // The latest daily market wrap for the homepage's featured data block. Tagged so
    // a freshly-generated wrap surfaces on the next daily import (page cached 24h).
    unstable_cache(getLatestMarketReport, ["home-latest-wrap"], { revalidate: 86400, tags: [CONTENT_TAG] })(),
  ]);
  const storeCount = storeGroups.length;
  const storeWord = storeCount === 1 ? "store" : "stores";

  return (
    <div className="flex flex-col gap-12">
      {/* Cinematic full-bleed hero */}
      <CinematicHero
        country={country}
        info={info}
        storeCount={storeCount}
        storeWord={storeWord}
        totalCards={totalCards}
        pricedCards={pricedCards}
        inStockUnits={inStockUnits}
        index={index}
        wrap={latestWrap}
      />

      {/* Featured daily market wrap — the homepage's signature data moment: today's
          automated read on the market (chart graphic + headline), linking through to
          the full wrap. Falls back to the live Index pulse until the first wrap
          exists, so the slot is never empty. */}
      <Reveal>
        {latestWrap ? (
          <DailyWrapHero post={latestWrap} showIndex={false} />
        ) : (
          <MarketPulse index={index} currency={info.currency} deals={topDeals} country={country} place={info.place} />
        )}
      </Reveal>

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic before the deeper data sections. */}
      <HowItWorks totalCards={totalCards} />

      {/* Most popular cards — the most-searched Riftbound singles right now */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white">Most popular Riftbound cards</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              The most-searched cards right now — compare {storeCount} local {storeWord} for every one to find the best price.
            </p>
          </div>
          <Link href="/browse" className="btn-ghost text-xs shrink-0">View all →</Link>
        </div>
        <Reveal stagger className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {popularCards.map((c) => (
            <div key={c.id} className="w-36 shrink-0 sm:w-44">
              <CardTile card={c} />
            </div>
          ))}
        </Reveal>
      </section>

      {/* Today's Top Deals — the best live opportunities across four signals
          (premium columns reveal only the top pick). Hidden if no market has data. */}
      {topDeals.hasAny && (
        <Reveal>
          <TodaysTopDeals deals={topDeals} country={country} currency={info.currency} place={info.place} />
        </Reveal>
      )}

      {/* Explore — sets + domains consolidated into one entry point */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Explore the database</h2>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By set</div>
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) =>
            // Fully unreleased (no cards, no sealed) → disabled tile. Vendetta has
            // sealed live, so it links through with a "Cards soon · Sealed now" cue.
            s.comingSoon && !s.sealedAvailable ? (
              <div key={s.code} className="card-surface flex flex-col gap-1 p-4 opacity-60" aria-disabled>
                <span className="flex items-center gap-2 text-lg font-bold text-white">
                  {s.code}
                  <span className="chip bg-gold/20 text-gold">Coming soon</span>
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </div>
            ) : (
              <Link
                key={s.code}
                href={`/sets/${s.slug}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
              >
                <span className="flex flex-wrap items-center gap-1.5 text-lg font-bold text-white">
                  {s.code}
                  {s.comingSoon && s.sealedAvailable && (
                    <>
                      <span className="chip bg-gold/20 text-gold">Cards soon</span>
                      <span className="chip bg-brand-500/15 text-brand-300">Sealed now</span>
                    </>
                  )}
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </Link>
            )
          )}
        </Reveal>

        <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">By domain</div>
        <Reveal stagger className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((k) => {
            const d = domainInfo(k);
            return (
              <Link
                key={k}
                href={`/domains/${k.toLowerCase()}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
                style={{ color: d.color }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.label}
              </Link>
            );
          })}
        </Reveal>
      </section>

      {/* About + FAQ — keyword-relevant content for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Riftbound prices in Australia, New Zealand, the US &amp; UK — all in one place</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare is a free, independent price-comparison tool for Riftbound: League of Legends
          TCG. We track live prices for every Riftbound card across local stores in Australia, New
          Zealand, the US and the UK, plus eBay (AU, US and UK), so you can buy Riftbound cards for
          less — whether you&apos;re chasing singles for a deck or sealed booster boxes.
        </p>
        {/* Collapsible FAQ — tidy on mobile; answers still in the DOM for SEO. */}
        <div className="mt-5 divide-y divide-ink-800 border-t border-ink-800">
          {FAQS.map((f) => (
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
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
            // ItemList of the "Most popular Riftbound cards" actually rendered above.
            ...(popularCards.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: "Most popular Riftbound cards",
                    itemListElement: popularCards.map((c, i) => ({
                      "@type": "ListItem",
                      position: i + 1,
                      name: c.name,
                      url: `${SITE_URL}/card/${c.slug ?? c.id}`,
                    })),
                  },
                ]
              : []),
          ]),
        }}
      />
    </div>
  );
}
