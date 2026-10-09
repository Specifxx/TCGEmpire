import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, normalizeCountry } from "@/lib/country";
import { Filters } from "@/components/Filters";
import { ActiveFilters } from "@/components/ActiveFilters";
import { EbayPicks } from "@/components/EbayPicks";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { SortSelect } from "@/components/SortSelect";
import { CardTile } from "@/components/CardTile";
import { SealedTile } from "@/components/SealedTile";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { AdSlot } from "@/components/AdSlot";
import { CHAMPIONS } from "@/lib/champions";
import {
  buildCardOrderBy,
  buildCardWhere,
  cardTileSelect,
  trimTileArtFallback,
  CardQuery,
  parsePageNum,
  parsePageSize,
} from "@/lib/cards";
import { SITE_URL } from "@/lib/site";
import { getSealedGroups } from "@/lib/sealed-import";
import { loadSealedForSearch, matchSealedGroups } from "@/lib/sealed-search";
import { soldOutEverywhere } from "@/lib/sealed-offers";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { quotaContext, refusedNow } from "@/lib/search-quota-server";
import { SearchLimitPanel } from "@/components/SearchLimitPanel";
import { SearchQuotaTick } from "@/components/SearchQuotaTick";

/** /browse opens on "Most popular" (lib/cards.ts buildCardOrderBy). */
const BROWSE_DEFAULT_SORT = "popular";

/** The free-account prompt sits after this many tiles (fewer on a short page: after the last). */
const BROWSE_PROMPT_AFTER = 12;

/**
 * Sealed products shown above the card grid for a text search (2026-10-04, owner:
 * "if I search origins and I click enter, there's no sealed products found").
 * More than this link on to /sealed?q= for the rest.
 */
const BROWSE_SEALED_SHOWN = 6;

/** Filters that only mean something for single cards: a sealed box has no rarity, domain or printing. */
const CARD_ONLY_FILTERS = [
  "domain", "rarity", "type", "set", "variant", "tag", "rules", "rulesSet",
  "sig", "over", "ult", "promo", "printing", "priced", "min", "max",
] as const satisfies readonly (keyof CardQuery)[];

// searchParams-driven (filters/pagination), so the route stays dynamic.
export const dynamic = "force-dynamic";

// Breakout Google Trends champions get first billing in the cross-link row
// below. Deliberately a short curated list, not all ~80 champions — this is
// a discovery aid on the default view, not a directory (that's what
// /champions itself, linked right after these, is for).
const POPULAR_CHAMPION_SLUGS = ["vex", "draven", "azir", "leblanc", "irelia"];

// Browse is the main "buy Riftbound cards" landing page, so give it a strong title
// and description. Metadata is market-neutral: Googlebot crawls mostly from US IPs,
// so geo-derived copy would index the US variant for every market. Internal
// search-result views (?q=) are noindex'd (Google discourages indexing site-search
// results) and canonicalise to the clean /browse.
//
// Pagination canonicals: ONLY the clean default view (?page=N and nothing else)
// self-canonicalises — per Google's guidance paginated pages are not duplicates of
// page 1, and folding them into /browse discards the card links only those pages
// carry. Any sized/sorted/filtered variant still canonicalises to /browse (its
// content is a permutation, and /browse?page=2&size=10 shows entirely different
// cards than /browse?page=2 — they must never share a canonical). Out-of-range
// pages are noindex'd so the scheme can't manufacture indexable empty soft-404s.
//
// RE-CONFIRMED, not changed, by a later audit that flagged this as a duplicate-
// canonical bug and pointed at /blog and /gallery as the "correct" model. Neither
// is actually comparable: /blog's `?page=` and /gallery's are not read by either
// route at all (both paginate, if at all, purely client-side over a page that
// serves the SAME full HTML regardless of the query string) — their shared
// canonical is a side effect of having nothing paginated to protect, not a
// deliberate pagination policy. /browse is the one route on this site with REAL
// server-driven pagination (Prisma skip/take produces a genuinely different card
// set per page), which is exactly the case Google's pagination guidance is about,
// and self-referencing canonicals are what that guidance actually recommends —
// canonicalising every page back to page 1 would tell Google pages 2-15 are
// duplicates and drop their card links from the index, the opposite of the fix
// asked for. The real, separate bug that audit also found — every paginated
// page sharing byte-identical title/description with page 1 — is fixed below
// instead, without touching canonicalization.
const isCleanPagination = (searchParams: CardQuery) =>
  Object.entries(searchParams).every(([k, v]) => k === "page" || v == null || v === "");

export async function generateMetadata({ searchParams }: { searchParams: CardQuery }): Promise<Metadata> {
  const q = (searchParams.q ?? "").trim();
  const page = parsePageNum(searchParams.page);
  // Title leads with the exact phrase "Riftbound Card List" (2026-09-17). This
  // page is the OWNER of that query — see docs/seo-keyword-map.md, whose row for
  // it pointed at `/guides/riftbound-card-list` as "not yet built" for a month
  // after backlog item 12 had already been closed by shipping
  // `/guides/riftbound-sets-in-order`. That guide answers a genuinely different
  // question (which SETS exist, in release order); nobody typing "riftbound card
  // list" wants a set list, they want the list of cards — which is this page, and
  // has been all along. The map row is corrected rather than a third page built,
  // per that file's own rule 5 (publish fewer pages than feels natural).
  //
  // It REPLACES the exact phrase "Riftbound Cards" that the 2026-08-20 audit
  // front-loaded here, deliberately and with the same reasoning that audit used:
  // one page, one exact-match phrase. "Riftbound Card" survives inside "Card
  // List" for the singular query, the H1/subhead/JSON-LD below still say
  // "Riftbound cards" verbatim, and `/cards` ("Browse Riftbound Cards by Type,
  // Rarity & Printing") keeps a title-level exact match on the plural.
  //
  // The /browse-vs-"/" split that audit established is UNCHANGED and is what
  // makes this safe: /browse owns card-database/list intent, "/" owns
  // comparison intent ("Riftbound prices", "riftbound price check"). Neither
  // title now contains the other's phrase.
  // NO manual "| RiftCompare" suffix — title is a plain string here (not
  // wrapped in { absolute: ... }), so layout.tsx's title template ("%s —
  // RiftCompare") already appends it once; adding it by hand doubled the
  // suffix ("... | RiftCompare — RiftCompare"), caught visually while
  // verifying this change.
  //
  // PAGE-AWARE title/description (page > 1): a later audit found every
  // paginated view sharing byte-identical title/description with page 1 —
  // fixed here, belt-and-suspenders alongside each page's own self-referencing
  // canonical below (see isCleanPagination's comment for why that canonical
  // stays self-referencing rather than pointing at page 1 — this is the other,
  // independent half of the same finding: even pages that are correctly NOT
  // duplicates of each other in Google's eyes still read as one in the SERP
  // snippet if the words are identical, which is a real CTR cost regardless of
  // canonicalization).
  const pageSuffix = page > 1 ? ` — Page ${page}` : "";
  const base = {
    title: q ? `${q} — Riftbound cards & prices${pageSuffix}` : `Riftbound Card List — Browse & Compare Prices${pageSuffix}`,
    // Market list corrected to all six tracked markets while this copy was being
    // rewritten anyway: it still said "AU, US, UK & SG" — the set of markets as
    // they stood before Canada (2026-08) and the EU (2026-08-23) launched, both
    // of which the homepage description has named for weeks.
    description:
      page > 1
        ? `The full Riftbound card list — every card in one database, with live prices across US, AU, UK, Singapore, Canada & EU stores. Page ${page}.`
        : "The full Riftbound card list — every card in one database, with live prices compared across US, AU, UK, Singapore, Canada & EU stores. Updated twice a day.",
  };
  if (q) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
  if (page > 1 && isCleanPagination(searchParams)) {
    // Guard the self-canonical against out-of-range pages (a 200 with an empty
    // grid must not become an indexable canonical target). Default page size —
    // the clean view has no size param by definition.
    const total = await prisma.card.count().catch(() => 0);
    const totalPages = Math.max(1, Math.ceil(total / parsePageSize(undefined)));
    if (page > totalPages) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
    return { ...base, alternates: { canonical: `/browse?page=${page}` } };
  }
  return { ...base, alternates: { canonical: "/browse" } };
}

export default async function BrowsePage({ searchParams }: { searchParams: CardQuery & { market?: string } }) {
  // The route reads searchParams so it is per-request dynamic regardless — the
  // cookie read costs nothing extra here, and sort/filter MUST use the visitor's
  // market or the grid renders local prices in AU-column order (US$12 above US$3)
  // and price filters drop cards with no AU listing. Only the METADATA is
  // market-neutral (that's what Googlebot indexes).
  //
  // ?market=US (etc.) is an explicit override of the cookie/geo default, so an
  // agent (which carries neither) can construct a deterministic URL for
  // "cheapest X for a US buyer" instead of the market being invisible client
  // state. normalizeCountry() safely coerces anything invalid to the US
  // default, so an unrecognised value degrades to today's behaviour rather
  // than erroring. No explicit noindex/canonical handling needed here: like
  // every other filter param, a non-empty searchParams object already falls
  // through generateMetadata's default branch to `canonical: "/browse"`.
  const country = searchParams.market ? normalizeCountry(searchParams.market) : getCountry();
  const where = buildCardWhere(searchParams, country);
  // Default sort is "Most popular" (2026-09-26): set-and-number put US$0.01
  // commons on page 1. The demand counters it ranks by are still written
  // (api/card/[id]/view). ?sort=number etc. keep working for shared links.
  const orderBy = buildCardOrderBy(searchParams.sort || BROWSE_DEFAULT_SORT, country);
  const size = parsePageSize(searchParams.size);
  const page = parsePageNum(searchParams.page);

  // EGRESS: this route is force-dynamic (searchParams), so WITHOUT this every
  // single visitor and every crawler hit ran two Postgres queries — and /browse
  // is both the site's main landing page and the deepest crawl surface. That made
  // it the largest consumer of a Neon network-transfer allowance this project has
  // already exhausted three times.
  //
  // The DEFAULT view (no filters, no sort, no paging — the one crawlers and most
  // visitors actually get) is identical for every visitor in a given market, so
  // it's memoised per country. Any filtered/sorted/paged view still queries live:
  // those are long-tail, per-user, and caching the full permutation space would
  // be pointless. Tagged CONTENT_TAG so the price import purges it immediately
  // rather than serving up to an hour of stale prices.
  //
  // Payload is ~100 rows of cardTileSelect (tens of KB) — comfortably under the
  // size ceiling above which Next's Data Cache silently declines to store an
  // entry and every request falls through to the database (see lib/db.ts).
  const isDefaultView = Object.values(searchParams).every((v) => v == null || v === "");

  // THE DAILY SEARCH ALLOWANCE (2026-10-09, lib/search-quota.ts). A text search's
  // first page is metered like the typeahead: a query already counted today (or
  // one the dropdown counted as it was typed) is free, a new one counts, and one
  // past the allowance is refused here BEFORE any query runs. A server component
  // cannot set a cookie, so <SearchQuotaTick> counts an allowed new search from
  // the client. Paging and filters on an allowed search are never metered.
  const searchQ = (searchParams.q ?? "").trim();
  const quota = searchQ.length >= 2 && page === 1 ? await quotaContext() : null;
  if (quota && refusedNow(quota, searchQ)) {
    return (
      <section className="mx-auto max-w-2xl py-6">
        <h1 className="font-display text-2xl font-extrabold text-white">Search for “{searchQ}”</h1>
        <div className="mt-4">
          <SearchLimitPanel tier={quota.tier} next={`/browse?q=${encodeURIComponent(searchQ)}`} />
        </div>
        <p className="mt-4 text-sm text-slate-400">
          You can still <Link href="/browse" className="text-brand-400 hover:underline">browse every card</Link>, open any{" "}
          <Link href="/sets" className="text-brand-400 hover:underline">set</Link> or{" "}
          <Link href="/champions" className="text-brand-400 hover:underline">champion</Link>, and compare prices on every card page.
        </p>
      </section>
    );
  }
  const runQuery = () =>
    Promise.all([
      prisma.card.count({ where }),
      prisma.card.findMany({
        where,
        orderBy,
        select: cardTileSelect(country),
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
  const [total, cards] = isDefaultView
    ? await unstable_cache(runQuery, ["browse-default-popular", country], {
        revalidate: 3600,
        tags: [CONTENT_TAG],
      })()
    : await runQuery();
  const totalPages = Math.max(1, Math.ceil(total / size));
  // The visitor's own words, for the eBay search beside the results
  // (2026-09-26). Trimmed like generateMetadata's; empty means no search.
  const q = (searchParams.q ?? "").trim();
  // SEALED PRODUCTS MATCHING THE SAME WORDS, on a plain text search's first page
  // (not under a card-only filter, which a box cannot satisfy, and not repeated on
  // page 2+). The same matcher the navbar dropdown uses (lib/sealed-search.ts), so
  // what the dropdown offered is what Enter shows. getSealedGroups caches itself
  // (memo + data cache), is called here at page level and never from inside an
  // unstable_cache callback (egress rule 6), and a failure only drops the section.
  const wantsSealed = q.length >= 2 && page === 1 && CARD_ONLY_FILTERS.every((k) => !searchParams[k]);
  const sealedRead = wantsSealed
    ? await loadSealedForSearch(country, getSealedGroups).catch(() => null)
    : null;
  const sealedMatches = sealedRead ? matchSealedGroups(sealedRead.groups, q) : [];
  const sealedShown = sealedMatches.slice(0, BROWSE_SEALED_SHOWN);
  const sealedCurrency = sealedRead ? COUNTRIES[sealedRead.priceCountry].currency : COUNTRIES[country].currency;
  // Whether anything at all answers the search: single cards or sealed products.
  const hasResults = total > 0 || sealedMatches.length > 0;
  // The tile the free-account prompt follows: the 12th, or the last on a short page.
  const promptAfterId = cards[Math.min(BROWSE_PROMPT_AFTER, cards.length) - 1]?.id;

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
      <Filters currency={COUNTRIES[country].currency} />

      <section className="min-w-0 flex-1">
        {quota?.metered && <SearchQuotaTick q={searchQ} />}
        {!searchParams.q && (
          <div className="mb-4">
            {/* H1 carries the same exact phrase as the <title> (see
                generateMetadata's comment for why this page owns "Riftbound card
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
                (place, currency, and Canada's converted "eBay US" rows) from
                data the page already holds, so it costs no query. */}
            <div className="mt-2 max-w-2xl space-y-2 text-sm leading-relaxed text-slate-400">
              <p>
                A tile&apos;s &ldquo;from&rdquo; price is the cheapest in-stock listing we have for that card in{" "}
                {COUNTRIES[country].place}, in {COUNTRIES[country].currency} — the item price, before postage
                {country === "CA" ? <>, and sometimes an &ldquo;eBay US&rdquo; listing converted from US dollars at our reference rate</> : null}.
                &ldquo;Stocked elsewhere&rdquo; means no seller in {COUNTRIES[country].place} has it in stock but
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
        {/* #results is where Filters' "Show results" lands. On this row, not the
            section: the section's top is ~750px above the first tile. scroll-mt-36
            clears the 125px sticky header below xl (2026-09-23). */}
        <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-white">{total.toLocaleString()}</span>{" "}
            {total === 1 ? "card" : "cards"}
            {searchParams.q && (
              <> for <span className="text-brand-400">“{searchParams.q}”</span></>
            )}
            {sealedMatches.length > 0 && (
              <>
                {" "}· <span className="font-semibold text-white">{sealedMatches.length.toLocaleString()}</span> sealed{" "}
                {sealedMatches.length === 1 ? "product" : "products"}
              </>
            )}
            {total > 0 && <span className="text-slate-600"> · page {page} of {totalPages}</span>}
          </p>
          <div className="flex items-center gap-3">
            <PageSizeSelect size={size} />
            <SortSelect defaultSort={BROWSE_DEFAULT_SORT} />
          </div>
        </div>

        {/* SEARCH EBAY FOR THE SAME WORDS (2026-09-26, "Pushing eBay clicks" in
            DECISIONS.md). A visitor who typed a search has said what they want
            to buy, so eBay's search for those words sits by the count that
            answers them. freeText copy ("Search eBay for “q”", never "Buy q"):
            the words are the visitor's, not a card name, and we do not know
            eBay has a listing for them. A client component, so it localises
            with useCountry. Compact here; with no results at all the full one
            below takes its place, as the only way forward. */}
        {q && hasResults && (
          <EbayBuyCta query={q} freeText compact source="browse-search" pageType="browse" surface="ebay_search" className="mb-4" />
        )}

        <ActiveFilters />

        {/* Tailored eBay unit. Above the results grid: browse is where buying
            intent is highest, and the tiles are chase cards rather than a
            generic banner. Never given `q`: it sells the newest set's chase
            cards, not the visitor's search. pageType names /browse in its
            buy_click (2026-09-26). */}
        <EbayPicks className="mb-6" pageType="browse" />

        {/* SEALED MATCHES, above the cards: a search like "origins" names a set,
            and its boxes and packs are often the whole answer. Each tile opens
            the sealed quick view in place (SealedTile), like a card tile does. */}
        {sealedShown.length > 0 && (
          <section aria-labelledby="browse-sealed-heading" className="mb-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="browse-sealed-heading" className="font-display text-lg font-extrabold text-white">
                Sealed products
              </h2>
              <Link href={`/sealed?q=${encodeURIComponent(q)}`} className="text-sm text-brand-400 hover:underline">
                {sealedMatches.length > sealedShown.length
                  ? `See all ${sealedMatches.length} sealed products →`
                  : "Open in Sealed →"}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
              {sealedShown.map((g) => (
                <SealedTile
                  key={g.groupKey}
                  group={g}
                  currency={sealedCurrency}
                  soldOutEverywhere={soldOutEverywhere(g.listings)}
                />
              ))}
            </div>
          </section>
        )}

        {cards.length === 0 ? (
          <>
            {/* With sealed matches above and no single cards, say so in one line
                instead of a full "No cards found" panel under the answer. */}
            {total === 0 && sealedMatches.length > 0 ? (
              <p className="card-surface p-4 text-sm text-slate-400">
                No single cards match “{q}”. The sealed products above do.{" "}
                <Link href="/browse" className="text-brand-400 hover:underline">Browse all cards</Link>
              </p>
            ) : (
              <div className="card-surface grid place-items-center p-16 text-center">
                <p className="text-lg font-semibold text-white">
                  {total > 0 ? "Nothing on this page" : "No cards found"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {total > 0 ? "Try an earlier page." : "Try adjusting your filters or search."}
                </p>
                <Link href="/browse" className="btn-primary mt-4">Reset</Link>
              </div>
            )}
            {/* A search our database has no card for (a typo, a set we have
                not loaded yet, a product that is not a single) can still be on
                eBay — the full CTA, since here it is the one route left. With
                sealed matches the compact one above already covers it. */}
            {q && !hasResults && (
              <EbayBuyCta query={q} freeText source="browse-no-results" pageType="browse" surface="ebay_search" className="mt-4" />
            )}
          </>
        ) : (
          <>
            {/* Sized from the column's own width from lg (2026-09-23): the rail and
                the sidebar squeeze it, and the 10.5rem floor keeps CardTile's
                min-w-[6.5rem] price block inside the tile. Was lg:4 / xl:5 by
                viewport, i.e. 94px tiles at 1024 and 123px at 1280. */}
            {/* grid-flow-row-dense: the sign-up prompt below is a full-width
                row after the 12th tile, and where 12 does not fill the last row
                (5 columns) the next tiles fill the gap before it rather than
                leaving holes. The tiles keep their order. */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] grid-flow-row-dense">
              {cards.map((c) => (
                <Fragment key={c.id}>
                  <CardTile card={trimTileArtFallback(c)} />
                  {/* THE CARD LIST'S SIGN-UP PROMPT (2026-09-30, "The sign-up
                      slider is gone"): after the first rows, never above the
                      results, signed-out visitors only, a client island that
                      renders nothing on the server. Six rows down on a phone,
                      three or four on a desktop: below the first screen. */}
                  {c.id === promptAfterId && (
                    <InlineSignupPrompt
                      surface="inline_browse"
                      className="col-span-full"
                      title="Keep track of the cards you're after"
                      body={`A free account keeps a watchlist of up to ${FREE_WATCHLIST_LIMIT} cards and emails you when one drops in price, and tracks what your collection is worth, with profit and loss, for up to ${FREE_PORTFOLIO_LIMIT} cards.`}
                    />
                  )}
                </Fragment>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} params={searchParams as Record<string, string | undefined>} />
          </>
        )}

        {/* The guides behind the card list (lib/content/tool-guides.ts), after
            the grid and before the ad — our writing ahead of the commercial
            slot. Not on a ?q search, whose view is noindexed and whose reader
            came for one card. */}
        {!q && <RelatedGuides guides={guidesForTool("/browse")} />}

        {/* Moved below the results (was above, ahead of EbayPicks) — a visitor
            searching a card wants to see matches first; the ad now sits after
            them instead of being the first thing rendered. */}
        <AdSlot format="horizontal" height={90} className="mt-6" />
      </section>
    </div>
  );
}
