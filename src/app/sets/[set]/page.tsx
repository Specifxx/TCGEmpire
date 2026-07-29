import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { CardTile } from "@/components/CardTile";
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
import { priceField } from "@/lib/country";
import { SETS, setBySlug } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

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
  // The whole site renders dynamically (the layout reads the country cookie), so
  // notFound() can't return a hard 404 here; mark unknown slugs noindex so Google
  // never indexes the soft-404 (nothing links to them anyway).
  if (!set) notFound(); // real 404 — metadata resolves before streaming
  // Market-neutral title (no country) so it ranks globally; the page itself is
  // tailored to the visitor's market.
  // Front-loads the "cheapest" buyer hook (GSC: these pages ranked but had very
  // low CTR — "Prices & Full Card List" read as generic next to competitors).
  const title = `Riftbound ${set.name} Prices — Cheapest Sellers`;
  const description = `Find the cheapest Riftbound ${set.name} singles — every card, live prices compared across stores, updated daily.`;
  // A set with no imported cards yet (pre-release, or a data gap where a released
  // set was registered before its cards were imported) renders only a placeholder —
  // thin content. Noindex it so Google doesn't sink crawl budget into a soft-thin
  // page; these empty set URLs are the bulk of the "discovered/crawled – not indexed"
  // pile. It flips back to indexable automatically the moment cards are imported.
  const cardCount = await prisma.card.count({ where: { setCode: set.code } });
  // A filtered/searched view (like /browse's ?q=) is a permutation of the same
  // content, not a distinct page — noindex it and point Google at the clean set page.
  const filtered = !isCleanPagination(searchParams);
  return {
    title: { absolute: `${title} | RiftCompare` },
    description,
    keywords: [
      `Riftbound ${set.name}`,
      `Riftbound ${set.name} prices`,
      `Riftbound ${set.name} card list`,
      `${set.name} card prices`,
      `cheapest Riftbound ${set.name} cards`,
      `Riftbound ${set.name} value`,
    ],
    alternates: {
      canonical: `/sets/${set.slug}`,
      // Single cookie-switched URL is the global default for all four markets.
      languages: { "x-default": `${SITE_URL}/sets/${set.slug}` },
    },
    ...(cardCount === 0 || filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | RiftCompare`, description, url: `${SITE_URL}/sets/${set.slug}` },
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

  const otherSets = SETS.filter((s) => s.slug !== set.slug && !s.comingSoon);
  // A comingSoon set (singles not on sale yet) can still be FULLY revealed —
  // Vendetta's official-gallery pipeline had all 166 main-set cards in the DB
  // before release day. Distinguishing this from "still mid-spoiler-season" (see
  // set.totalCards in lib/constants.ts) keeps the copy below honest either way.
  const fullyRevealed = !!set.totalCards && totalInSet >= set.totalCards;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Database", item: `${SITE_URL}/browse` },
      { "@type": "ListItem", position: 3, name: set.name, item: `${SITE_URL}/sets/${set.slug}` },
    ],
  };
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Riftbound ${set.name} Card Prices & List`,
    url: `${SITE_URL}/sets/${set.slug}`,
    description: `Live prices for every Riftbound ${set.name} card.`,
    isPartOf: { "@type": "WebSite", name: "RiftCompare", url: SITE_URL },
    // No mainEntity ItemList: the visible card grid already links every card as a
    // crawlable <a href>, so serializing the entire list again just doubled a big
    // set's HTML weight (≈1 MB / 1.8k links on Origins) for zero extra crawl value.
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection]) }} />

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

          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 font-display text-lg font-bold tracking-wide text-brand-300">
            {set.code}
          </div>

          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Riftbound {set.name} — card prices &amp; full list
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
              </>
            ) : (
              <>Browse all {totalInSet} Riftbound <strong className="text-slate-200">{set.name}</strong> cards and compare live prices across stores to find the cheapest singles. {priced.toLocaleString()} cards are priced right now, updated daily — switch your country at the top to see local prices.</>
            )}
          </p>

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
              <Link href="/browse" className={set.sealedAvailable ? "btn-ghost" : "btn-primary"}>Browse released sets</Link>
            </div>

            {/* Vendetta explainer content — gives the topical set page real links into
                the guides while the singles list is still empty (helps them get found). */}
            {set.slug === "vendetta" && (
              <div className="mx-auto mt-6 max-w-lg border-t border-ink-800 pt-5 text-left">
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Get ready for Vendetta</p>
                <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                  <li><Link href="/vendetta-countdown" className="font-semibold text-brand-300 hover:underline">⏳ Release countdown →</Link></li>
                  <li><Link href="/blog/riftbound-vendetta-everything-you-need-to-know" className="text-brand-400 hover:underline">Everything you need to know →</Link></li>
                  <li><Link href="/guides/riftbound-empower-explained" className="text-brand-400 hover:underline">Empower mechanic explained →</Link></li>
                  <li><Link href="/blog/riftbound-vendetta-new-mechanics-flow-burn-empower" className="text-brand-400 hover:underline">New mechanics: Flow, Burn &amp; Empower →</Link></li>
                  <li><Link href="/blog/riftbound-vendetta-unit-gear-decrees" className="text-brand-400 hover:underline">New card types: Unit-Gear &amp; Decrees →</Link></li>
                  <li><Link href="/guides/building-for-riftbound-vendetta" className="text-brand-400 hover:underline">Deckbuilding guide &amp; synergies →</Link></li>
                  <li><Link href="/guides/best-riftbound-vendetta-decks" className="text-brand-400 hover:underline">Best Vendetta decks &amp; archetypes →</Link></li>
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <Filters basePath={`/sets/${set.slug}`} hideSet />

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
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
                <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
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

      {/* Internal links to the other sets (crawl + UX) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Other Riftbound sets</h2>
        <div className="flex flex-wrap gap-2">
          {otherSets.map((s) => (
            <Link key={s.slug} href={`/sets/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {s.name}
            </Link>
          ))}
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
