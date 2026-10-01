import Link from "next/link";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/Reveal";
import { EbayPicks } from "@/components/EbayPicks";
import { ReviewsSection } from "@/components/ReviewsSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { AccountStrip } from "@/components/home/AccountStrip";
import { WelcomeBack } from "@/components/home/WelcomeBack";
import { NextSetCountdownCard } from "@/components/home/NextSetCountdownCard";
import { CommunityTeaser } from "@/components/home/CommunityTeaser";
import { PartnersStrip } from "@/components/home/PartnersStrip";
import { PokemonHomePromo } from "@/components/pokemon/PokemonHomePromo";
import { SETS, hasSetHub, newestReleasedSet, nextUpcomingSet } from "@/lib/constants";
import { preordersHrefForSet, spoilersHrefForSet } from "@/lib/release-calendar";
import { SITE_URL } from "@/lib/site";
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
  /** Emit the "Most popular Riftbound cards" ItemList JSON-LD. False where the
   *  page's "Riftbound card prices today" table already lists these cards and
   *  owns that markup (2026-09-24); the carousel came back on 2026-09-26 as a
   *  visual shelf, not as a second list for search engines. */
  popularItemList?: boolean;
  /** Render Today's Top Deals here (the region homes). "/" renders it itself, directly under the hero (2026-09-30). */
  showTopDeals?: boolean;
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
  popularItemList = true,
  showTopDeals = true,
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
  // The next set's live reveal tracker, for the run-up only (spoilersHrefForSet
  // returns null from the street date). Added 2026-09-21, four days before
  // Radiance Preview Season: "riftbound radiance spoilers" and "… card list"
  // were the site's #2 and #5 Search Console queries and the homepage linked
  // neither — the front door had no path to the page those searchers wanted.
  const spoilersHref = nextSet ? spoilersHrefForSet(nextSet.code) : null;
  const showNextSetCard = nextSet != null;

  return (
    <>
      {/* Recently viewed WAS the first thing here (2026-09-19 to 2026-09-28).
          Removed from the homepage on the owner's instruction ("get rid of
          recently viewed from the homepage"). It stays where it is useful
          elsewhere: the search box's empty state and the card page. */}

      {/* Today's Top Deals — THE TOP CONTENT SLOT as of 2026-09-21, owner's
          explicit instruction ("put today's top deals at the very top just
          under recently viewed"). The first section here; it follows the
          hero, the editorial band and the price table, which render above
          this component (2026-09-28 order: see page.tsx).

          THIS COMPLETES THE REVERSAL of the 2026-09-16 "game before money"
          pass, and is flagged rather than buried. That pass moved the playable
          sections (Riftle, the pack simulator) ABOVE the commercial run after
          repeated feedback that the site read as "too greedy/capitalistic/
          money focused… for a card GAME", and tests/game-before-money.test.ts
          pinned Top Deals below them. 2026-09-17 already reversed half of it
          by promoting eBay Picks into the top slot; this moves the larger
          commercial block above the playable ones too, which is the half that
          test still held. See DECISIONS.md.

          What survives that pass is what does not depend on this page's
          section order: Games still outrank the money tools in the nav, the
          "how it works" story still ends past the till at something playable,
          and nothing was removed to make room — all still pinned by the same
          test file. Hidden entirely if no market has data. */}
      {showTopDeals && anyDeals && (
        <Reveal>
          <TodaysTopDeals dealsByCountry={topDealsByCountry} />
        </Reveal>
      )}

      {/* The Pokémon section's one line (2026-10-01, owner's request), on all
          six homes: after Top Deals and the editorial band, never above them.
          Renders nothing while the section is off (lib/pokemon/flag.ts). */}
      <PokemonHomePromo />

      {/* eBay Picks — the newest set's chase cards with their cheapest live
          listing, rather than a generic banner. Held the top slot from
          2026-09-17 (where it replaced the removed Market Pulse) until
          2026-09-21, when Today's Top Deals was moved above it on the owner's
          instruction — see that section's comment and DECISIONS.md. */}
      <EbayPicks pageType="homepage" />

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

          It sat ABOVE Today's Top Deals from 2026-09-12 until 2026-09-21, on
          the reasoning that "what is everyone actually after" is the broader
          first question. Top Deals now leads the page instead (owner's
          instruction — see its comment above); this keeps the slot directly
          behind the two commercial units, and is still the section that sends
          the most visitors into card pages. */}
      <PopularCardsCarousel
        allTime={popularCards}
        movers={biggestMovers}
        recentlyUpdated={recentlyUpdatedCards}
        storeCount={storeCount}
        storeWord={storeWord}
      />

      {/* Return-visit hooks — Riftle, the pack simulator, and price alerts.
          These were moved ABOVE the commercial run on 2026-09-16, after
          repeated reader feedback that the site read as "simply a too
          greedy/capitalistic/money focused site for a card GAME for me" and
          the page order was the evidence for it. That ordering was reversed in
          two steps by owner instruction — eBay Picks on 2026-09-17, Today's
          Top Deals on 2026-09-21 — so the playable sections now sit behind
          both, as they did before that pass. See DECISIONS.md.

          They remain the site's best "come back tomorrow" mechanics that
          aren't the price data itself, and they still sit ahead of the
          explainer and the set/domain grid below. The editorial run no longer
          follows them: since 2026-09-26 it is the band above this component,
          under the price table (owner decision; see EditorialHub.tsx). */}
      {/* Three across only from 1440 (2026-09-23): beside the 17rem rail the
          three cards were 224px at 1024 and ~300px at 1280, leaving their text
          columns 16-110px wide next to the shrink-0 CTA, one word per line and
          running under the button. Below 1440 it is two across with the last
          card spanning the row, which also ends the half-width orphan at
          640-1023. grid-cols-1 per tests/grid-base-columns.test.ts. */}
      <Reveal stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 min-[1440px]:grid-cols-3 min-[1440px]:[&>*:last-child]:col-span-1">
        <ReturnVisitCards newestSetName={newestSet?.name} />
      </Reveal>

      {/* How it works — orients first-time visitors to the search → compare → buy
          mechanic. After the commercial sections (deals, popular cards, movers):
          those are the stronger differentiator and shouldn't sit behind an
          explainer. */}
      <HowItWorks totalCards={totalCards} />

      {/* Explore — sets + domains consolidated into one entry point */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Explore the database</h2>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By set</div>
        {/* SETS has 6 entries: 2 × 3 on phones, 3 × 2 from sm, one row of 6 at
            xl — DECISIONS "Grid density" moved this grid to 6 columns to avoid
            a lonely second row, and it regressed to `lg:grid-cols-5` ([5,1],
            RAD alone) when the section moved here. xl rather than lg because
            from lg the 17rem rail leaves only ~704px of content (2026-09-23). */}
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {SETS.map((s) =>
            // An unreleased set in its preview season (comingSoon + hubReady,
            // Radiance from 25 Sep 2026) keeps its "Coming soon" cue but links to
            // its card gallery: every card shown so far, on one page. An
            // unreleased set with no hub yet (no cards, no sealed) stays a
            // disabled tile.
            s.comingSoon && !s.sealedAvailable ? (
              hasSetHub(s) ? (
                <Link
                  key={s.code}
                  href={`/sets/${s.slug}/gallery`}
                  className="card-surface flex flex-col gap-1 p-4 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-lg font-bold text-white">
                    {s.code}
                    <span className="chip bg-gold/20 text-gold">Coming soon</span>
                  </span>
                  <span className="text-xs text-slate-400">{s.name} · card gallery →</span>
                </Link>
              ) : (
                <div key={s.code} className="card-surface flex flex-col gap-1 p-4 opacity-60" aria-disabled>
                  <span className="flex items-center gap-2 text-lg font-bold text-white">
                    {s.code}
                    <span className="chip bg-gold/20 text-gold">Coming soon</span>
                  </span>
                  <span className="text-xs text-slate-400">{s.name}</span>
                </div>
              )
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
            rather than at one set by name: the set in its preview season when
            there is one (its gallery is the page people are looking for, and
            it has no complete count to quote yet), else the newest released
            set, which is Radiance again from 23 October. */}
        {nextSet && hasSetHub(nextSet) ? (
          <p className="mt-3 text-sm">
            <Link
              href={`/sets/${nextSet.slug}/gallery`}
              className="font-semibold text-brand-300 underline-offset-2 hover:underline"
            >
              See every {nextSet.name} card shown so far in the gallery →
            </Link>
          </p>
        ) : newestSet && (
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
          shows the upcoming set as a "Coming soon" tile above): new-set
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
            spoilers={spoilersHref ? { href: spoilersHref, setName: nextSet!.name } : null}
          />
        </Reveal>
      )}

      {/* REMOVED 2026-09-26: the "Latest from the blog" and "Guides &
          explainers" rows that sat here, about nine phone screens down. They
          are replaced, not duplicated, by the editorial band (EditorialHub)
          that the owner placed above this whole component, directly under the
          price table — see its header and "Blog and tools, joined up" in
          DECISIONS.md. */}

      {/* Community directory teaser — RiftCompare isn't the only Riftbound site
          worth knowing about; this points at /community's curated, unpaid
          directory of news, wikis, deck builders, tier lists and video: the
          "further reading" that follows our own writing in the band above. */}
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

      {/* Approved partners + affiliate disclosure. Client component (reads
          useCountry() itself) so every visitor's eBay click here is tagged
          with THEIR actual market rather than whichever market this page's
          ISR render happened to bake in. */}
      <PartnersStrip />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            // ItemList of the "Most popular Riftbound cards" actually rendered above
            // — unless the price table above the fold already carries it.
            ...(popularItemList && popularCards.length > 0
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
