import Link from "next/link";
import { Filters } from "@/components/Filters";
import { InlineAds } from "@/components/InlineAds";
import { AdSlot } from "@/components/AdSlot";
import { RelatedGuides } from "@/components/RelatedGuides";
import { CHAMPIONS } from "@/lib/champions";
import { SITE_URL } from "@/lib/site";
import { guidesForTool } from "@/lib/content/tool-guides";
import { browseQuery, type BrowseParams, type BrowseView as View } from "@/lib/browse-view";
import { isCleanPagination } from "@/lib/browse-seo";
import { BrowseMarketBoard, BrowseMarketWord } from "./BrowseMarketBoard";

// Breakout Google Trends champions get first billing in the cross-link row
// below. Deliberately a short curated list, not all ~80 champions — this is
// a discovery aid on the default view, not a directory (that's what
// /champions itself, linked right after these, is for).
const POPULAR_CHAMPION_SLUGS = ["vex", "draven", "azir", "leblanc", "irelia"];

// The card list, drawn by both of its routes (2026-11-05, DECISIONS.md "The card
// list becomes one CDN copy per URL"): app/browse/page.tsx renders the baseline
// market and is kept by the CDN; app/browse/search/page.tsx renders a metered
// text search for the visitor's own market. One tree, so the two can never
// drift: the JSON-LD, the filters, the intro and the BrowseMarketBoard island,
// which swaps in the visitor's market where the view is not pinned.
export function BrowseView({
  searchParams,
  view,
  pinned,
  before,
}: {
  searchParams: BrowseParams;
  view: View;
  /** The view is the visitor's already (a `?market=` link or a metered search): the island fetches nothing. */
  pinned: boolean;
  /** The search route's quota tick, drawn first in the results column. */
  before?: React.ReactNode;
}) {
  const { country, q, page, totalPages, cards } = view;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Browse Cards", item: `${SITE_URL}/browse` },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Riftbound Card Database — All Cards & Prices",
    // Matches the page's canonical: clean paginated views self-canonicalise, so
    // their structured data must not contradict that with a bare /browse url.
    url:
      page > 1 && isCleanPagination(searchParams) && page <= totalPages
        ? `${SITE_URL}/browse?page=${page}`
        : `${SITE_URL}/browse`,
    description:
      "Browse every Riftbound TCG card and compare live prices across stores to find the cheapest place to buy Riftbound singles. Updated twice a day.",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    // ItemList of the cards actually rendered on this page (ranked positionally).
    ...(cards.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: cards.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              url: `${SITE_URL}/card/${c.slug ?? c.id}`,
            })),
          },
        }
      : {}),
  };
  const word = (what: "place" | "currency" | "ebay-us-note") => <BrowseMarketWord baseline={country} pinned={pinned} what={what} />;

  return (
    // xl:flex-row, not lg: the filter sidebar only sits beside the results from
    // 1280 (see Filters.tsx). With the permanent 17rem rail a 1024px row left
    // the results 424px wide (2026-09-23).
    <div className="flex flex-col gap-6 xl:flex-row">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, collectionLd]) }}
      />
      {/* The market column's currency, which honours ?market= (country above). */}
      <Filters currency={view.currency} />

      <section className="min-w-0 flex-1">
        {before}
        {!q && (
          <div className="mb-4">
            {/* H1 carries the same exact phrase as the <title> (see
                browseMetadata's comment for why this page owns "Riftbound card
                list"). "Buy Riftbound Cards" — the previous H1 — moves into the
                subhead rather than being dropped, so the buy intent it carried is
                still on the page in visible copy. Market list corrected here too:
                it named AU/US/UK only, three launches out of date. */}
            <h1 className="font-display text-2xl font-extrabold text-white">Riftbound Card List</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Browse the full list of Riftbound cards and buy Riftbound cards for less — every
              single, with live prices compared across local stores in the US, AU, UK, Singapore,
              Canada &amp; the EU to find the cheapest place to buy.
            </p>
            {/* How to read the grid (2026-09-26, "Blog and tools, joined up" in
                DECISIONS.md): what a tile's price is, how fresh it is, and where
                postage comes in — the card list had none of it. Under the H1 by
                the owner's brief; kept to two short paragraphs so the grid still
                starts high on a phone. Written for the visitor's own market
                (place and currency): the
                baseline's words in the HTML, theirs after hydration
                (BrowseMarketWord), so it costs no query and no cookie read. */}
            <div className="mt-2 max-w-2xl space-y-2 text-sm leading-relaxed text-slate-400">
              <p>
                A tile&apos;s &ldquo;from&rdquo; price is the cheapest in-stock listing we have for that card in{" "}
                {word("place")}, in {word("currency")} — the item price, before postage
                {word("ebay-us-note")}.
                &ldquo;Stocked elsewhere&rdquo; means no seller in {word("place")} has it in stock but
                another market does. Prices come from two imports a day, at 07:00 and 19:00 UTC.
              </p>
              <p>
                The list opens on the cards searched and viewed most here; sort it by price, name or set and
                card number, or filter by set, domain, rarity, type or printing. Open a card for every store&apos;s price,
                cheapest first by item price, with the delivered total shown where the store publishes its postage (
                <Link href="/methodology#ordering" className="text-brand-400 hover:underline">how we compare</Link>
                ). For every card&apos;s price in one table, sorted dearest first, see the{" "}
                <Link href="/price-guide" className="text-brand-400 hover:underline">Riftbound price guide</Link>. New to buying? See{" "}
                <Link href="/guides/where-to-buy-riftbound-cards" className="text-brand-400 hover:underline">where to buy Riftbound cards</Link>{" "}
                in each market.
              </p>
            </div>
            {/* Popular-champion cross-links — /browse had no path into the
                per-champion hub pages at all (card pages already link to
                them; this was the other half the brief asked for). Only
                on the default view, matching the H1/subhead above it, so a
                filtered/searched view (noindexed, canonicalized to plain
                /browse) doesn't carry a duplicate set of the same links.

                tap-link on both (2026-09-23): the chips measured 26px tall and
                "All champions" 95x16 at 390. `.chip` itself stays a badge (the
                TrendingChips precedent); tap-link is 24px on a mouse, 48px on touch. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500">Popular champions:</span>
              {POPULAR_CHAMPION_SLUGS.map((slug) => {
                const champ = CHAMPIONS.find((c) => c.slug === slug);
                if (!champ) return null;
                return (
                  <Link
                    key={slug}
                    href={`/champions/${slug}`}
                    className="chip tap-link border border-ink-700 px-2.5 py-1 font-semibold text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
                  >
                    {champ.name}
                  </Link>
                );
              })}
              <Link href="/champions" className="tap-link text-brand-400 hover:underline">
                All champions →
              </Link>
            </div>
          </div>
        )}

        {/* The count, controls, eBay search, active filters, EbayPicks, sealed
            matches, grid and pager for the visitor's market; the HTML carries
            the baseline market's (see the island). EbayPicks never gets the
            visitor's query: it sells the newest set's chase cards. */}
        <BrowseMarketBoard
          baseline={view}
          query={browseQuery(searchParams)}
          pinned={pinned}
          marketParam={searchParams.market || undefined}
          picks={<InlineAds className="mt-6" pageType="browse" />}
          guides={<RelatedGuides guides={guidesForTool("/browse")} />}
        />

        {/* Below the results (was above, ahead of EbayPicks) — a visitor
            searching a card wants to see matches first; the ad now sits after
            them instead of being the first thing rendered. */}
        <AdSlot format="horizontal" height={90} className="mt-6" />
      </section>
    </div>
  );
}
