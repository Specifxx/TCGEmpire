import Link from "next/link";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/Reveal";
import { EbayPicks } from "@/components/EbayPicks";
import { ReviewsSection } from "@/components/ReviewsSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { AccountStrip } from "@/components/home/AccountStrip";
import { WelcomeBack } from "@/components/home/WelcomeBack";
import { RecentlyViewedRail } from "@/components/home/RecentlyViewedRail";
import { NextSetCountdownCard } from "@/components/home/NextSetCountdownCard";
import { LatestPosts } from "@/components/home/LatestPosts";
import { CommunityTeaser } from "@/components/home/CommunityTeaser";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { SETS, newestReleasedSet, nextUpcomingSet } from "@/lib/constants";
import { preordersHrefForSet } from "@/lib/release-calendar";
import { SITE_URL } from "@/lib/site";
import { getArticles } from "@/lib/articles";
import type { Country } from "@/lib/country";
import type { TopDeals } from "@/lib/top-deals";
import type { PriceMovers } from "@/lib/price-history";
import type { CardTileData } from "@/components/CardTile";
import type { RecentUpdate } from "@/lib/price-history";

// Below-the-fold, client-rendered components — code-split into their own
// chunks (still SSR'd for content/SEO) so their JS isn't part of the bundle
// the browser has to parse/compile before the hero above them can hydrate and
// paint. Both are well below the LCP candidate (the hero stat line), so
// neither needs to be ready any earlier than "whenever it's scrolled to."
const TodaysTopDeals = dynamic(() => import("@/components/TodaysTopDeals").then((m) => m.TodaysTopDeals));
const PopularCardsCarousel = dynamic(() =>
  import("@/components/home/PopularCardsCarousel").then((m) => m.PopularCardsCarousel),
);
const ReturnVisitCards = dynamic(() => import("@/components/home/ReturnVisitCards").then((m) => m.ReturnVisitCards));

export interface HomeSectionsProps {
  // The market this PAGE is scoped to for the single-market computations below
  // (biggest movers, the recently-updated tab, the store-count line) — the
  // homepage's own AU baseline for "/", or that market for a region page.
  country: Country;
  totalCards: number;
  storeCount: number;
  storeWord: string;
  popularCards: CardTileData[];
  // ALL FIVE markets, not just `country` — TodaysTopDeals/MarketPulse localise
  // to the VISITOR's own market client-side (useCountry()), which can differ
  // from the page's URL/baseline market (e.g. a bookmarked /au visited by
  // someone whose cookie says UK), same as the homepage always has.
  topDealsByCountry: Record<Country, TopDeals>;
  moversByCountry: Record<Country, PriceMovers>;
  recentlyUpdated: RecentUpdate[];
}

// Everything below the hero that used to exist ONLY on "/" — Today's Top
// Deals, Market Pulse, the popular-cards carousel, How It Works, Explore, the
// reviews and every other feature section. Factored out so the four region
// home pages (/au, /uk, /sg, /ca — see RegionHome.tsx) render the exact
// same feature set as "/" instead of a stripped-down page: a visitor who
// picks a market in the hero toggle must land on the SAME site, not a thinner
// one. Each region page fetches its own region-scoped data (still cache-
// shared with "/" wherever the underlying query is itself cached by market —
// see lib/top-deals.ts's getCachedTopDeals and lib/price-history.ts's
// getPriceMovers/getRecentlyUpdated) and passes it in here, so this component
// itself needs no country-fetching logic of its own — only rendering.
export function HomeSections({
  country,
  totalCards,
  storeCount,
  storeWord,
  popularCards,
  topDealsByCountry,
  moversByCountry,
  recentlyUpdated,
}: HomeSectionsProps) {
  const COUNTRY_CODES: Country[] = ["US", "AU", "UK", "SG", "CA", "EU"];
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);
  // Biggest movers tab: both directions, ranked by the size of the move, for
  // THIS page's own market. Trimmed to {card, pct} — the only two fields
  // PopularCardsCarousel's "Biggest movers" tab reads (see its own Tab type) —
  // right here, before it crosses into that client component, so each mover's
  // sparkline `points` and nowCents/refCents don't ride along unused.
  const biggestMovers = [...moversByCountry[country].spiking, ...moversByCountry[country].plummeting]
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 12)
    .map((m) => ({ card: m.card, pct: m.pct }));
  // Same trim for "Recently updated" — a separate variable (not reassigning
  // the `recentlyUpdated` prop) because the JSON-LD ItemList further down
  // still needs the full RecentUpdate list it was passed.
  const recentlyUpdatedCards = recentlyUpdated.map((u) => ({ card: u.card, pct: u.pct }));
  const newestSet = newestReleasedSet();
  // The next announced-but-unreleased set (Radiance today; rolls forward on
  // its own — see nextUpcomingSet's doc comment). undefined hides the card.
  const nextSet = nextUpcomingSet();
  // Same "point at the next one without naming it in code" pattern as nextSet
  // itself — preordersHrefForSet reads isPreorderSetCode(), so this is Radiance
  // today and clears itself the moment the set ships (getPreorderGroups() then
  // returns [], see sealed-import.ts) or a future set has no pre-order page yet.
  const preordersHref = nextSet ? preordersHrefForSet(nextSet.code) : null;
  // Two teaser rows: news/analysis/opinion from the blog, then the evergreen,
  // reference-shaped guides underneath. Same data everywhere this renders,
  // since it's the same in-memory list on every market.
  const latestBlogPosts = getArticles("blog").slice(0, 3);
  const latestGuides = getArticles("guide").slice(0, 3);
  const showNextSetCard = nextSet != null;
  const showLatestBlogPosts = latestBlogPosts.length > 0;
  const showLatestGuides = latestGuides.length > 0;

  return (
    <>
      {/* eBay Picks — the newest set's chase cards with their cheapest live
          listing, rather than a generic banner.
          MOVED INTO THE TOP SLOT 2026-09-17, on the owner's explicit
          instruction, taking the place of Market Pulse (removed in the same
          pass — see DECISIONS.md).

          THIS IS A DELIBERATE PARTIAL REVERSAL of the 2026-09-16 "game before
          money" pass, and is flagged rather than buried: that pass moved the
          playable sections ABOVE the commercial run after repeated feedback
          that the site read as "too greedy/capitalistic/money focused… for a
          card GAME", and tests/game-before-money.test.ts pinned eBay Picks
          below them. An affiliate unit now leads the page instead.

          What that pass won is NOT fully given back, and the test still pins
          the half that holds: Today's Top Deals — the bigger commercial block —
          stays BELOW Riftle/the pack simulator. The reversal is one section,
          not the ordering principle. */}
      <EbayPicks />

      {/* Unified popular-cards carousel — the all-time most-popular list, with
          a "Biggest movers" tab and "Recently updated prices" (each once its
          own always-expanded section) folded in beside it as one compact,
          tabbed, one-row horizontal scroll. Real cards whose price genuinely
          changed in the latest snapshot (see lib/price-history.ts's
          outlier-guarded diff, never fabricated); a tab simply doesn't appear
          until there's at least one real change to show.

          TWO CHANGES ON 2026-09-12, both the owner's call. A fourth tab scoped
          to Vendetta used to sit FIRST here, so the default view of this
          section was one set's demand rather than the site's. Vendetta
          released on 31 Jul 2026 — it stopped being the new set months ago,
          and set-scoped popularity belongs on /sets/<slug>, which that tab was
          only ever a teaser for. All-time leads now, which is also what the
          page's ItemList JSON-LD at the bottom of this file has always
          described.

          AND IT NOW SITS ABOVE TODAY'S TOP DEALS. Top Deals answers "what is
          cheap today"; this answers "what is everyone actually after", which
          is the broader first question and the section that sends visitors
          into card pages. */}
      <PopularCardsCarousel
        allTime={popularCards}
        movers={biggestMovers}
        recentlyUpdated={recentlyUpdatedCards}
        storeCount={storeCount}
        storeWord={storeWord}
      />

      {/* Return-visit hooks — Riftle, the pack simulator, and price alerts.
          BACK ABOVE THE COMMERCIAL RUN (2026-09-16). These sat below Top Deals,
          eBay Picks and the newsletter, which put five consecutive price
          sections between the hero and the first thing on this site you can
          actually play. Reader feedback, more than once: "simply a too
          greedy/capitalistic/money focused site for a card GAME for me" — and
          the page order was the evidence for it.

          They are also the site's best "come back tomorrow" mechanics that
          aren't the price data itself, so earning a slot this high is not
          charity. Top Deals and eBay Picks still sit inside the first screenful
          or two; they just no longer come first, second AND third. */}
      <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReturnVisitCards newestSetName={newestSet?.name} />
      </Reveal>

      {/* Today's Top Deals — the strongest differentiator, and still near the
          top: it was moved up from five sections deep, and now sits one behind
          the popular-cards carousel above (2026-09-12). Hidden if no market
          has data. */}
      {anyDeals && (
        <Reveal>
          <TodaysTopDeals dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic. After the commercial sections (deals, popular cards, movers):
          those are the stronger differentiator and shouldn't sit behind an
          explainer. */}
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
            removed Vendetta launch band. Points at whichever set is CURRENT
            rather than at one set by name, so it follows Radiance in October
            instead of going stale. */}
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

        {/* THE "BY DOMAIN" CHIP ROW (Fury/Calm/Mind/Body/Chaos/Order) WAS
            REMOVED HERE on 2026-09-17, on the owner's instruction.

            The /domains/<slug> pages themselves are untouched and are NOT
            orphaned by this: /cards renders the same six links from
            DOMAIN_PAGES (see that route's FacetGrid), and every card page
            links to its own domain facet. This drops one homepage row, not
            the domain hubs' path into the index — which is the thing that
            would actually have cost something. */}
      </section>

      {/* Next-set countdown — new-set hype, right after Explore (which already
          shows the upcoming set as a disabled "Coming soon" tile above): new-set
          searches are the biggest organic traffic spikes in TCGs, so this
          captures that intent instead of waiting for a visitor to find
          /release-dates on their own. Hides itself once nothing upcoming
          is announced. */}
      {showNextSetCard && (
        <Reveal>
          {/* preorders passed down 2026-09-17: Market Pulse used to carry the
              homepage's ONLY link to /radiance-preorders, and removing it would
              have silently dropped the pre-order CTA from the homepage six
              weeks before Radiance ships. This card is already the "next set"
              slot, so the link belongs here rather than being lost as
              collateral from a layout change nobody intended that way. */}
          <NextSetCountdownCard
            set={nextSet}
            preorders={preordersHref ? { href: preordersHref, setName: nextSet!.name } : null}
          />
        </Reveal>
      )}

      {/* Latest from the blog, then guides right underneath — fresh internal
          links + fresh content near the bottom of the page for crawl
          frequency and long-tail discovery. Each hides itself independently
          if its category has no posts (shouldn't happen, but no fake
          placeholders either way), so one running dry never leaves a gap
          where the other should be. */}
      {showLatestBlogPosts && (
        <Reveal>
          <LatestPosts
            posts={latestBlogPosts}
            heading="Latest from the blog"
            subhead="News, analysis and opinion on Riftbound and the wider TCG market."
            seeAllHref="/blog"
            seeAllLabel="See all posts"
          />
        </Reveal>
      )}
      {showLatestGuides && (
        <Reveal>
          <LatestPosts
            posts={latestGuides}
            heading="Guides & explainers"
            subhead="How Riftbound cards, sets and prices actually work."
            seeAllHref="/guides"
            seeAllLabel="See all guides"
          />
        </Reveal>
      )}

      {/* Community directory teaser — RiftCompare isn't the only Riftbound site
          worth knowing about; this points at /community's curated, unpaid
          directory of news, wikis, deck builders, tier lists and video. Same
          "further reading" slot as the blog/guides rows just above. */}
      <Reveal>
        <CommunityTeaser />
      </Reveal>

      {/* Real, consented, approved reviews — renders NOTHING until there are at
          least a few genuine ones (see ReviewsSection). No placeholder state on
          purpose: an empty "reviews" block, or a seeded example, would be worse
          than no block at all. */}
      <ReviewsSection />

      {/* The homepage's one account-shaped slot: AccountStrip pitches the free
          tier and hides itself for members; WelcomeBack is its signed-in
          twin and hides itself for everyone else. Exactly one renders. */}
      <AccountStrip />
      <WelcomeBack />

      {/* Renders nothing on the server or on a first-ever visit — see
          RecentlyViewedRail's own comment. */}
      <RecentlyViewedRail />

      {/* Approved partners + affiliate disclosure. Client component (reads
          useCountry() itself) so every visitor's eBay click here is tagged
          with THEIR actual market rather than whichever market this page's
          ISR render happened to bake in. */}
      <PartnersStrip />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
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
    </>
  );
}
