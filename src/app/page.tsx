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
import { SETS, newestReleasedSet, nextUpcomingSet } from "@/lib/constants";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { getTopDeals, type TopDeals } from "@/lib/top-deals";
import { getProofStripPick, type ProofStripPick } from "@/lib/proof-strip";
import { timeAgo } from "@/lib/format";
import { ScrollDepthTracker } from "@/components/ScrollDepthTracker";
import { CinematicHero } from "@/components/home/CinematicHero";
import { ProofStrip } from "@/components/home/ProofStrip";
import { RadianceCountdownCard } from "@/components/home/RadianceCountdownCard";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { EbayPicks } from "@/components/EbayPicks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { RETAILER_LIST } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";
import { webPage, faqPage } from "@/lib/jsonld";

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
//
// REMOVED (this pass — the homepage-redesign brief's "one job" rebuild):
// MarketPulse (risers/fallers — full version lives at /market, footer-linked),
// TodaysTopDeals' 4-column grid + its price-tier filter chips (collapsed into
// DealsRow below, ONE row, chips gone entirely — they belong on the deals page,
// not a homepage teaser of it), the inline mid-page NewsletterSignup card
// (exactly one capture survives, in the footer — see app/layout.tsx),
// PopularCardsCarousel and its four tabs (Vendetta/all-time/movers/recently-
// updated — /browse, /sets/vendetta and /movers already cover the same ground),
// ReturnVisitCards (pack sim → /games/pack-sim, Riftle → /riftle, both already
// in nav/footer; the price-alerts promo card had no ready homepage-agnostic
// replacement — see DECISIONS.md, re-adding it to card detail pages is future
// work this task doesn't touch), HowItWorks' three-step explainer (replaced by
// ProofStrip below; the full three-step version still exists, now on /about),
// RadianceCountdownCard's own full-width card + its own newsletter capture
// (folded into one line inside "Explore by set" instead), LatestPosts' guides
// grid (/guides is already footer-linked) and ReviewsSection (renders nothing
// until real reviews exist; removing the mount removes a DB read that was
// already producing nothing here). Every one of those still has a real page
// and a real nav/footer entry — see DECISIONS.md's Phase 4 section for the
// full "what moved, and where" table. EbayPicks is the one exception: it stays,
// unmoved — tests/ebay-picks.test.ts pins it on all five of its intended pages
// including this one, it carries its own affiliate disclosure, and at one
// unlabelled row with no <h2> of its own it costs nothing this rebuild is
// trying to save.

// Below-the-fold, client-rendered components — code-split into their own
// chunks (still SSR'd for content/SEO) so their JS isn't part of the bundle
// the browser has to parse/compile before the hero above them can hydrate and
// paint. DealsRow is well below the LCP candidate (the hero stat line), so it
// doesn't need to be ready any earlier than "whenever it's scrolled to."
const DealsRow = dynamic(() => import("@/components/home/DealsRow").then((m) => m.DealsRow));

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
    topDealsArr,
    lastPriceRefresh,
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
    // Also doubles as the ProofStrip's candidate pool below (most popular first,
    // priced-only) and the search box's zero-state trending suggestions.
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
    // Real last-refresh timestamp for the hero's freshness signal ("Prices
    // updated 47m ago") — proof beats "Updated daily". Formatted server-side
    // once (see HeroStats' doc comment for why) via the plain aggregate max, not
    // a dedicated "last import" table (none exists) — RetailerPrice.lastSeen is
    // touched by the importer on every listing it sees, so its max IS the last
    // refresh. Never blocks the page: if this read fails the section just hides.
    prisma.retailerPrice.aggregate({ _max: { lastSeen: true } }),
  ]);
  // ProofStrip's per-market pick depends on `popularCards` just resolved above,
  // so it's a second read rather than part of the first Promise.all — same
  // per-market/CONTENT_TAG caching contract as topDealsArr just above (see
  // lib/db.ts's egress rules: this is bounded to a handful of already-fetched
  // candidate ids per market, never a table scan). getProofStripPick() itself
  // is new aggregation code built ON the same read-only helpers the card page
  // uses (computeMarket, effectiveShippingCents) — see lib/proof-strip.ts.
  const proofArr = await Promise.all(
    COUNTRY_CODES.map((c) =>
      unstable_cache(() => getProofStripPick(popularCards, c), ["proof-strip", c], { revalidate: 3600, tags: [CONTENT_TAG] })(),
    ),
  );
  const proofByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, proofArr[i]])) as Record<
    Country,
    ProofStripPick | null
  >;
  const anyProof = COUNTRY_CODES.some((c) => proofByCountry[c] != null);
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
  // Per-market Top Deals, so the section can localise client-side (see above).
  const topDealsByCountry = Object.fromEntries(COUNTRY_CODES.map((c, i) => [c, topDealsArr[i]])) as Record<Country, TopDeals>;
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);
  const newestSet = newestReleasedSet();
  // Pre-formatted once server-side — see HeroStats' doc comment for why this
  // must not be recomputed client-side. Hides the whole signal on a DB miss.
  const freshness = lastPriceRefresh._max.lastSeen ? timeAgo(lastPriceRefresh._max.lastSeen) : null;
  // The next announced-but-unreleased set (Radiance today; rolls forward on its
  // own — see nextUpcomingSet's doc comment). undefined hides the whole line.
  const radianceSet = nextUpcomingSet();

  return (
    <div className={`${archivo.variable} rb-display-sans flex flex-col gap-10`}>
      {/* Scroll-depth measurement (25/50/75/90%) — see ScrollDepthTracker.tsx
          for why this is mounted per-route here rather than in the root
          layout. Renders nothing; purely a side-effecting analytics mount. */}
      <ScrollDepthTracker />

      {/* Cinematic full-bleed hero — search-first (see CinematicHero + Task 3). */}
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        trendingCards={popularCards.slice(0, 6)}
        freshness={freshness}
      />

      {/* Proof strip — one real, popular card with its three cheapest store
          prices side by side and the saving highlighted, replacing the old
          three-step "How RiftCompare works" explainer (still there in full on
          /about). PCPartPicker's pattern: prove the value proposition with
          the product itself instead of describing it. Deliberately NOT
          wrapped in <Reveal> (unlike most sections below it) — same reasoning
          MarketPulse used to document in this exact spot: it's close enough
          to the hero to often be in the initial viewport, so it renders
          immediately rather than fading in after a delay. Hides entirely if
          no popular card has three-plus priced stores in the visitor's
          market (see lib/proof-strip.ts) — a thin two-price "comparison"
          would undercut the point it's trying to prove. */}
      {anyProof && <ProofStrip pickByCountry={proofByCountry} />}

      {/* ONE deals row — collapses what used to be Market pulse + Today's Top
          Deals' 4-column grid + its filter chips into a single horizontally-
          scrolling row of up to six cards. Hidden if no market has data. */}
      {anyDeals && (
        <Reveal>
          <DealsRow dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* Tailored eBay unit — the set's chase cards with their cheapest live
          listing, rather than a generic banner. Kept in place (unlike most of
          what used to surround it) — tests/ebay-picks.test.ts pins it on all
          five of its intended high-traffic pages including this one, it
          carries its own affiliate disclosure, and it costs no <h2> of its
          own. Sits right after the deals row so the commercial run reads
          organic-comparison first, affiliate second. */}
      <EbayPicks />

      {/* Explore — sets, compressed. The "by domain" sub-grid that used to sit
          here moved to /domains (a fuller hub page for exactly that content,
          already nav/footer-linked — see DECISIONS.md); the Radiance
          countdown that used to be its own full-width card two sections down
          is now one line at the foot of this one instead. */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Explore by set</h2>

        {/* lg:grid-cols-6, not -5: SETS has exactly 6 entries today, and one
            row instead of two is a real, easy win against the page-height
            hard target (see DECISIONS.md's Phase 4 section for the measured
            page-height breakdown) — this still reads fine at the 1024px+
            widths that breakpoint applies to. Revisit if SETS ever grows
            past 6 (a 7th entry would wrap to a lonely second row either way). */}
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

        {/* New-set hype, folded to one line — used to be its own full-width
            card (with its own newsletter capture) between Explore and the
            blog teaser. Radiance already gets a disabled "Coming soon" tile
            in the grid above; this is the one extra fact (how soon) that
            tile can't say on its own. Hides itself once nothing upcoming is
            announced. */}
        <RadianceCountdownCard set={radianceSet} />
      </section>

      {/* About + FAQ — keyword-relevant content for search. Heading shortened
          in this pass (was "Riftbound prices in Australia, New Zealand, the
          US, the UK, Singapore and Canada — all in one place", ~103 chars —
          wrapped to 3+ lines at text-xl/extrabold on a 390px viewport and
          was a real, measured contributor to the mobile page-height hard
          target; a country-code abbreviation of the same sentence still
          wrapped twice). The six country names aren't dropped, just moved
          entirely to where they were already doing the real keyword work —
          the paragraph directly below (full names) and the page's own meta
          description (also full names) — rather than duplicated a third
          time, in the most expensive-to-render place, in a shorter form
          that's a weaker keyword signal anyway. The FAQPage JSON-LD is
          untouched either way; this on-page heading was never part of it. */}
      <section className="card-surface p-5 sm:p-6">
        <h2 className="text-xl font-extrabold text-white">Riftbound prices, compared across every store we track</h2>
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
            // no node describing itself — only an FAQPage and an ItemList, all
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
            // ItemList of the trending cards actually rendered above (the hero's
            // TrendingChips row shows the top 6 of this exact list) — trimmed
            // from 12 to 6 in this pass so the structured data matches what's
            // really on the page: PopularCardsCarousel, which used to render
            // all 12, is gone (see the REMOVED comment at the top of this file).
            ...(popularCards.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: "Trending Riftbound cards",
                    itemListElement: popularCards.slice(0, 6).map((c, i) => ({
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
