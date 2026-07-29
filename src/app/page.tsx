import type { Metadata } from "next";
import Link from "next/link";
import { Archivo } from "next/font/google";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { Reveal } from "@/components/Reveal";
import { getPopularCards, getValuableCards } from "@/lib/cheapest-cards";
import { DEFAULT_COUNTRY, priceField, type Country } from "@/lib/country";
import type { MarketStat } from "@/components/home/HeroStats";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { getTopDeals, type TopDeals } from "@/lib/top-deals";
import { getRecentlyUpdated, getPriceMovers } from "@/lib/price-history";
import { getVendettaPulse, type VendettaPulse } from "@/lib/vendetta";
import { TodaysTopDeals } from "@/components/TodaysTopDeals";
import { CinematicHero } from "@/components/home/CinematicHero";
import { VendettaBlock } from "@/components/home/VendettaBlock";
import { PopularCardsCarousel } from "@/components/home/PopularCardsCarousel";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { HowItWorks } from "@/components/home/HowItWorks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { CardsIcon } from "@/components/icons/HomeIcons";

// Homepage titling face — a heavy neutral grotesque matching the official
// Riftbound wordmark lockup ("RIFTBOUND / LEAGUE OF LEGENDS TRADING CARD GAME"),
// which is set in a bold sans rather than the flared serif the rest of the site
// uses for headings (Fraunces — see layout.tsx). Archivo is the closest free,
// properly-licensed analog: same wide, solid, poster-weight grotesque character.
//
// Declared HERE rather than in layout.tsx on purpose: next/font only injects and
// preloads a face on the routes that actually reference it, so scoping the
// import to this file keeps the extra download off every other page. The var is
// applied to the homepage wrapper below and inherited by its children (the hero
// lives in a separate component), then consumed by the `.rb-display-sans` rule
// in globals.css.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-riftbound",
  display: "swap",
});

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
    "Riftbound Vendetta",
    "Riftbound Vendetta prices",
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
  const COUNTRY_CODES: Country[] = ["AU", "NZ", "US", "UK", "SG"];
  const [
    totalCards,
    pricedCounts,
    inStockGroups,
    storeRows,
    popularCards,
    popularVendetta,
    chaseCards,
    topDealsArr,
    vendettaPulseArr,
    recentlyUpdated,
    movers,
  ] = await Promise.all([
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
    // Most-searched VENDETTA singles specifically — same demand signal, scoped to
    // the set everyone's talking about right now. Empty (no section shown) until
    // enough early listings are actually priced.
    getPopularCards(8, country, "VEN"),
    // Vendetta "chase cards" for the homepage Vendetta block — the highest-value
    // singles in the set (not "most searched" like popularVendetta above), same
    // AU-baseline-then-client-reprice pattern as every other card list here.
    getValuableCards(4, country, "VEN"),
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
    // Vendetta block's cheapest-box price + price-since-release pulse — plain
    // numbers (not a CardTileData, which already carries every market's price),
    // so like Top Deals this needs its own per-market array to localise client-side.
    Promise.all(COUNTRY_CODES.map((c) => getVendettaPulse(c))),
    // "Recently updated" feed — cards whose price genuinely changed in the most
    // recent snapshot (see lib/price-history.ts). Single-market (the baseline),
    // same as popularCards above: it's a real internal-linking/freshness feed,
    // not a per-market data section like Top Deals, so there's no reason to
    // serialize all five markets for client-side localisation. Rendered as a
    // tab in PopularCardsCarousel (see below), not its own section.
    getRecentlyUpdated(country, 24),
    // Biggest movers (up + down) for the unified popular-cards carousel's third
    // tab — same AU-baseline pattern as popularCards/popularVendetta.
    getPriceMovers(country, 6),
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
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);
  // Per-market Vendetta pulse, so the block can localise client-side (see above).
  const vendettaPulseByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, vendettaPulseArr[i]])) as Record<Country, VendettaPulse>;
  // Biggest movers tab: both directions, ranked by the size of the move.
  const biggestMovers = [...movers.spiking, ...movers.plummeting]
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 12);

  return (
    <div className={`${archivo.variable} rb-display-sans flex flex-col gap-12`}>
      {/* Cinematic full-bleed hero — search-first (see CinematicHero + Task 3). */}
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
      />

      {/* Vendetta block — replaces the old marquee. Real cheapest-box price,
          price movement since release, and chase cards; red is reserved for
          this block sitewide (see VendettaBlock). Hidden entirely until there's
          real data to show. */}
      <VendettaBlock pulseByCountry={vendettaPulseByCountry} chaseCards={chaseCards} />

      {/* Today's Top Deals — the strongest differentiator, moved up from five
          sections deep. Hidden if no market has data. */}
      {anyDeals && (
        <Reveal>
          <TodaysTopDeals dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* Unified popular-cards carousel — merges what used to be two identical
          "Most popular…" sections (Vendetta-scoped and all-time), a "Biggest
          movers" tab, AND (per your request) "Recently updated prices" — which
          used to be its own always-expanded section — into one compact, tabbed,
          one-row horizontal scroll. Real cards whose price genuinely changed in
          the latest snapshot (see lib/price-history.ts's outlier-guarded diff,
          never fabricated); the tab simply doesn't appear until there's at least
          one real change to show. */}
      <PopularCardsCarousel
        vendetta={popularVendetta}
        allTime={popularCards}
        movers={biggestMovers}
        recentlyUpdated={recentlyUpdated}
        storeCount={storeCount}
        storeWord={storeWord}
      />

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic. Moved after the commercial sections (deals, popular cards,
          movers) per the reordering brief: those are the stronger differentiator
          and shouldn't sit behind an explainer. */}
      <HowItWorks totalCards={totalCards} />

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
                  {((s.comingSoon && s.sealedAvailable) || s.recentlyReleased) && (
                    <span className="chip bg-up/20 font-bold uppercase tracking-wide text-up">New</span>
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

      {/* Daily Riftle teaser — moved after the commercial sections (per the
          reordering brief, games belong after buying content, not interrupting
          it between two card carousels). */}
      <Reveal>
        <Link
          href="/riftle"
          className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <CardsIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-white">Play today&apos;s Riftle</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Guess the daily Riftbound card in 8 tries — a new one every day.
            </p>
          </div>
          <span className="btn-primary shrink-0 text-sm">Play →</span>
        </Link>
      </Reveal>

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

      {/* Approved partners + affiliate disclosure — moved below the fold out of
          the hero (see PartnersStrip). Still travels together as one unit, still
          on the page, still adjacent to the actual affiliate links. */}
      <PartnersStrip country={country} />

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
            // ItemList of the "Recently updated prices" feed actually rendered above.
            ...(recentlyUpdated.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: "Recently updated Riftbound prices",
                    itemListElement: recentlyUpdated.map((u, i) => ({
                      "@type": "ListItem",
                      position: i + 1,
                      name: u.card.name,
                      url: `${SITE_URL}/card/${u.card.slug ?? u.card.id}`,
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
