import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Archivo } from "next/font/google";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { Reveal } from "@/components/Reveal";
import { getPopularCards } from "@/lib/cheapest-cards";
import { DEFAULT_COUNTRY, priceField, type Country } from "@/lib/country";
import type { MarketStat } from "@/components/home/HeroStats";
import { SETS, newestReleasedSet, nextUpcomingSet, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { getTopDeals, type TopDeals } from "@/lib/top-deals";
import { getRecentlyUpdated, getPriceMovers, type PriceMovers } from "@/lib/price-history";
import { getBlogPosts } from "@/lib/posts";
import { timeAgo } from "@/lib/format";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { CinematicHero } from "@/components/home/CinematicHero";
import { RadianceCountdownCard } from "@/components/home/RadianceCountdownCard";
import { LatestPosts } from "@/components/home/LatestPosts";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { HowItWorks } from "@/components/home/HowItWorks";
import { EbayPicks } from "@/components/EbayPicks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { RETAILER_LIST } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";
import { webPage, faqPage } from "@/lib/jsonld";

// Below-the-fold, client-rendered components — code-split into their own
// chunks (still SSR'd for content/SEO) so their JS isn't part of the bundle
// the browser has to parse/compile before the hero above them can hydrate and
// paint. Both are well below the LCP candidate (the hero stat line), so
// neither needs to be ready any earlier than "whenever it's scrolled to."
const TodaysTopDeals = dynamic(() => import("@/components/TodaysTopDeals").then((m) => m.TodaysTopDeals));
const PopularCardsCarousel = dynamic(() =>
  import("@/components/home/PopularCardsCarousel").then((m) => m.PopularCardsCarousel),
);
const MarketPulse = dynamic(() => import("@/components/home/MarketPulse").then((m) => m.MarketPulse));
const ReturnVisitCards = dynamic(() => import("@/components/home/ReturnVisitCards").then((m) => m.ReturnVisitCards));

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
  alternates: pageAlternates("/"),
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
    totalCards,
    pricedCounts,
    inStockGroups,
    storeRows,
    popularCards,
    popularVendetta,
    topDealsArr,
    recentlyUpdated,
    moversArr,
    lastPriceRefresh,
    blogPosts,
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
    // "Recently updated" feed — cards whose price genuinely changed in the most
    // recent snapshot (see lib/price-history.ts). Single-market (the baseline),
    // same as popularCards above: it's a real internal-linking/freshness feed,
    // not a per-market data section like Top Deals, so there's no reason to
    // serialize all five markets for client-side localisation. Rendered as a
    // tab in PopularCardsCarousel (see below), not its own section.
    getRecentlyUpdated(country, 24),
    // Biggest movers (up + down), PER MARKET — unlike the single-baseline reads
    // above, the new "Market pulse" strip shows a real per-visitor-market % (not
    // just a re-priced card with a baseline-market % caption), so this needs all
    // six markets, same Promise.all-of-getX pattern as topDealsArr. Each call is
    // day-cached (see price-history.ts), so this is six cheap cache reads, not
    // six fresh DB scans. moversByCountry[country] (the baseline) also feeds the
    // popular-cards carousel's "Movers" tab below, unchanged from before.
    Promise.all(COUNTRY_CODES.map((c) => getPriceMovers(c, 6))),
    // Real last-refresh timestamp for the hero's freshness signal ("Prices
    // updated 47m ago") — proof beats "Updated daily". Formatted server-side
    // once (see HeroStats' doc comment for why) via the plain aggregate max, not
    // a dedicated "last import" table (none exists) — RetailerPrice.lastSeen is
    // touched by the importer on every listing it sees, so its max IS the last
    // refresh. Never blocks the page: if this read fails the section just hides.
    prisma.retailerPrice.aggregate({ _max: { lastSeen: true } }),
    // Latest blog posts for the "Latest from the blog" teaser — in-memory list
    // filter/sort (lib/posts.ts), not a DB query, so this adds no egress.
    getBlogPosts(),
  ]);
  // Assemble per-market stat tiles; the client picks the visitor's market after hydration.
  const inStockByCountry: Record<string, number> = {};
  for (const g of inStockGroups) inStockByCountry[g.country] = g._count._all;
  // "Stores" means real, currently-tracked retailers — intersect the DB rows with
  // RETAILER_LIST (the single source of truth also used by /stores/tracked) rather
  // than trusting raw distinct `retailer` values. Without this a store REMOVED from
  // retailers.ts still counts forever (its old RetailerPrice/SealedListing rows are
  // never deleted once nothing targets that key again — see the STORES_WITH_POLICY
  // cleanup note in retailers.ts for the same drift), and TCGplayer/Cardmarket/
  // Marketplace pseudo-retailers (never in RETAILER_LIST, only excluded here by
  // name for eBay) get counted as if they were independent "stores" too. This is
  // the actual reason the homepage stat and /stores/tracked's count could disagree.
  const validRetailerKeys = new Set(RETAILER_LIST.map((r) => r.key));
  const storesByCountry: Record<string, Set<string>> = {};
  for (const r of storeRows) {
    if (!validRetailerKeys.has(r.retailer)) continue;
    (storesByCountry[r.country] ??= new Set()).add(r.retailer);
  }
  const statsByCountry = Object.fromEntries(
    COUNTRY_CODES.map((c, i) => [c, { priced: pricedCounts[i], inStock: inStockByCountry[c] ?? 0, stores: storesByCountry[c]?.size ?? 0 }]),
  ) as Record<Country, MarketStat>;
  const storeCount = statsByCountry[country].stores;
  const storeWord = storeCount === 1 ? "store" : "stores";
  // Per-market Top Deals, so the section can localise client-side (see above).
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);
  // Per-market movers, so Market Pulse can localise client-side (see above).
  const moversByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, moversArr[i]])) as Record<Country, PriceMovers>;
  // Biggest movers tab: both directions, ranked by the size of the move. Reads
  // the baseline market's movers, same as before moversByCountry existed.
  const newestSet = newestReleasedSet();
  const biggestMovers = [...moversByCountry[country].spiking, ...moversByCountry[country].plummeting]
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 12);
  // Pre-formatted once server-side — see HeroStats' doc comment for why this
  // must not be recomputed client-side. Hides the whole signal on a DB miss.
  const freshness = lastPriceRefresh._max.lastSeen ? timeAgo(lastPriceRefresh._max.lastSeen) : null;
  // The next announced-but-unreleased set (Radiance today; rolls forward on its
  // own — see nextUpcomingSet's doc comment). undefined hides the whole card.
  const radianceSet = nextUpcomingSet();
  const latestPosts = blogPosts.slice(0, 3);
  // Guarding these at the page level (rather than always mounting <Reveal> and
  // letting the child render null) matches how {anyDeals && <Reveal>…} already
  // works above — an empty Reveal wrapper is harmless, but there's no reason to
  // mount an IntersectionObserver over nothing.
  const showRadianceCard = radianceSet != null;
  const showLatestPosts = latestPosts.length > 0;

  return (
    <div className={`${archivo.variable} rb-display-sans flex flex-col gap-10`}>
      {/* Cinematic full-bleed hero — search-first (see CinematicHero + Task 3). */}
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        trendingCards={popularCards.slice(0, 6)}
        freshness={freshness}
      />

      {/* Market pulse — today's top risers/fallers, reusing the Daily Movers
          data. Sits right after the hero: the single strongest "come back
          tomorrow" signal a price site can show, so it earns above-the-fold
          placement. Hides itself if there's nothing to show today. */}
      <MarketPulse moversByCountry={moversByCountry} />

      {/* REMOVED: the "Vendetta — the new set, priced" launch band (cheapest
          booster box, price-since-release, chase cards). It was a launch-window
          spotlight and Vendetta released on 31 Jul 2026, so by mid-August it was
          giving the top of the homepage to a set that is no longer new. Its
          content still exists, better placed: cheapest sealed on /sealed, price
          movement on /movers and /market, chase cards on /sets/vendetta.
          UPDATE: the "date-windowed off SetInfo.releasedOn rather than hard-
          coded to one set" version predicted here now exists as
          RadianceCountdownCard below (sourced from lib/constants.ts's
          nextUpcomingSet()) — different spot on the page (after Explore), not a
          revival of this band. */}

      {/* Today's Top Deals — the strongest differentiator, moved up from five
          sections deep. Hidden if no market has data. */}
      {anyDeals && (
        <Reveal>
          <TodaysTopDeals dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* Inline email capture with a concrete value prop, right after the deals
          the reader was just looking at — the footer signup (still there too)
          is easy to never scroll to. Exact same handler/API as the footer form,
          just a different `source` for attribution. No popup/exit-intent — the
          brief is explicit that this stays inline. */}
      <div className="mx-auto w-full max-w-xl">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="home"
          variant="card"
          heading={`📈 Get the weekly ${SITE_NAME} Index — the market summary every collector reads, each Monday. Free.`}
          cta="Subscribe"
        />
      </div>

      {/* Tailored eBay unit — the set's chase cards with their cheapest live
          listing, rather than a generic banner. Sits after Top Deals so the
          commercial run reads own-inventory first, affiliate second. */}
      <EbayPicks />

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

      {/* Return-visit hooks — Riftle, the pack simulator, and price alerts —
          directly after Most popular cards (were buried near the bottom, after
          How it works and Explore). These are the site's best "come back
          tomorrow" mechanics that aren't the price data itself, so they get the
          slot right after the strongest card-browsing section instead of
          competing with it. */}
      <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReturnVisitCards newestSetName={newestSet?.name} />
      </Reveal>

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

        {/* The homepage's link into the visual gallery, inherited from the
            removed Vendetta launch band. Kept because it was the strongest
            internal link that page had (tests/seo-landing-pages.test.ts guards
            it), but pointed at whichever set is CURRENT rather than at Vendetta
            by name — so it follows Radiance in October instead of going stale
            the same way the band did. */}
        {newestSet && (
          <p className="mt-3 text-sm">
            <Link
              href={`/sets/${newestSet.slug}/gallery`}
              className="font-semibold text-brand-300 underline-offset-2 hover:underline"
            >
              See all{newestSet.totalCards ? ` ${newestSet.totalCards}` : ""} {newestSet.name} cards in the gallery →
            </Link>
          </p>
        )}

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

      {/* Radiance countdown — new-set hype, right after Explore (which already
          shows Radiance as a disabled "Coming soon" tile above): new-set
          searches are the biggest organic traffic spikes in TCGs, so this
          captures that intent on the homepage instead of waiting for a visitor
          to find /radiance-countdown on their own. Hides itself once nothing
          upcoming is announced. */}
      {showRadianceCard && (
        <Reveal>
          <RadianceCountdownCard set={radianceSet} />
        </Reveal>
      )}

      {/* Latest from the blog — fresh internal links + fresh content near the
          bottom of the homepage for crawl frequency and long-tail discovery.
          Hides itself if there are no posts (shouldn't happen, but no fake
          placeholders either way). */}
      {showLatestPosts && (
        <Reveal>
          <LatestPosts posts={latestPosts} />
        </Reveal>
      )}

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

      {/* Approved partners + affiliate disclosure — moved below the fold out of
          the hero (see PartnersStrip). Still travels together as one unit, still
          on the page, still adjacent to the actual affiliate links. Client
          component now (reads useCountry() itself) — see PartnersStrip.tsx for
          why: this page is ISR-cached with DEFAULT_COUNTRY baked in, and every
          visitor's eBay click here was being tagged with that baked-in country
          regardless of who they actually were. */}
      <PartnersStrip />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            // The homepage is the site's canonical entity landing page and carried
            // no node describing itself — only an FAQPage and two ItemLists, all
            // unlinked to the Organization/WebSite graph in app/layout.tsx.
            webPage({
              name: "RiftCompare — Riftbound Card Database & Price Comparison",
              href: "/",
              description:
                "Compare live Riftbound TCG card prices across stores in the US, UK, Australia, New Zealand, Canada and Singapore — total cost including shipping, no hidden fees.",
            }),
            // Matches the visible FAQ accordion in the About+FAQ section below
            // exactly (same FAQS array) — faqPage() is the shared builder every
            // other FAQ-bearing page uses; the homepage used to hand-duplicate
            // this shape inline.
            faqPage(FAQS),
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
