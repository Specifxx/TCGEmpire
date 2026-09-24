import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { CardTile } from "@/components/CardTile";
import { EbayPicks } from "@/components/EbayPicks";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { Filters } from "@/components/Filters";
import { ActiveFilters } from "@/components/ActiveFilters";
import { SortSelect } from "@/components/SortSelect";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { Pagination } from "@/components/Pagination";
import {
  buildCardOrderBy,
  buildCardWhere,
  cardTileSelect,
  CardQuery,
  parsePageNum,
  parsePageSize,
} from "@/lib/cards";
import { getCountry } from "@/lib/get-country";
import { priceField, COUNTRIES } from "@/lib/country";
import { buildCollectionNarrative } from "@/lib/content/collection-narrative";
import { getSiteMedianCents } from "@/lib/content/site-median";
import { SETS, setBySlug } from "@/lib/constants";
import { preordersHrefForSet } from "@/lib/release-calendar";
import { RadianceHub } from "@/components/sets/RadianceHub";
import { RadiancePreorderCta } from "@/components/RadiancePreorderCta";
import { SetPriceGuide } from "@/components/sets/SetPriceGuide";
import { RadianceReveals } from "@/components/sets/RadianceReveals";
import { getRadianceReveals } from "@/lib/radiance-reveals";
import { setPriceGuideRows } from "@/lib/set-price-guide";
import { storeCountsByCountry } from "@/lib/cards";
import { RADIANCE_FAQ } from "@/lib/sets/radiance";
import { faqPage } from "@/lib/jsonld";

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
    { href: "/blog/riftbound-radiance-biggest-release-since-origins", label: "Why this release matters" },
    { href: "/blog/riftbound-radiance-leaked-mechanics", label: "Leaked mechanics, hedged" },
    { href: "/guides/riftbound-pre-rift-rules-explained", label: "Pre-Rift event rules" },
  ],
};
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

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
  const fullTitles = [
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
  const descCandidates =
    cardCount === 0
      ? [
          releaseDateLabel
            ? `Riftbound ${set.name} releases ${releaseDateLabel} — this page will list every card with live prices from launch day.`
            : `Riftbound ${set.name} hasn't released yet — this page will list every card with live prices from launch day.`,
        ]
      : [
          // Carries "price guide" for the sets whose title could not fit it,
          // and reinforces it for the ones that could. Both phrasings describe
          // the same page honestly: a list of every card in the set with what
          // each one currently costs.
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
  searchParams: CardQuery;
}) {
  const set = setBySlug(params.set);
  if (!set) notFound();

  const country = getCountry();

  // Unfiltered totals for the set (hero copy + the "not released yet" empty
  // state) — distinct from the filtered/paginated grid below.
  const where = { ...buildCardWhere(searchParams, country), setCode: set.code };
  // A-Z by default here (unlike /browse's "set & card number") — this page is
  // already scoped to one set, so a numeric ordering isn't the useful default.
  const orderBy = buildCardOrderBy(searchParams.sort ?? "name", country);
  const size = parsePageSize(searchParams.size);
  const page = parsePageNum(searchParams.page);

  // EGRESS: same fix as /browse (also force-dynamic, also both the landing page
  // for a set AND a deep crawl surface). The DEFAULT view — no filters, sort or
  // paging — is identical for every visitor in a market, so it's memoised per
  // (set, country). Any filtered/sorted/paged view still queries live. Tagged
  // CONTENT_TAG so the price import purges it immediately.
  const isDefaultView = Object.values(searchParams).every((v) => v == null || v === "");
  const runQuery = () =>
    Promise.all([
      prisma.card.count({ where: { setCode: set.code } }),
      prisma.card.count({ where: { setCode: set.code, [priceField(country)]: { not: null } } }),
      prisma.card.count({ where }),
      prisma.card.findMany({
        where,
        orderBy,
        select: cardTileSelect(country),
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
  const [totalInSet, priced, totalFiltered, cardsFiltered] = isDefaultView
    ? await unstable_cache(runQuery, ["set-default", set.code, country], {
        revalidate: 3600,
        tags: [CONTENT_TAG],
      })()
    : await runQuery();
  const [total, cards] = totalInSet === 0 ? [0, []] : [totalFiltered, cardsFiltered];
  const totalPages = Math.max(1, Math.ceil(total / size));

  // ── Data-derived editorial intro (GROWTH-AUDIT.md § 3) ─────────────────────
  // This template measured 459 median prose words while carrying 347 inbound
  // internal links — the best-linked thin page on the site. buildCollectionNarrative
  // already supported kind: "set" and had simply never been called here; it is
  // the same generator the champion hubs and facets use, so the analytical tone
  // matches by construction.
  //
  // DEFAULT VIEW ONLY, and its own lean query. The grid above is one page of 60
  // cards, which cannot describe a set's price distribution — the narrative needs
  // every card's price, but only four scalar fields of each, so this pulls ~60
  // bytes a row instead of a full tile payload (see the egress rules in lib/db.ts).
  // Filtered and paged views skip it entirely: they canonicalise elsewhere, so
  // they are not the indexed page this prose exists for, and they must not pay
  // for a query they don't render.
  // ALSO THE PRICE GUIDE's source (2026-09-24): the same one read, widened by
  // the four fields the "#price-guide" table needs (id/slug to link, variant/
  // isPromo to name the printing), plus ONE grouped in-stock count over the
  // set's ids. Still ~100 bytes a row for a set of ~300, far under the 1.2 MB
  // unstable_cache ceiling (lib/db.ts rule 2).
  const narrativeMembers = isDefaultView
    ? await unstable_cache(
        async () => {
          const rows = (await prisma.card.findMany({
            where: { setCode: set.code },
            select: {
              id: true, slug: true, name: true, rarity: true, collectorNumber: true, setCode: true,
              variant: true, isPromo: true, [priceField(country)]: true,
            } as Prisma.CardSelect,
          })) as unknown as ({ id: string } & Record<string, unknown>)[];
          const counts = await storeCountsByCountry(rows.map((r) => r.id));
          return rows.map((r) => ({ ...r, stores: counts.get(r.id)?.[country] ?? 0 }));
        },
        ["set-narrative-guide", set.code, country],
        { revalidate: 3600, tags: [CONTENT_TAG] },
      )().catch((e) => {
        // A narrative is worth less than the page. Degrade to no intro.
        console.error(`sets/${set.slug}: narrative query failed, rendering without the intro:`, e);
        return [] as Record<string, unknown>[];
      })
    : [];
  const siteMedianCents = isDefaultView ? await getSiteMedianCents(country) : null;
  const intro =
    narrativeMembers.length > 0
      ? buildCollectionNarrative({
          kind: "set",
          label: set.name,
          currency: COUNTRIES[country].currency,
          place: COUNTRIES[country].place,
          members: narrativeMembers.map((c) => {
            const row = c as Record<string, unknown>;
            return {
              name: String(row.name),
              priceCents: (row[priceField(country)] as number | null) ?? null,
              rarity: row.rarity as string | undefined,
              collectorNumber: row.collectorNumber as string | undefined,
            };
          }),
          siteMedianCents,
        })
      : [];

  const radianceReveals = set.slug === "radiance" ? await getRadianceReveals(country) : null;
  const priceGuide = setPriceGuideRows(narrativeMembers as Record<string, unknown>[], priceField(country));

  const otherSets = SETS.filter((s) => s.slug !== set.slug && !s.comingSoon);
  // A comingSoon set (singles not on sale yet) can still be FULLY revealed —
  // Vendetta's official-gallery pipeline had all 166 main-set cards in the DB
  // before release day. Distinguishing this from "still mid-spoiler-season" (see
  // set.totalCards in lib/constants.ts) keeps the copy below honest either way.
  const fullyRevealed = !!set.totalCards && totalInSet >= set.totalCards;
  // Pre-order comparison page for THIS set, while it is still upcoming. Read from
  // the release calendar rather than hardcoded, so this template never names a
  // set and the link retires itself on release day (see preordersHrefForSet).
  // Without it /sets/radiance — the page every "riftbound radiance" search lands
  // on through spoiler season — had no route at all to the only Radiance thing
  // that is actually buyable today.
  const preordersHref = preordersHrefForSet(set.code);
  const preReleaseLinks = set.comingSoon ? PRE_RELEASE_LINKS[set.slug] ?? [] : [];

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
  const faqLd = set.slug === "radiance" ? faqPage(RADIANCE_FAQ) : null;

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection, ...(faqLd ? [faqLd] : [])]) }}
      />

      {/* Breadcrumb + hero */}
      <section className="card-surface animate-fade-up relative overflow-hidden">
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
            {set.comingSoon ? (
              <>
                Riftbound <strong className="text-slate-200">{set.name}</strong> is new.
                {fullyRevealed
                  ? <> All {set.totalCards} {set.name} cards are officially confirmed and listed below — live store prices land the moment singles release.</>
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
              <>The complete Riftbound <strong className="text-slate-200">{set.name}</strong> card list — all {totalInSet.toLocaleString()} cards, sortable and filterable, with live prices compared across stores so you can find the cheapest singles. {priced.toLocaleString()} cards are priced right now, updated daily — switch your country at the top to see local prices.</>
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
          {intro.length > 0 && (
            <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
              {intro.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

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
          {!set.comingSoon ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-brand-500/15 text-brand-300">
                <CountUp value={totalInSet} className="num font-bold" />&nbsp;cards
              </span>
              <span className="chip bg-gold/20 text-gold">
                <CountUp value={priced} className="num font-bold" />&nbsp;priced
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
      {set.slug === "radiance" && <RadianceReveals data={radianceReveals} />}
      {set.slug === "radiance" && <RadiancePreorderCta placement="section" />}
      {set.slug === "radiance" && <RadianceHub country={country} />}

      {/* Card grid — shown whenever cards EXIST, even for a comingSoon set: through
          spoiler season the official-gallery importer populates revealed cards early
          (unpriced), which is exactly what pre-release searchers want to browse. */}
      {totalInSet === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">New: {set.name} singles are on the way</p>
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
                <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                  {preReleaseLinks.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-brand-400 hover:underline">{l.label} →</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        // xl, not lg: the filter sidebar sits beside the grid only from 1280, as
        // on /browse (Filters.tsx, 2026-09-23). currency is the market column's.
        <div className="flex flex-col gap-6 xl:flex-row">
          <Filters basePath={`/sets/${set.slug}`} hideSet currency={COUNTRIES[country].currency} />

          <section className="min-w-0 flex-1">
            {set.comingSoon && (
              <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-300">
                {fullyRevealed ? (
                  <><strong className="text-emerald-300">All revealed.</strong> Every one of the {set.totalCards} official {set.name} cards is confirmed below — live store prices appear here the moment singles go on sale.</>
                ) : (
                  <><strong className="text-emerald-300">Revealed so far.</strong> These are the {set.name} cards officially
                  revealed to date — more land through spoiler season, and live store prices appear here the moment singles
                  go on sale.</>
                )}
                {/* The same PRE_RELEASE_LINKS the empty-state branch renders. They used
                    to live ONLY there, so the moment the first card imported (Neeko,
                    2026-09-19) the hub silently lost every link into the Radiance
                    cluster — the spoiler tracker, the confirmed-facts post, the
                    pre-order comparison — for the whole of spoiler season, which is
                    exactly when it has the most visitors. Found on the live page after
                    the tracker deploy (tests/radiance-spoiler-tracker.test.ts). */}
                {preReleaseLinks.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {preReleaseLinks.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="text-brand-400 hover:underline">{l.label} →</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Filters' "Show results" target, on the count row rather than the
                section; scroll-mt-36 clears the 125px sticky header (2026-09-23). */}
            <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-white">{total.toLocaleString()}</span>{" "}
                {total === 1 ? "card" : "cards"}
                {total > 0 && <span className="text-slate-600"> · page {page} of {totalPages}</span>}
              </p>
              <div className="flex items-center gap-3">
                <PageSizeSelect size={size} basePath={`/sets/${set.slug}`} />
                <SortSelect basePath={`/sets/${set.slug}`} defaultSort="name" />
              </div>
            </div>

            <ActiveFilters basePath={`/sets/${set.slug}`} />

            {cards.length === 0 ? (
              <div className="card-surface grid place-items-center p-16 text-center">
                <p className="text-lg font-semibold text-white">Nothing matches those filters</p>
                <p className="mt-1 text-sm text-slate-400">Try clearing a filter or two.</p>
                <Link href={`/sets/${set.slug}`} className="btn-primary mt-4">Reset</Link>
              </div>
            ) : (
              <>
                {/* Sized from the column's own width from lg, as on /browse
                    (2026-09-23): the rail and the sidebar squeeze it, and the
                    10.5rem floor keeps CardTile's min-w-[6.5rem] price block
                    inside the tile. */}
                <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
                  {cards.map((c) => (
                    <CardTile key={c.id} card={c} />
                  ))}
                </Reveal>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  params={searchParams as Record<string, string | undefined>}
                  basePath={`/sets/${set.slug}`}
                />
              </>
            )}
          </section>
        </div>
      )}

      {/* The set's marketplace path. Tailored rather than generic: EbayPicks
          resolves this set's chase cards to their cheapest live listing, and
          falls back to a plain affiliate search when a market has no cached
          rows — which is what makes it safe on a comingSoon set, where that
          fallback is the honest answer.

          A pre-release set is the strongest case for it on the whole page: no
          store has stock to compare, so the grid above is a card list rather
          than a shopping surface, and eBay presale/preorder listings are the
          only thing a reader can act on. */}
      {/* The set's full price list (2026-09-24). "price guide" queries rank this
          page at 7-9 with no clicks, and the page had a 60-card grid but no
          list of every card's price on it. Default view only — it reads the
          same cached query as the intro above. */}
      <SetPriceGuide setName={set.name} rows={priceGuide} currency={COUNTRIES[country].currency} adjective={COUNTRIES[country].adjective} />

      <EbayPicks
        setCode={set.code}
        heading={`${set.name} singles on eBay right now`}
        fallbackQuery={`Riftbound ${set.name}`}
      />

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
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">Sealed products →</Link>
        </div>
      </section>

      {/* Keyword-relevant copy for search */}
      {!set.comingSoon && (
        <section className="card-surface p-6">
          <h2 className="text-xl font-extrabold text-white">About Riftbound {set.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {set.name} is a set in Riftbound: League of Legends TCG. RiftCompare tracks live prices
            for every {set.name} card across stores so you can find the cheapest place
            to buy {set.name} singles — whether you&apos;re chasing a specific card or completing the set.
            Click any card to see every store&apos;s price ranked by total delivered cost.
          </p>
        </section>
      )}

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
    </div>
  );
}
