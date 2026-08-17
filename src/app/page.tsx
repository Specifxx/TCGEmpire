import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { getPopularCards } from "@/lib/cheapest-cards";
import { DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { getCachedTopDeals, type TopDeals } from "@/lib/top-deals";
import { getRecentlyUpdated, getPriceMovers, type PriceMovers } from "@/lib/price-history";
import { getHomeStats } from "@/lib/home-stats";
import { CinematicHero } from "@/components/home/CinematicHero";
import { HomeSections } from "@/components/home/HomeSections";
import { pageAlternates, regionHomeHreflang } from "@/lib/seo";
import { webPage, faqPage } from "@/lib/jsonld";

// RESTORED (2026-08-17), overriding a same-day "one job" redesign that had
// briefly replaced this body with ProofStrip + DealsRow: direct owner
// feedback on the live redesign was that it looked worse, not better — too
// unfamiliar a layout, and specifically missed Market Pulse and Today's Top
// Deals' full grid. Rather than re-litigate the redesign's own reasoning
// (still valid, still preserved as HomeSections' full feature set below,
// still what the 5 region pages render), this reverts "/" to the same body
// the region pages already use, restoring feature parity across all six
// markets. CinematicHero, SearchBar and every sitewide fix landed alongside
// the redesign (accessibility, the search-dropdown stacking bug, etc.) are
// untouched by this revert — only which body mounts below the hero changed.
// ProofStrip/DealsRow/proof-strip.ts are left in the tree, unmounted, rather
// than deleted, in case a future pass wants to revisit them deliberately.

// REMOVED: everything that ever fed the two slots either side of the hero —
// first FEATURED_CARD_SLUGS + its prisma.card.findMany (hard-picked floating
// chase cards), then getHeroRailData() + its cached listings query (the
// affiliate rails that replaced them, removed 2026-08-16 because a pair of ad
// panes framing the search box is the wrong first impression for a price
// comparison). Both reads went with their component, and that is the point: a
// decorative or revenue read on an ISR-cached page is exactly the shape of the
// egress leak the 2026-08-14 work existed to remove, and keeping one alive
// after nothing consumed it would be a regression with no upside. The hero now
// needs NO data beyond the stats it already renders.

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
    "Compare live Riftbound TCG card prices across AU, NZ, US, UK, Singapore & Canada stores to find the cheapest place to buy singles and sealed. Updated daily.",
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
  // The homepage is the US/x-default member of the region-home alternate set
  // (see /au, /nz, /uk, /sg, /ca — lib/seo.ts's regionHomeHreflang()). hreflang
  // is reciprocal by spec: every page in the group must declare the full set,
  // not just the five newer pages pointing back at this one.
  alternates: pageAlternates("/", { languages: regionHomeHreflang() }),
};

// MARKET-NEUTRAL FAQs: this page is cached (real ISR) and Googlebot crawls
// from US IPs, so exactly one version is ever indexed — copy that names all
// four markets ranks in all four, and the country names double as keywords.
const FAQS: { q: string; a: string }[] = [
  {
    q: "Where can I buy Riftbound cards?",
    a: "RiftCompare compares live Riftbound prices across a wide range of local stores in Australia, New Zealand, the US, the UK, Singapore and Canada, plus eBay (AU, US, UK, SG and CA), so you can buy Riftbound cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.",
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
    a: "Yes. Prices are shown in the local currency of your selected market — AUD in Australia, NZD in New Zealand, USD in the US, GBP in the UK, SGD in Singapore and CAD in Canada — so there are no surprise currency conversions.",
  },
];

export default async function HomePage() {
  // AU-baseline data on the cached render (deal sections are honestly labelled
  // "Australia"); CardTile re-prices to the visitor's market after hydration.
  // The copy Google indexes (hero, FAQs, about) is market-neutral.
  const country = DEFAULT_COUNTRY;
  const COUNTRY_CODES: Country[] = ["AU", "NZ", "US", "UK", "SG", "CA"];
  const [
    { totalCards, statsByCountry, freshness },
    popularCards,
    popularVendetta,
    topDealsArr,
    recentlyUpdated,
    moversArr,
  ] = await Promise.all([
    // Per-market stat tiles + the "Prices updated Xh ago" freshness signal —
    // shared with the 5 region home pages (see lib/home-stats.ts) so they read
    // the exact same cached figures instead of a second, potentially-drifting copy.
    getHomeStats(),
    // Most-searched singles (ties → more expensive card) — the cards people most want.
    getPopularCards(12, country),
    // Most-searched VENDETTA singles specifically — same demand signal, scoped to
    // the set everyone's talking about right now. Empty (no section shown) until
    // enough early listings are actually priced.
    getPopularCards(8, country, "VEN"),
    // Today's Top Deals blends four signals; cache per-market. We serialize ALL four
    // markets so the section localises to the visitor's chosen market client-side —
    // the page is ISR-cached with DEFAULT_COUNTRY baked in, so a single-market render
    // would show the wrong currency/prices to anyone who switches markets.
    // Tagged so the daily import refreshes it on-demand (the page itself is cached 24h).
    // These per-datum caches use a 1h TTL, not 24h: the CONTENT_TAG bust only fires
    // when CRON_SECRET is configured, so a shorter TTL guarantees daily-import data
    // reaches the homepage even if the on-demand ping is skipped. (v4 index key busts
    // the stale entry that had frozen the market index at an old date.)
    Promise.all(COUNTRY_CODES.map((c) => getCachedTopDeals(c))),
    // "Recently updated" feed — cards whose price genuinely changed in the most
    // recent snapshot (see lib/price-history.ts). Single-market (the baseline),
    // same as popularCards above: it's a real internal-linking/freshness feed,
    // not a per-market data section like Top Deals, so there's no reason to
    // serialize all five markets for client-side localisation. Rendered as a
    // tab in PopularCardsCarousel (see below), not its own section.
    getRecentlyUpdated(country, 24),
    // Biggest movers (up + down), PER MARKET — unlike the single-baseline reads
    // above, the "Market pulse" strip shows a real per-visitor-market % (not
    // just a re-priced card with a baseline-market % caption), so this needs all
    // six markets, same Promise.all-of-getX pattern as topDealsArr. Each call is
    // day-cached (see price-history.ts), so this is six cheap cache reads, not
    // six fresh DB scans. moversByCountry[country] (the baseline) also feeds the
    // popular-cards carousel's "Movers" tab below, unchanged from before.
    Promise.all(COUNTRY_CODES.map((c) => getPriceMovers(c, 6))),
  ]);
  const storeCount = statsByCountry[country].stores;
  const storeWord = storeCount === 1 ? "store" : "stores";
  // Per-market Top Deals/movers, so HomeSections' sections can localise
  // client-side to whichever market the VISITOR is actually in (see its own
  // doc comment) — not just the AU baseline this page's ISR render bakes in.
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const moversByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, moversArr[i]])) as Record<Country, PriceMovers>;

  return (
    <div className={`${archivo.variable} rb-display-sans flex flex-col gap-10`}>
      {/* Cinematic full-bleed hero — search-first (see CinematicHero + Task 3). */}
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        trendingCards={popularCards.slice(0, 6)}
        freshness={freshness}
      />

      {/* REMOVED: the "Vendetta — the new set, priced" launch band (cheapest
          booster box, price-since-release, chase cards). It was a launch-window
          spotlight and Vendetta released on 31 Jul 2026, so by mid-August it was
          giving the top of the homepage to a set that is no longer new. Its
          content still exists, better placed: cheapest sealed on /sealed, price
          movement on /movers and /market, chase cards on /sets/vendetta.
          UPDATE: the "date-windowed off SetInfo.releasedOn rather than hard-
          coded to one set" version predicted here now exists as
          RadianceCountdownCard (sourced from lib/constants.ts's
          nextUpcomingSet()) — inside HomeSections below, after Explore — not a
          revival of this band. */}

      {/* Everything below the hero — Market Pulse, Today's Top Deals, the
          popular-cards carousel, How It Works, Explore, reviews, partners —
          shared with the 5 region home pages (/au, /nz, /uk, /sg, /ca) via
          HomeSections, so a visitor who picks a market in the hero toggle gets
          the SAME feature set, not a stripped-down page. See HomeSections.tsx. */}
      <HomeSections
        country={country}
        totalCards={totalCards}
        storeCount={storeCount}
        storeWord={storeWord}
        popularCards={popularCards}
        popularVendetta={popularVendetta}
        topDealsByCountry={topDealsByCountry}
        moversByCountry={moversByCountry}
        recentlyUpdated={recentlyUpdated}
      />

      {/* About + FAQ — keyword-relevant content for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Riftbound prices in Australia, New Zealand, the US, the UK, Singapore and Canada — all in one place</h2>
        {/* Full width, matching the heading above — a capped/centred measure
            here just shifted the paragraph out of alignment with the heading
            (text starting a third of the way across the card reads as broken,
            not "intentional whitespace"). This card is meant to fill its row. */}
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          RiftCompare is a free, independent price-comparison tool for Riftbound: League of Legends
          TCG. We track live prices for every Riftbound card across local stores in Australia, New
          Zealand, the US, the UK, Singapore and Canada, plus eBay (AU, US, UK, SG and CA), so you
          can buy Riftbound cards for less — whether you&apos;re chasing singles for a deck or
          sealed booster boxes.
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

      {/* The homepage is the site's canonical entity landing page and carried
          no node describing itself — only an FAQPage, unlinked to the
          Organization/WebSite graph in app/layout.tsx. The two ItemLists
          (most popular / recently updated) live in HomeSections' own script
          now, next to the sections and data they actually describe. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            webPage({
              name: "RiftCompare — Riftbound Card Database & Price Comparison",
              href: "/",
              description:
                "Compare live Riftbound TCG card prices across stores in the US, UK, Australia, New Zealand, Canada and Singapore — total cost including shipping, no hidden fees.",
            }),
            // Matches the visible FAQ accordion in the About+FAQ section above
            // exactly (same FAQS array) — faqPage() is the shared builder every
            // other FAQ-bearing page uses; the homepage used to hand-duplicate
            // this shape inline.
            faqPage(FAQS),
          ]),
        }}
      />
    </div>
  );
}
