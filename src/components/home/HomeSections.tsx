import Link from "next/link";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/Reveal";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { EbayPicks } from "@/components/EbayPicks";
import { ReviewsSection } from "@/components/ReviewsSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { AccountStrip } from "@/components/home/AccountStrip";
import { RadianceCountdownCard } from "@/components/home/RadianceCountdownCard";
import { LatestPosts } from "@/components/home/LatestPosts";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { SETS, newestReleasedSet, nextUpcomingSet, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_NAME, SITE_URL } from "@/lib/site";
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
const MarketPulse = dynamic(() => import("@/components/home/MarketPulse").then((m) => m.MarketPulse));
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
  popularVendetta: CardTileData[];
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
  popularVendetta,
  topDealsByCountry,
  moversByCountry,
  recentlyUpdated,
}: HomeSectionsProps) {
  const COUNTRY_CODES: Country[] = ["AU", "US", "UK", "SG", "CA"];
  const anyDeals = COUNTRY_CODES.some((c) => topDealsByCountry[c].hasAny);
  // Biggest movers tab: both directions, ranked by the size of the move, for
  // THIS page's own market.
  const biggestMovers = [...moversByCountry[country].spiking, ...moversByCountry[country].plummeting]
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 12);
  const newestSet = newestReleasedSet();
  // The next announced-but-unreleased set (Radiance today; rolls forward on
  // its own — see nextUpcomingSet's doc comment). undefined hides the card.
  const radianceSet = nextUpcomingSet();
  // The teaser row shows GUIDES, not blog posts — the evergreen, reference-
  // shaped content a first-time visitor actually needs. Same data everywhere
  // this renders, since it's the same in-memory list on every market.
  const latestPosts = getArticles("guide").slice(0, 3);
  const showRadianceCard = radianceSet != null;
  const showLatestPosts = latestPosts.length > 0;

  return (
    <>
      {/* Market pulse — today's top risers/fallers, reusing the Daily Movers
          data. Sits right after the hero: the single strongest "come back
          tomorrow" signal a price site can show, so it earns above-the-fold
          placement. Hides itself if there's nothing to show today. */}
      <MarketPulse moversByCountry={moversByCountry} />

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
          movers" tab, AND "Recently updated prices" — which used to be its
          own always-expanded section — into one compact, tabbed, one-row
          horizontal scroll. Real cards whose price genuinely changed in the
          latest snapshot (see lib/price-history.ts's outlier-guarded diff,
          never fabricated); the tab simply doesn't appear until there's at
          least one real change to show. */}
      <PopularCardsCarousel
        vendetta={popularVendetta}
        allTime={popularCards}
        movers={biggestMovers}
        recentlyUpdated={recentlyUpdated}
        storeCount={storeCount}
        storeWord={storeWord}
      />

      {/* Return-visit hooks — Riftle, the pack simulator, and price alerts —
          directly after Most popular cards. These are the site's best "come
          back tomorrow" mechanics that aren't the price data itself, so they
          get the slot right after the strongest card-browsing section instead
          of competing with it. */}
      <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReturnVisitCards newestSetName={newestSet?.name} />
      </Reveal>

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic. After the commercial sections (deals, popular cards, movers):
          those are the stronger differentiator and shouldn't sit behind an
          explainer. */}
      <HowItWorks totalCards={totalCards} />

      {/* Best Basket promo — the multi-store cart optimiser is the hardest
          feature in this category to replicate (it needs real per-store
          shipping data, not just prices) and answers the single highest-intent
          moment in the hobby: "I have a decklist, what's the cheapest way to
          buy all of it". Server-rendered real <Link>, so it's crawlable, not a
          client-only teaser. */}
      <Link
        href="/tools/best-basket"
        className="card-surface group flex flex-wrap items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800 sm:flex-nowrap"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-2xl leading-none" aria-hidden>
          🧺
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Building a decklist? Find the cheapest way to buy it</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Best Basket splits your list across stores — postage included — and finds the lowest total cost, not just
            the lowest sticker price on each card.
          </p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Try Best Basket →</span>
      </Link>

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
          captures that intent instead of waiting for a visitor to find
          /radiance-countdown on their own. Hides itself once nothing upcoming
          is announced. */}
      {showRadianceCard && (
        <Reveal>
          <RadianceCountdownCard set={radianceSet} />
        </Reveal>
      )}

      {/* Latest from the blog — fresh internal links + fresh content near the
          bottom of the page for crawl frequency and long-tail discovery.
          Hides itself if there are no posts (shouldn't happen, but no fake
          placeholders either way). */}
      {showLatestPosts && (
        <Reveal>
          <LatestPosts posts={latestPosts} />
        </Reveal>
      )}

      {/* Real, consented, approved reviews — renders NOTHING until there are at
          least a few genuine ones (see ReviewsSection). No placeholder state on
          purpose: an empty "reviews" block, or a seeded example, would be worse
          than no block at all. */}
      <ReviewsSection />

      {/* The homepage's one free-account pitch — hides itself for members.
          See AccountStrip for why this is ISR-safe. */}
      <AccountStrip />

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
