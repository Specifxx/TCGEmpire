import type { Metadata } from "next";
import { TcgplayerPicks } from "@/components/TcgplayerPicks";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EbayPicks } from "@/components/EbayPicks";
import { CountUp } from "@/components/CountUp";
import { type CardQuery, parsePageNum, parsePageSize } from "@/lib/cards";
import { DEFAULT_COUNTRY, normalizeCountry, type Country } from "@/lib/country";
import { buildSetView, setQuery } from "@/lib/set-view";
import { SetOwnedProvider } from "@/components/SetOwned";
import { SetCountUp, SetMarketBoard, SetMarketValue, SetViewProvider } from "@/components/sets/SetMarketBoard";
import { MarketPinProvider } from "@/components/MarketSlots";

/** The page's searchParams: the card query, and the market a link may pin. */
type SetParams = CardQuery & { market?: string };
import { SETS, isPreorderSetCode, setBySlug, singlesLive } from "@/lib/constants";
import { getSetRevealCount } from "@/lib/set-reveal-count";
import { preordersHrefForSet, releaseDateLabel as calendarDateLabel } from "@/lib/release-calendar";
import { RadianceHub } from "@/components/sets/RadianceHub";
import { LegacyHub } from "@/components/sets/LegacyHub";
import { LEGACY_FAQ } from "@/lib/sets/legacy";
import { ReleaseAlertSignup } from "@/components/ReleaseAlertSignup";
import { RadiancePreorderCta } from "@/components/RadiancePreorderCta";
import { RadianceReveals } from "@/components/sets/RadianceReveals";
import { getRadianceReveals } from "@/lib/radiance-reveals";
import { RADIANCE_FAQ } from "@/lib/sets/radiance";
import { faqPage } from "@/lib/jsonld";
import { RelatedGuides } from "@/components/RelatedGuides";
import { ChaseWatchCta } from "@/components/ChaseWatchCta";
import { getRadianceChaseCards } from "@/lib/radiance-watch";
import { guidesForSet } from "@/lib/content/related-guides";
import { getRiftboundStocksLinks, rbsSetUrl } from "@/lib/riftboundstocks";

// Per-set pre-release reading, shown on a set page that has no cards yet. Keyed by
// slug and DATA, not JSX, so adding the next set is one array — the previous shape
// was six <li> hardcoded inline behind `set.slug === "vendetta"`, which is why it
// was still there six weeks after Vendetta shipped.
//
// Only routes that exist and are about THIS set belong here; tests/content-links
// resolves every one of them. Radiance's list deliberately leads with the two
// pages that can be acted on today — what is confirmed, and what the pre-orders
// cost — rather than with the mechanic leaks, which are interesting but unbuyable.
//
// TODO (not done this pass — non-trivial, deliberately deferred): a brief asked
// for every existing /sets/radiance mention sitewide to use one consistent
// anchor text ("Radiance card list & prices"). Checked both real candidates and
// left them as-is rather than force a phrase that doesn't fit:
//   - src/app/sets/page.tsx's "Upcoming & unreleased" tile grid shows every
//     set's bare NAME as the link text (a UI pattern, not prose) — retyping just
//     Radiance's tile breaks visual consistency with every sibling tile for no
//     real SEO gain.
//   - src/lib/articles.ts already links /sets/radiance from several posts
//     (search the file for the literal string) with natural, already-relevant
//     anchor text ("Radiance set page", "[Radiance](/sets/radiance)") woven
//     into real sentences — forcing one exact phrase into each would read as
//     keyword-stuffing mid-sentence, not a genuine gap the way an actually
//     missing link would be.
const PRE_RELEASE_LINKS: Record<string, { href: string; label: string }[]> = {
  radiance: [
    { href: "/blog/riftbound-radiance-spoilers", label: "Spoilers: every card revealed so far" },
    { href: "/blog/riftbound-radiance-what-we-know", label: "Release date & what's confirmed" },
    { href: "/radiance-preorders", label: "Pre-order prices, every store" },
    { href: "/blog/where-to-buy-riftbound-radiance", label: "Where to buy, by country" },
    { href: "/release-dates", label: "Countdown & release calendar" },
    { href: "/guides/riftbound-pre-rift-rules-explained", label: "Pre-Rift event rules" },
  ],
  // Coming soon since 2026-10-25; every link is a page that exists today.
  legacy: [
    { href: "/legacy-preorders", label: "Pre-order prices, every store" },
    { href: "/blog/riftbound-legacy-spoilers-set-6", label: "Spoilers: what Riot has shown" },
    { href: "/blog/where-to-buy-riftbound-legacy", label: "Where to buy, by country" },
    { href: "/blog/riftbound-legacy-champion-decks", label: "Champion Decks & Proving Grounds 2" },
    { href: "/blog/riftbound-legacy-pack-changes-and-card-templating", label: "How Legacy packs change" },
    { href: "/release-dates", label: "Countdown & release calendar" },
    { href: "/guides/riftbound-pre-rift-rules-explained", label: "Pre-Rift event rules" },
  ],
};
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { FamilyDeals } from "@/components/FamilyDeals";

// searchParams-driven (filters/pagination), so the route stays dynamic — same
// tradeoff as /browse.
export const dynamic = "force-dynamic";

const isCleanPagination = (searchParams: CardQuery) =>
  Object.entries(searchParams).every(([k, v]) => k === "page" || v == null || v === "");

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { set: string };
  searchParams: CardQuery;
}): Promise<Metadata> {
  const set = setBySlug(params.set);
  // Unknown slug: a distinct title + noindex here, and notFound() in the page
  // body below for the status. (The stale comment this replaces claimed a hard
  // 404 was impossible on this route — it is not; what actually swallowed the
  // status was the root loading.tsx Suspense boundary, now removed.)
  if (!set) return notFoundMetadata("Set");
  // Market-neutral title (no country) so it ranks globally; the page itself is
  // tailored to the visitor's market.
  //
  // LIST INTENT FIRST, PRICE SECOND. This page previously led with "Prices —
  // Cheapest Sellers", but the queries it actually surfaces for are list-shaped:
  // "vendetta card list" (146 impressions, 2.1% CTR, position 10.5). A buyer-hook
  // title against a list-intent query is an intent mismatch, and mismatch is what
  // produces exactly that pattern — ranking, but ignored.
  //
  // Deliberately "Card List", NOT "Card Gallery": /sets/<slug>/gallery owns the
  // gallery queries with a genuinely different page (every card on one screen,
  // visual browse). Two of our own URLs chasing one query helps neither, so the
  // split is list-here / gallery-there, and a test enforces it.
  //
  // Built longest-first and stepped down (the same technique the card page uses)
  // so even the longest set name — "Origins: Proving Grounds" — still fits inside
  // Google's ~60-char truncation with the site suffix attached, instead of getting
  // the important half cut off.
  const titleCandidates = [
    // "PRICE GUIDE" IS THE TOP RUNG, added 2026-09-24 off the Search Console
    // export. There is a whole sub-intent using that exact phrase, this page is
    // what ranks for it, and it converts at nothing: "riftbound origins price
    // guide" 82 impressions at position 6.3, "riftbound unleashed price guide"
    // 79 at 7.5, "origins price guide" 72 at 5.9, "riftbound vendetta price
    // guide" 65 at 8.2 — 789 impressions across 21 such queries, ONE click
    // between them. The phrase appeared nowhere in any title, description or
    // heading on the site.
    //
    // It is the banlist lesson again: ranking on page one for a phrase the
    // title does not contain. "Card List" still leads, because that is the
    // bigger query ("riftbound unleashed card list", 885 impressions) and
    // tests/seo-landing-pages.test.ts pins list-intent first; "Price Guide"
    // replaces the weaker "Prices" only where it fits inside 60 characters with
    // the site suffix — Origins, Unleashed, Vendetta and Radiance all do, and
    // those are the sets the price-guide queries actually name. Spirit Forged
    // and Origins: Proving Grounds fall to the rung below, which is what the
    // ladder is for; their descriptions still carry the phrase.
    `Riftbound ${set.name} Card List & Price Guide`,
    `Riftbound ${set.name} Card List & Prices`,
    `Riftbound ${set.name} Card List`,
    `${set.name} Card List & Prices`,
  ];
  // A set with no imported cards yet (pre-release, or a data gap where a released
  // set was registered before its cards were imported) renders only a placeholder —
  // thin content. Noindex it so Google doesn't sink crawl budget into a soft-thin
  // page; these empty set URLs are the bulk of the "discovered/crawled – not indexed"
  // pile. It flips back to indexable automatically the moment cards are imported.
  // GUARDED, and the -1 sentinel matters. This route is force-dynamic, so this
  // count runs against the database on EVERY request — and an unguarded await in
  // generateMetadata throws before the page renders at all, i.e. a hard 500
  // rather than a degraded page. /browse makes the identical call and already
  // guards it (`.catch(() => 0)`); this one did not, which is why a spike in
  // 5xx on 2026-08-13 landed on /sets/[set] specifically while /browse rode it
  // out: the operational database was days from exhausting its Neon transfer
  // allowance (the rotation onto DATABASE_URL_2 followed on 2026-08-14).
  //
  // -1, NOT 0, because `cardCount === 0` below emits robots:noindex for
  // genuinely empty sets. Falling back to 0 would mean a transient database
  // blip tells Google to drop a real, fully-populated set page — and noindex is
  // cached, so the damage outlasts the outage by far more than a 500 would.
  // Unknown therefore fails OPEN for indexability; Math.max(1, …) below already
  // collapses a negative to a single page, so pagination stays sane too.
  //
  // Moved ABOVE the description below (it used to run after) so the description
  // can branch on it: see the cardCount === 0 case there.
  const cardCount = await prisma.card.count({ where: { setCode: set.code } }).catch(() => -1);
  // THE COUNTED RUNG LEADS (2026-09-24, growth-pass brief): "Riftbound {Set}
  // Card List & Price Guide (All {N} Cards)", N the live count above — the
  // same number the page's own price guide lists. Absolute and brand-free so it
  // fits 60 characters for Origins, Unleashed, Vendetta and Radiance; a longer
  // set name, or an unknown/zero count, falls to the uncounted "Price Guide"
  // rung, then to the suffixed ladder above.
  //
  // 2026-09-24 (snippets brief): "Riftbound {Set} Card List: All {N} Cards +
  // Prices" leads. The number is the answer a "card list" searcher checks for
  // and now sits in the first half of the title instead of trailing in
  // parentheses where Google's truncation took it ("unleashed card list": 904
  // impressions at 1.2%). The price-guide rung stays next, for set names too
  // long for this one.
  //
  // PREVIEW SEASON (2026-09-25): the counted rung above is a claim of
  // completeness and of prices, and a set still revealing cards has neither.
  // /sets/radiance served "Card List: All 3 Cards + Prices" for a 180-card set
  // with no singles prices, on the page that owns "radiance card list". While
  // isPreorderSetCode() holds and cards exist, the title counts reveals against
  // the announced total instead — "Card List" still leads, and it never says
  // "Revealed" or "Spoilers", which docs/seo-keyword-map.md gives to the
  // /blog/riftbound-radiance-spoilers tracker. Released sets keep the ladder.
  // 2026-10-17: a pre-order set whose singles already trade (singlesLive: its
  // "New" day has passed) gets the released ladder, "All N Cards + Prices" —
  // Radiance's full list is in and its singles are priced (DECISIONS.md,
  // "Radiance leads the site").
  const preview = isPreorderSetCode(set.code) && cardCount > 0 && !singlesLive(set);
  const revealed = preview ? await getSetRevealCount(set.code) : null;
  const announced = set.announcedCards ?? set.totalCards;
  // Past Riot's announced total (Radiance: 197 printings against "180 cards" by
  // 12 Oct, signed and overnumbered prints included) "197 of 180 So Far" reads as
  // an error, so the count stands alone: "197 Cards So Far" (2026-10-12). Still
  // "So Far", never "All": a preview set's list is not known to be complete.
  const revealLabel =
    revealed && revealed > 0 && announced ? (revealed >= announced ? `${revealed} Cards` : `${revealed} of ${announced}`) : null;
  const fullTitles = preview
    ? [
        ...(revealLabel ? [`Riftbound ${set.name} Card List: ${revealLabel} So Far`] : []),
        `Riftbound ${set.name} Card List So Far`,
        `${set.name} Card List So Far`,
      ]
    : cardCount === 0 && set.hubReady
      ? // A pre-release hub with no cards yet (Legacy from 2026-11-01): the
        // released ladder would promise a list and prices the page does not
        // have. It names what the hub holds instead; "card list" stays last so
        // the page keeps the query it will own once cards import.
        [`Riftbound ${set.name}: Legends, Products & Card List`, `Riftbound ${set.name}: Legends & Products`]
      : [
        // 2026-10-23 CTR pass (owner-approved): brand-free, the count and the
        // "cheapest first" hook up front. The "+ Prices" rung stays next.
        ...(cardCount > 0 ? [`${set.name} Card List: All ${cardCount} Cards, Cheapest First`] : []),
        ...(cardCount > 0 ? [`Riftbound ${set.name} Card List: All ${cardCount} Cards + Prices`] : []),
        ...(cardCount > 0 ? [`Riftbound ${set.name} Card List & Price Guide (All ${cardCount} Cards)`] : []),
        `Riftbound ${set.name} Card List & Price Guide`,
        ...titleCandidates.map((t) => `${t} | RiftCompare`),
      ];
  const fullTitle = fullTitles.find((t) => t.length <= 60) ?? fullTitles[fullTitles.length - 1];
  // PRE-RELEASE BRANCH: cardCount === 0 (not < 1 — a -1 lookup failure keeps the
  // normal "complete card list" copy, matching the fail-open bias above, rather
  // than switching every set to pre-release wording on a transient DB blip).
  //
  // Found live on /sets/radiance: with 0 cards imported and the page correctly
  // noindexed, the description STILL claimed "The complete Riftbound Radiance
  // card list — every card with images, plus live prices... Updated daily" —
  // false today, harmless only because noindex currently holds, and a landmine
  // that depends on a human remembering to also touch this copy on launch day
  // (23 Oct 2026 for Radiance) after removing the noindex. Branching on the
  // same cardCount the noindex itself reads means the honest copy and the
  // indexability both flip together, automatically, the moment cards import —
  // no separate step to forget.
  const releaseDateLabel = set.releasedOn
    ? new Date(`${set.releasedOn}T00:00:00Z`).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  // Preview season (the same `preview` gate as the title): describe what is
  // on the page today — the reveals, with their rarity, domain and text — and
  // put the prices on the date they actually start, not in the present tense.
  // The dated rung is 151 characters at "180 of 180" for Radiance, so it fits
  // 155 for the whole season.
  const previewDescCandidates = [
    ...(revealLabel && releaseDateLabel
      ? [`Every Riftbound ${set.name} card revealed so far (${revealLabel}) with rarity, domain and card text, added as reveals land. Live prices from ${releaseDateLabel}.`]
      : []),
    ...(revealLabel
      ? [`Every Riftbound ${set.name} card revealed so far (${revealLabel}) with rarity, domain and card text, added as official reveals land.`]
      : []),
    `Every Riftbound ${set.name} card revealed so far, with rarity, domain and card text, added as official reveals land.`,
  ];
  // Stores with an in-stock listing of this set (any market, each store once),
  // for the description's hook; null on failure drops that rung.
  const setStores =
    !preview && cardCount > 0
      ? await prisma.retailerPrice
          .groupBy({
            by: ["retailer"],
            where: { inStock: true, card: { setCode: set.code }, NOT: [{ retailer: { startsWith: "ebay" } }, { retailer: { startsWith: "marketguide" } }] },
          })
          .then((r) => r.length)
          .catch(() => null)
      : null;
  const descCandidates = preview
    ? previewDescCandidates
    : cardCount === 0
      ? [
          // The hub's own description (hubReady, Legacy 2026-11-01): what the
          // page shows today, then the date live prices start.
          ...(set.hubReady && releaseDateLabel && set.announcedCards
            ? [`Riftbound ${set.name} releases ${releaseDateLabel}: ${set.announcedCards} cards, the confirmed Legends, every product and live pre-order prices by store.`]
            : []),
          releaseDateLabel
            ? `Riftbound ${set.name} releases ${releaseDateLabel} — this page will list every card with live prices from launch day.`
            : `Riftbound ${set.name} hasn't released yet — this page will list every card with live prices from launch day.`,
        ]
      : [
          // Carries "price guide" for the sets whose title could not fit it,
          // and reinforces it for the ones that could. Both phrasings describe
          // the same page honestly: a list of every card in the set with what
          // each one currently costs.
          ...(setStores
            ? [`Riftbound ${set.name} card list: all ${cardCount} printings with prices compared across ${setStores} stores in six markets, cheapest first. Updated daily.`]
            : []),
          `The complete Riftbound ${set.name} card list and price guide — every card with live prices compared across stores to find the cheapest singles. Updated daily.`,
          `The complete Riftbound ${set.name} card list and price guide — every card with live prices compared across stores. Updated daily.`,
          `The complete Riftbound ${set.name} card list — every card with images, plus live prices compared across stores to find the cheapest singles. Updated daily.`,
          `The complete Riftbound ${set.name} card list — every card, with live prices compared across stores to find the cheapest singles. Updated daily.`,
          `The complete Riftbound ${set.name} card list, with live prices compared across stores to find the cheapest singles. Updated daily.`,
        ];
  const description = descCandidates.find((d) => d.length <= 155) ?? descCandidates[descCandidates.length - 1];
  // A filtered/searched view (like /browse's ?q=) is a permutation of the same
  // content, not a distinct page — noindex it and point Google at the clean set page.
  const filtered = !isCleanPagination(searchParams);

  // Clean pagination (?page=N and nothing else) self-canonicalises to its own page —
  // per Google's guidance a paginated page is not a duplicate of page 1, and page 2+
  // shows an entirely different slice of the set's cards. Mirrors /browse's logic.
  // `cardCount` already equals the clean-pagination total (isCleanPagination means no
  // filter param survived, so buildCardWhere contributes nothing beyond setCode).
  // Out-of-range pages fall back to the clean canonical, same as before.
  const page = parsePageNum(searchParams.page);
  const totalPages = Math.max(1, Math.ceil(cardCount / parsePageSize(searchParams.size)));
  const selfCanonical = page > 1 && !filtered && page <= totalPages;
  const canonicalPath = selfCanonical ? `/sets/${set.slug}?page=${page}` : `/sets/${set.slug}`;

  return {
    title: { absolute: fullTitle },
    description,
    keywords: [
      `Riftbound ${set.name}`,
      `Riftbound ${set.name} prices`,
      `Riftbound ${set.name} card list`,
      `${set.name} card prices`,
      `cheapest Riftbound ${set.name} cards`,
      `Riftbound ${set.name} value`,
    ],
    // Single cookie-switched URL is the global default for all four markets.
    alternates: pageAlternates(canonicalPath, { languages: { "x-default": `${SITE_URL}${canonicalPath}` } }),
    // set.hubReady is the one exception to the "0 cards = thin = noindex" rule
    // above: a set with a real, populated content hub (confirmed facts,
    // legends, products, FAQ — see RadianceHub) is not thin just because no
    // cards have imported yet. Every OTHER comingSoon set with no hub built
    // keeps the default noindex until it earns hubReady the same way, so this
    // can never flip a genuinely empty future-set stub to indexable by accident.
    ...((cardCount === 0 && !set.hubReady) || filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title: fullTitle, description, url: canonicalPath }),
  };
}

export default async function SetPage({
  params,
  searchParams,
}: {
  params: { set: string };
  searchParams: SetParams;
}) {
  const set = setBySlug(params.set);
  if (!set) notFound();

  // ONE CDN COPY PER URL (2026-11-05, DECISIONS.md "The set pages become one
  // CDN copy per URL"). Until then this page read the market cookie
  // (getCountry) as well as searchParams, so every visit was a function render
  // with the set's queries. Now it reads NOTHING about the visitor: the HTML
  // carries the baseline market (DEFAULT_COUNTRY, the US; or the market a
  // `?market=` link pins, which outranks the cookie as it always did), Vercel's
  // CDN keeps it six hours (next.config.js QUERY_CDN_PAGES; the query string
  // is part of the key), and the market-dependent body is the SetMarketBoard
  // island, which swaps in the visitor's market from /api/set-view after
  // hydration. tests/card-cdn.test.ts walks this page's server imports.
  const country: Country = searchParams.market ? normalizeCountry(searchParams.market) : DEFAULT_COUNTRY;
  const pinned = !!searchParams.market;
  const query = setQuery(searchParams);
  const chaseCards = set.slug === "radiance" ? await getRadianceChaseCards() : [];
  // Sister-site link map (lib/riftboundstocks.ts): started now, awaited at
  // render; never rejects, null when unreachable.
  const rbsLinks = getRiftboundStocksLinks();

  // The set's view in the baseline market (lib/set-view.ts): totals, the
  // filtered and paged grid, the intro, the price guide. The same function
  // /api/set-view runs for the visitor's market.
  const view = await buildSetView(set, country, query);
  const { totalInSet, page, totalPages } = view;

  const radianceReveals = set.slug === "radiance" ? await getRadianceReveals(country) : null;

  const otherSets = SETS.filter((s) => s.slug !== set.slug && !s.comingSoon);
  // A comingSoon set (singles not on sale yet) can still be FULLY revealed —
  // Vendetta's official-gallery pipeline had all 166 main-set cards in the DB
  // before release day. Distinguishing this from "still mid-spoiler-season" (see
  // set.totalCards in lib/constants.ts) keeps the copy below honest either way.
  //
  // Measured against the ANNOUNCED total, the same denominator the preview title
  // ("N of 180 So Far") and RadianceReveals use, and — where the page already has
  // it — the same non-promo count, so the page never shows "Complete" beside a
  // title that still says "167 of 180". totalInSet includes promos.
  const completeAt = set.announcedCards ?? set.totalCards;
  const revealedCount = radianceReveals?.revealed ?? totalInSet;
  const fullyRevealed = !!completeAt && revealedCount >= completeAt;
  // THE SET TRACKER'S OWNED TICKS (2026-09-29, DECISIONS.md, "Set tracker"):
  // offered once the set has RELEASED (date-driven, so a set whose comingSoon
  // flag outlives release day still opens), never on a set still revealing. The
  // page reads NEITHER cookies nor the user for this: the ticks are a client
  // overlay (components/SetOwned.tsx) fed by GET /api/collection/owned, because
  // this route is one CDN copy per URL shared by every visitor and a session
  // read here would break that. tests/set-tracker.test.ts pins it.
  const trackerOpen = totalInSet > 0 && (!isPreorderSetCode(set.code) || singlesLive(set));
  // Singles on sale (released, or trading ahead of release: lib/constants.ts
  // singlesLive). Everything on this page about card PRICES reads this, not
  // set.comingSoon; sealed pre-order copy still reads comingSoon.
  const live = singlesLive(set);
  // Pre-order comparison page for THIS set, while it is still upcoming. Read from
  // the release calendar rather than hardcoded, so this template never names a
  // set and the link retires itself on release day (see preordersHrefForSet).
  // Without it /sets/radiance — the page every "riftbound radiance" search lands
  // on through spoiler season — had no route at all to the only Radiance thing
  // that is actually buyable today.
  const preordersHref = preordersHrefForSet(set.code);
  const preReleaseLinks = set.comingSoon ? PRE_RELEASE_LINKS[set.slug] ?? [] : [];
  // "29 January 2027", only while the street date is still ahead.
  const streetDate = isPreorderSetCode(set.code) ? calendarDateLabel(set.releasedOn) : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Database", item: `${SITE_URL}/browse` },
      { "@type": "ListItem", position: 3, name: set.name, item: `${SITE_URL}/sets/${set.slug}` },
    ],
  };
  // Matches the page's canonical: clean paginated views self-canonicalise, so
  // their structured data must not contradict that with a bare /sets/<slug> url.
  const cleanPage = isCleanPagination(searchParams) && page > 1 && page <= totalPages;
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Riftbound ${set.name} Card Prices & List`,
    url: cleanPage ? `${SITE_URL}/sets/${set.slug}?page=${page}` : `${SITE_URL}/sets/${set.slug}`,
    description: `Live prices for every Riftbound ${set.name} card.`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    // No mainEntity ItemList: the visible card grid already links every card as a
    // crawlable <a href>, so serializing the entire list again just doubled a big
    // set's HTML weight (≈1 MB / 1.8k links on Origins) for zero extra crawl value.
  };

  // FAQPage JSON-LD only where a real, visible FAQ backs it (RadianceHub renders
  // the identical RADIANCE_FAQ array via HubFaq) — Google only honours FAQPage
  // when the answer text is actually on the page, and every other set has none.
  const faqLd = set.slug === "radiance" ? faqPage(RADIANCE_FAQ) : set.slug === "legacy" ? faqPage(LEGACY_FAQ) : null;

  return (
    <SetOwnedProvider setCode={set.code} enabled={trackerOpen}>
    <SetViewProvider baseline={view} query={query} pinned={pinned} setSlug={set.slug}>
    <MarketPinProvider baseline={country} pinned={pinned}>
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection, ...(faqLd ? [faqLd] : [])]) }}
      />

      {/* Breadcrumb + hero */}
      <section className="card-surface relative overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-8">
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <span>/</span>
            <Link href="/browse" className="hover:text-slate-300">Database</Link>
            <span>/</span>
            <span className="text-slate-300">{set.name}</span>
          </nav>

          {/* The code badge, but only for a code Riot has actually published
              (codeProvisional in lib/constants.ts marks one that is still our
              own guess). Showing a guessed code in a badge would present it as
              the official set code on the page that ranks for the set's name —
              which is what happened with Radiance's "RAD" until Riot's own
              rundown confirmed it. The code always exists internally as the
              join key; it is just not stated as fact until it is one. */}
          {!set.codeProvisional && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 font-display text-lg font-bold tracking-wide text-brand-300">
              {set.code}
            </div>
          )}

          {/* Mirrors the title's list-first framing (see generateMetadata) — an
              H1 that disagrees with the title is its own intent mismatch. */}
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Riftbound {set.name} card list &amp; prices
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {!live ? (
              <>
                {/* A set announced but not yet revealed (Legacy from 2026-10-25:
                    zero cards, months out) is not "new"; say when it lands. */}
                {totalInSet === 0 && streetDate ? (
                  <>Riftbound <strong className="text-slate-200">{set.name}</strong> releases {streetDate}.</>
                ) : (
                  <>Riftbound <strong className="text-slate-200">{set.name}</strong> is new.</>
                )}
                {fullyRevealed
                  ? <> All {completeAt} {set.name} cards are officially confirmed and listed below — live store prices land the moment singles release.</>
                  : totalInSet > 0
                  ? <> Every officially revealed {set.name} card is listed below — live store prices land the moment singles release.</>
                  : <> This page will list every {set.name} card with live prices the moment they release — check back soon.</>}
                {set.sealedAvailable && (
                  <> {set.name} sealed products (booster boxes &amp; packs) are available now — <Link href={`/sealed?q=${set.name.toLowerCase()}`} className="text-brand-300 underline-offset-2 hover:underline">compare them on the sealed page</Link>.</>
                )}
                {preordersHref && (
                  <> Sealed {set.name} product is already on pre-order — <Link href={preordersHref} className="text-brand-300 underline-offset-2 hover:underline">compare every store&apos;s pre-order price</Link>.</>
                )}
              </>
            ) : (
              <>The complete Riftbound <strong className="text-slate-200">{set.name}</strong> card list — all {totalInSet.toLocaleString()} cards, sortable and filterable, with live prices compared across stores so you can find the cheapest singles. <SetMarketValue what="priced" /> cards are priced right now, updated twice a day — switch your country at the top to see local prices.
                {preordersHref && (
                  <> Sealed {set.name} product is still on pre-order — <Link href={preordersHref} className="text-brand-300 underline-offset-2 hover:underline">compare every store&apos;s pre-order price</Link>.</>
                )}
              </>
            )}
          </p>

          {/* Straight into the visual gallery. This page is the price-first view
              (paginated, filter-driven); a chunk of arriving traffic actually wants
              to LOOK at the set — "<set> card gallery" is its own query cluster —
              so give that intent a first-class exit rather than burying it. */}
          {/* Data-derived intro: scale and price coverage, the range and where the
              value is concentrated, the cards worth knowing about by name, and
              what that means for a buyer. Every figure comes from this set's own
              rows — see the query above. Renders on the default view only. */}
          {/* The data-derived intro used to sit here, and at three or four
              paragraphs it pushed the card grid below the fold on every set
              page — the grid is what a "card list" searcher came for. It now
              renders directly under the grid (2026-09-24), unchanged. */}

          {totalInSet > 0 && (
            <p className="mt-3 text-sm">
              <Link href={`/sets/${set.slug}/gallery`} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
                Browse the {set.name} card gallery →
              </Link>
              <span className="text-slate-500"> every card on one page, with images</span>
            </p>
          )}

          {/* Count pills. Released sets show cards + priced; an unreleased set with
              revealed cards gets a green NEW pill + the revealed count instead. */}
          {live ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-brand-500/15 text-brand-300">
                <CountUp value={totalInSet} className="num font-bold" />&nbsp;cards
              </span>
              <span className="chip bg-gold/20 text-gold">
                <SetCountUp what="priced" className="num font-bold" />&nbsp;priced
              </span>
            </div>
          ) : totalInSet > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-up/20 font-bold uppercase tracking-wide text-up">{fullyRevealed ? "Complete" : "New"}</span>
              <span className="chip bg-brand-500/15 text-brand-300">
                {fullyRevealed ? (
                  <>All <CountUp value={totalInSet} className="num font-bold" />&nbsp;cards revealed</>
                ) : (
                  <><CountUp value={totalInSet} className="num font-bold" />&nbsp;cards revealed</>
                )}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Radiance content hub — confirmed facts, legends, products + a real
          pre-order table, a release timeline, and the FAQ backing faqLd above.
          Radiance-only for now (see PRE_RELEASE_LINKS's own per-slug pattern
          above); renders regardless of totalInSet, unlike PRE_RELEASE_LINKS
          which is confined to the empty-grid stub below. */}
      {/* Preview season (switches off on release day): the reveal counter and
          the newest DB-imported reveals, ABOVE the hub so a returning visitor
          sees what is new first. */}
      {/* Radiance pre-order CTA (components/RadiancePreorderCta.tsx): under the
          header, and again after the first major section (the reveals strip).
          No capture here — RadianceHub already carries the release-day form. */}
      {set.slug === "radiance" && <RadiancePreorderCta placement="top" />}
      {/* "Follow the chase cards" (2026-10-16 growth pass): one click makes an
          account already watching Radiance's Signature and over-numbered cards. */}
      {set.slug === "radiance" && chaseCards.length > 0 && <ChaseWatchCta cards={chaseCards} released={live} />}
      {set.slug === "radiance" && <RadianceReveals data={radianceReveals} />}
      {set.slug === "radiance" && <RadiancePreorderCta placement="section" />}
      {set.slug === "radiance" && <RadianceHub country={country} />}
      {/* Legacy's hub (2026-11-01), the same role RadianceHub played before
          Radiance's cards imported: it is what earns LGC's hubReady. */}
      {set.slug === "legacy" && <LegacyHub country={country} />}

      {/* Card grid — shown whenever cards EXIST, even for a comingSoon set: through
          spoiler season the official-gallery importer populates revealed cards early
          (unpriced), which is exactly what pre-release searchers want to browse.
          The grid, the intro, the price guide and "How to read" are the
          SetMarketBoard island (the visitor's market); the empty state is not
          about a market. */}
      {totalInSet === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">{set.comingSoon ? "Coming soon" : "New"}: {set.name} singles are on the way</p>
            <p className="mt-1 text-sm">
              {set.sealedAvailable
                ? <>We&apos;ll have the full singles list with live prices as soon as {set.name} drops — its sealed products are buyable right now.</>
                : <>We&apos;ll have the full list with live prices as soon as the set drops.</>}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {set.sealedAvailable && (
                <Link href={`/sealed?q=${set.name.toLowerCase()}`} className="btn-primary">Browse {set.name} sealed →</Link>
              )}
              {preordersHref && (
                <Link href={preordersHref} className={set.sealedAvailable ? "btn-ghost" : "btn-primary"}>
                  Compare {set.name} pre-orders →
                </Link>
              )}
              <Link href="/release-dates" className="btn-ghost">When does it release?</Link>
              <Link href="/browse" className={set.sealedAvailable || preordersHref ? "btn-ghost" : "btn-primary"}>Card database</Link>
            </div>

            {/* Pre-release explainer links — gives the topical set page real routes
                into the cluster while the singles list is still empty (which is
                also when it gets the most "when does <set> come out" traffic it
                will ever get, and has the least to show for it). Was a
                `set.slug === "vendetta"` block with six links hardcoded inline;
                Vendetta released six weeks ago and the block has been dead markup
                on a page nobody hits since. See PRE_RELEASE_LINKS above. */}
            {preReleaseLinks.length > 0 && (
              <div className="mx-auto mt-6 max-w-lg border-t border-ink-800 pt-5 text-left">
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Get ready for {set.name}</p>
                <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                  {preReleaseLinks.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-brand-400 hover:underline">{l.label} →</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* The set release alert (lib/release-alerts.ts), for any set still
                coming soon with nothing to show yet (Legacy from 2026-10-25).
                Set-generic: the API accepts any comingSoon code, and the email's
                pre-order link comes from the release calendar. */}
            {set.comingSoon && (
              <ReleaseAlertSignup setCode={set.code} setName={set.name} source="set" className="mx-auto mt-6 max-w-md text-left" />
            )}
          </div>
        </div>
      ) : (
        <SetMarketBoard
          setSlug={set.slug}
          setName={set.name}
          trackerOpen={trackerOpen}
          live={live}
          fullyRevealed={fullyRevealed}
          completeAt={completeAt}
          preReleaseLinks={preReleaseLinks}
          marketParam={searchParams.market || undefined}
          query={query}
          rbs={<RbsSetLink href={rbsSetUrl(await rbsLinks, set.code)} name={set.name} />}
        />
      )}

      {/* The set's own guides, after the price read-out and ahead of the eBay
          block (2026-09-26, "Blog and tools, joined up"): our own writing
          leads the commercial one. Released sets only: a set still in preview
          has its reading list in PRE_RELEASE_LINKS above. */}
      {live && <RelatedGuides guides={guidesForSet(set.code)} className="card-surface p-5" />}

      <EbayPicks
        pageType="set_hub"
        setCode={set.code}
        heading={`${set.name} singles on eBay right now`}
        fallbackQuery={`Riftbound ${set.name}`}
      />
      <TcgplayerPicks pageType="set_hub" setCode={set.code} />

      {/* Internal links to the other sets (crawl + UX) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Other Riftbound sets</h2>
        <div className="flex flex-wrap gap-2">
          {otherSets.map((s) => (
            <Link key={s.slug} href={`/sets/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {s.name}
            </Link>
          ))}
          <Link href={`/sets/${set.slug}/gallery`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">{set.name} gallery →</Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">All cards →</Link>
          <Link href="/price-guide" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">All Riftbound card prices →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">Sealed products →</Link>
        </div>
      </section>

      {/* Sealed-live note for sets whose singles haven't dropped yet. */}
      {set.comingSoon && set.sealedAvailable && (
        <section className="card-surface p-6">
          <h2 className="text-xl font-extrabold text-white">Riftbound {set.name} sealed is live now</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {set.name} singles haven&apos;t released yet, but sealed {set.name} products — booster boxes and
            packs — are already buyable. RiftCompare compares live sealed prices across stores so you can
            lock in the cheapest {set.name} sealed today.{" "}
            <Link href={`/sealed?q=${set.name.toLowerCase()}`} className="text-brand-300 underline-offset-2 hover:underline">Compare {set.name} sealed →</Link>
          </p>
        </section>
      )}

      {/* One block per page (DECISIONS.md "Sites that grow each other"): the next set's page shows other games' pre-orders. */}
      <FamilyDeals kind={set.comingSoon ? "preorder" : "deal"} country={country} allMarkets className="" />
    </div>
    </MarketPinProvider>
    </SetViewProvider>
    </SetOwnedProvider>
  );
}

/**
 * The set's US (TCGplayer) price list and value over time on RiftboundStocks,
 * our sister site (2026-09-28, DECISIONS.md). Null when the set has no match
 * there or the link map is unreachable.
 */
function RbsSetLink({ href, name }: { href: string | null; name: string }) {
  if (!href) return null;
  return (
    <p>
      For US prices from TCGplayer and how the set&apos;s value has moved day by day, see{" "}
      <a href={href} target="_blank" rel="noopener" className="text-brand-400 hover:underline">
        {name} on RiftboundStocks ↗
      </a>
      .
    </p>
  );
}
