import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { Reveal } from "@/components/Reveal";
import { getPopularCards } from "@/lib/cheapest-cards";
import { COUNTRIES, DEFAULT_COUNTRY, priceField, type Country } from "@/lib/country";
import type { MarketStat } from "@/components/home/HeroStats";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { getTopDeals, type TopDeals } from "@/lib/top-deals";
import { TodaysTopDeals } from "@/components/TodaysTopDeals";
import { getMarketIndex } from "@/lib/market-index";
import { getLatestMarketReport } from "@/lib/posts";
import { CinematicHero } from "@/components/home/CinematicHero";
import { MarketPulse } from "@/components/home/MarketPulse";
import { HowItWorks } from "@/components/home/HowItWorks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { MARKETPLACE_NAV_VISIBLE } from "@/components/nav-groups";

// REAL ISR: renders a market-NEUTRAL baseline (no cookie/header reads — the
// indexed copy names all four markets, data is fetched for the AU baseline) so
// Google gets one coherent global page and every visitor gets cached HTML.
// Client components localise prices after hydration via CountryProvider.
//
// 1h (not 24h): on-demand revalidation via /api/revalidate only fires when
// CRON_SECRET is set; without it the page would sit stale for days (the market
// index froze at an old date). An hourly ISR fallback self-heals regardless, and
// the queries below are a handful of bounded aggregates — cheap to run 24×/day.
export const revalidate = 3600;

// Market-neutral metadata (no country in the title) so search results aren't biased
// to one country — the visible page below is still tailored to the visitor's market.
export const metadata: Metadata = {
  title: { absolute: "Buy & Compare Riftbound Card Prices | RiftCompare" },
  // Kept to 25–160 chars (Bing/Google snippet limit) while staying market-neutral.
  description:
    "Compare live Riftbound TCG card prices across AU, NZ, US, UK & Singapore stores to find the cheapest place to buy singles and sealed. Updated daily.",
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
    a: "RiftCompare compares live Riftbound prices across a wide range of local stores in Australia, New Zealand, the US, the UK and Singapore, plus eBay (AU, US, UK and SG), so you can buy Riftbound cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.",
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
    a: "Yes. Prices are shown in the local currency of your selected market — AUD in Australia, NZD in New Zealand, USD in the US, GBP in the UK and SGD in Singapore — so there are no surprise currency conversions.",
  },
];

export default async function HomePage() {
  // AU-baseline data on the cached render (deal sections are honestly labelled
  // "Australia"); CardTile re-prices to the visitor's market after hydration.
  // The copy Google indexes (hero, FAQs, about) is market-neutral.
  const country = DEFAULT_COUNTRY;
  const info = COUNTRIES[country];
  const COUNTRY_CODES: Country[] = ["AU", "NZ", "US", "UK", "SG"];
  const [totalCards, pricedCounts, inStockGroups, storeRows, popularCards, topDealsArr, index, latestWrap] = await Promise.all([
    prisma.card.count(),
    // Priced-card count PER MARKET (one indexed count per price column) — the hero
    // stat tiles localise to the visitor's market client-side, so we serialize all four.
    Promise.all(COUNTRY_CODES.map((c) => prisma.card.count({ where: { [priceField(c)]: { not: null } } }))),
    // Live in-stock listings per market, in one grouped count (market-guide reference
    // rows aren't a buyable unit, so excluded).
    prisma.retailerPrice.groupBy({
      by: ["country"],
      where: { inStock: true, NOT: { retailer: { startsWith: "marketguide" } } },
      _count: { _all: true },
    }),
    // Distinct stores per market with LIVE PRICE ROWS (eBay excluded). Singles AND
    // sealed listings both count — a store with live booster-box prices (e.g.
    // Flagship Games SG) is genuinely priced before it lists singles.
    Promise.all([
      prisma.retailerPrice.groupBy({ by: ["country", "retailer"], where: { NOT: { retailer: { startsWith: "ebay" } } } }),
      prisma.sealedListing.groupBy({ by: ["country", "retailer"], where: { NOT: { retailer: { startsWith: "ebay" } } } }),
    ]).then(([singles, sealed]) => [...singles, ...sealed]),
    // Most-searched singles (ties → more expensive card) — the cards people most want.
    getPopularCards(12, country),
    // Today's Top Deals blends four signals; cache per-market. We serialize ALL four
    // markets so the section localises to the visitor's chosen market client-side —
    // the page is ISR-cached with DEFAULT_COUNTRY baked in, so a single-market render
    // would show the wrong currency/prices to anyone who switches markets.
    // Tagged so the daily import refreshes it on-demand (the page itself is cached 24h).
    // These per-datum caches use a 1h TTL, not 24h: the CONTENT_TAG bust only fires
    // when CRON_SECRET is configured, so a shorter TTL guarantees daily-import data
    // reaches the homepage even if the on-demand ping is skipped. (v4 index key busts
    // the stale entry that had frozen the market index at an old date.)
    Promise.all(
      COUNTRY_CODES.map((c) =>
        unstable_cache(() => getTopDeals(c), ["top-deals", c], { revalidate: 3600, tags: [CONTENT_TAG] })(),
      ),
    ),
    // The GLOBAL RiftCompare Index. getMarketIndex is now day-cached internally
    // (once per market per Sydney day, shared across every caller), so no extra
    // page-level cache is needed — a second wrapper would only re-serialise the
    // same blob and can't reduce history-DB reads further.
    getMarketIndex("GLOBAL"),
    // The latest daily market wrap for the homepage's featured data block.
    unstable_cache(getLatestMarketReport, ["home-latest-wrap"], { revalidate: 3600, tags: [CONTENT_TAG] })(),
  ]);
  // Assemble per-market stat tiles; the client picks the visitor's market after hydration.
  const inStockByCountry: Record<string, number> = {};
  for (const g of inStockGroups) inStockByCountry[g.country] = g._count._all;
  const storesByCountry: Record<string, Set<string>> = {};
  for (const r of storeRows) (storesByCountry[r.country] ??= new Set()).add(r.retailer);
  const statsByCountry = Object.fromEntries(
    COUNTRY_CODES.map((c, i) => [c, { priced: pricedCounts[i], inStock: inStockByCountry[c] ?? 0, stores: storesByCountry[c]?.size ?? 0 }]),
  ) as Record<Country, MarketStat>;
  const storeCount = statsByCountry[country].stores;
  const storeWord = storeCount === 1 ? "store" : "stores";
  // Per-market Top Deals, so the section can localise client-side (see above).
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const topDeals = topDealsByCountry[country]; // default-market view (MarketPulse + section guard)
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);

  return (
    <div className="flex flex-col gap-12">
      {/* Vendetta launch ribbon lives in the layout (attached under the navbar), so
          it isn't repeated here. */}

      {/* Cinematic full-bleed hero — today's wrap banner sits inside it, under the
          live badge (see CinematicHero). */}
      <CinematicHero
        country={country}
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        wrap={latestWrap}
      />

      {/* Marketplace launch banner — the single most vibrant CTA on the page,
          right under the hero, so it's the first thing a visitor sees below
          the fold. Only shown once MARKETPLACE_NAV_VISIBLE (mirrors
          NEXT_PUBLIC_MARKETPLACE_PUBLIC), same flag as the nav chip. */}
      {MARKETPLACE_NAV_VISIBLE && (
        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-brand-500/50 bg-gradient-to-br from-brand-500/20 via-ink-900 to-ink-900 p-6">
            <Link href="/marketplace" className="group flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">New · RiftCompare Marketplace</span>
                  <span className="chip bg-gold/15 text-[10px] font-bold uppercase tracking-wide text-gold" title="The marketplace is new — features and policies may still change.">🧪 Beta</span>
                </div>
                <h2 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">Buy &amp; sell Riftbound cards directly with other players</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">
                  Browse listings from verified sellers, or open your own shop and start selling — every purchase is
                  protected: funds are held by RiftCompare until your order arrives.
                </p>
              </div>
              <span className="btn-primary shrink-0 whitespace-nowrap text-sm group-hover:brightness-110">🛒 Explore Marketplace →</span>
            </Link>
            <p className="mt-3 text-xs text-slate-500">
              It&apos;s in beta, so if something looks off,{" "}
              <Link href="/support?category=OTHER&subject=Marketplace%20bug%3A%20" className="font-semibold text-brand-400 underline hover:text-brand-300">
                let us know
              </Link>
              .
            </p>
          </div>
        </Reveal>
      )}

      {/* Live Index pulse — only until the first daily wrap exists; once it does, the
          top banner is the single wrap/index element and this is skipped. */}
      {!latestWrap && (
        <Reveal>
          <MarketPulse index={index} currency={info.currency} deals={topDeals} country={country} place={info.place} />
        </Reveal>
      )}

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic before the deeper data sections. */}
      <HowItWorks totalCards={totalCards} />

      {/* Daily Riftle teaser — surfaces the site's daily-habit game on the top page. */}
      <Reveal>
        <Link
          href="/riftle"
          className="group flex items-center gap-4 rounded-2xl border border-ink-700 bg-ink-900 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-2xl" aria-hidden>🃏</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-white">Play today&apos;s Riftle</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Guess the daily Riftbound card in 8 tries — a new one every day.
            </p>
          </div>
          <span className="btn-primary shrink-0 text-sm">Play →</span>
        </Link>
      </Reveal>

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
      {anyDeals && (
        <Reveal>
          <TodaysTopDeals dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* Explore — sets + domains consolidated into one entry point */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Explore the database</h2>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By set</div>
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) =>
            // Fully unreleased (no cards, no sealed) → disabled tile. Vendetta has
            // revealed cards + sealed live, so it links through with a green "New"
            // cue (the revealed-card list is browsable now; store prices land at
            // release).
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
                      <span className="chip bg-up/20 font-bold uppercase tracking-wide text-up">New</span>
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
