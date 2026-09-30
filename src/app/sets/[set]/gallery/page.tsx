import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FilterableCardGallery } from "@/components/FilterableCardGallery";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect, trimTileArtFallback } from "@/lib/cards";
import type { CardTileData } from "@/components/CardTile";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { DOMAIN_KEYS, hasSetHub, isPreorderSetCode, setBySlug, SETS } from "@/lib/constants";
import { preordersHrefForSet, spoilersHrefForSet } from "@/lib/release-calendar";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForSet } from "@/lib/content/related-guides";

// ─────────────────────────────────────────────────────────────────────────────
// /sets/<set>/gallery — the visual card gallery
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS SEPARATELY FROM /sets/<set>:
// Search Console shows a cluster of high-impression, near-zero-click queries with
// explicit BROWSE intent — "vendetta card gallery" (284 impressions, 0.4% CTR),
// "riftbound vendetta gallery" (135, 0%) — where we sat around position 8. The set
// page answers a different question: it is paginated, filter-driven and priced,
// i.e. built for "what does this card cost". A searcher typing "gallery" wants to
// LOOK at every card on one screen.
//
// So the two pages are deliberately different intents, not duplicates:
//   /sets/<set>          → commercial. Paginated, sortable, price-first.
//   /sets/<set>/gallery  → visual. Every card on ONE page, big thumbnails,
//                          instant client-side filtering, no pagination.
// The titles and descriptions are kept distinct for the same reason (two pages
// competing for one query helps neither).
//
// RENDERING: no cookies() / searchParams read anywhere in this file, so the route
// stays statically renderable and ISR-cached rather than force-dynamic like its
// parent. Prices are localised CLIENT-side by CardTile (useCountry), exactly as the
// article galleries already do — the server only needs a baseline market for the
// in-stock store count. This is what keeps a 200-tile page off the dynamic path.
export const revalidate = 3600;

// Hard ceiling on tiles rendered. Vendetta (the page this targets) is ~240 rows
// including alt-arts and Overnumbers, so it is complete; Origins (~1,000+) would
// otherwise ship a megabyte of HTML and wreck LCP on the very page type that is
// supposed to be a fast visual browse. Over the cap the page says so and points at
// the paginated set page rather than silently truncating.
const MAX_TILES = 500;
// The promo block's own cap. Far lower than MAX_TILES because the largest promo
// run in any one set is well under it (114 rows across the whole catalogue in
// prisma/promos.json), and because this block is additive to a page that already
// ships up to 500 tiles — LCP on the visual-browse page is the thing MAX_TILES
// exists to protect.
const MAX_PROMO_TILES = 120;

// Lean ItemList entries only (position + url + name). The parent set page removed
// its ItemList precisely because a nested-Product version doubled HTML weight for
// no crawl gain; a gallery IS a list, so ItemList is the correct type here — but it
// stays cheap, and capped, so the schema can never dominate the payload.
const MAX_ITEMLIST = 250;

type GalleryCard = CardTileData & { createdAt?: string | null };

// Every non-promo printing of the set in collector order — main set plus the
// alt-art / Overnumbered / signature printings collectors actually come to look at.
// Promos are excluded: they are not part of the set's own numbering.
const getGalleryCards = unstable_cache(
  async (setCode: string): Promise<GalleryCard[]> => {
    try {
      const rows = await prisma.card.findMany({
        where: { setCode, isPromo: false },
        orderBy: [{ collectorNumber: "asc" }],
        take: MAX_TILES,
        select: { ...cardTileSelect(DEFAULT_COUNTRY), createdAt: true },
      });
      return rows.map((r) => {
        const { createdAt, ...rest } = r as typeof r & { createdAt: Date };
        return { ...rest, createdAt: createdAt.toISOString() };
      }) as unknown as GalleryCard[];
    } catch {
      // Fail OPEN, same rule as the rest of the card surfaces: a DB blip must
      // render an empty gallery, never a 500 on an indexed page.
      return [];
    }
  },
  ["set-gallery"],
  { revalidate: 3600, tags: [CONTENT_TAG] },
);

// THE PROMO PRINTINGS, which the gallery above deliberately leaves out.
//
// WHY THEY GET THEIR OWN BLOCK HERE. `getGalleryCards` filters `isPromo: false`
// because a promo is not part of the set's own numbering, and that is still the
// right call for the numbered gallery. But it left 188 of the catalogue's 1,425
// card pages — 13% — with no inbound link from any list page on the site. A
// promo's only route in was the "Other printings" rail on a sibling card's page,
// which is one click deeper than every other card and depends on Google having
// already indexed the sibling.
//
// Measured 2026-09-17: 431 sitemapped card URLs earned zero impressions in 28
// days while carrying no noindex, and the promos are the sub-population with a
// structural explanation rather than a "nobody searched for it" one.
//
// A separate, clearly-labelled section rather than mixing them into the numbered
// grid: they trade at their own prices and a collector looking for card 151/298
// does not want the Nexus Night version in the same run of tiles.
const getGalleryPromos = unstable_cache(
  async (setCode: string): Promise<GalleryCard[]> => {
    try {
      const rows = await prisma.card.findMany({
        where: { setCode, isPromo: true },
        orderBy: [{ collectorNumber: "asc" }],
        take: MAX_PROMO_TILES,
        select: { ...cardTileSelect(DEFAULT_COUNTRY), createdAt: true },
      });
      return rows.map((r) => {
        const { createdAt, ...rest } = r as typeof r & { createdAt: Date };
        return { ...rest, createdAt: createdAt.toISOString() };
      }) as unknown as GalleryCard[];
    } catch {
      return [];
    }
  },
  ["set-gallery-promos"],
  { revalidate: 3600, tags: [CONTENT_TAG] },
);

export async function generateMetadata({ params }: { params: { set: string } }): Promise<Metadata> {
  const set = setBySlug(params.set);
  if (!set) return notFoundMetadata("Set");

  // -1, NOT 0 — the same sentinel the parent set page, the facet pages and the
  // store pages all use, and for the reason spelled out at sets/[set]/page.tsx:98:
  // "couldn't count" is not "there is nothing here". Falling back to 0 tripped the
  // thin-page noindex below on any transient database failure, and because this
  // route is statically rendered (revalidate = 3600) that noindex is BAKED INTO
  // the cached HTML — an outage during a deploy would have noindexed every set's
  // gallery at once, long outlasting the outage itself. Unknown fails OPEN.
  const total = await prisma.card.count({ where: { setCode: set.code, isPromo: false } }).catch(() => -1);

  // Title leads with the exact query shape ("<set> card gallery"), then the count —
  // a concrete number is the CTR lever on a list page, and it is the thing the
  // competing wiki-style results do not put in their title. Stepped down so the
  // longest set names keep "<set> Card Gallery" intact inside Google's ~60-char
  // truncation, losing only the count.
  // Never let the -1 sentinel reach the title as "All -1 Cards" — a set with no
  // totalCards constant falls back to the live count, which may now be unknown.
  const shownTotal = set.totalCards ?? (total >= 0 ? total : null);
  // PREVIEW SEASON (2026-09-30): a set still revealing cards has neither a
  // complete count nor prices, so the counted rung counts what is here so far
  // ("Riftbound Radiance Card Gallery (84 So Far)") instead of the base run,
  // and the description dates the prices. It never says "Revealed" or
  // "Spoilers": docs/seo-keyword-map.md gives those to the spoiler tracker,
  // and "Card List" to /sets/<slug>. Released sets keep the ladder below.
  const preview = isPreorderSetCode(set.code) && total > 0;
  const releaseLabel = set.releasedOn
    ? new Date(`${set.releasedOn}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", timeZone: "UTC" })
    : null;
  const previewTitles = [
    `Riftbound ${set.name} Card Gallery (${total} So Far)`,
    `Riftbound ${set.name} Card Gallery So Far`,
    `${set.name} Card Gallery (${total} So Far)`,
    `${set.name} Card Gallery So Far`,
  ];
  const titleCandidates = preview ? previewTitles : [
    ...(shownTotal != null
      ? [
          `Riftbound ${set.name} Card Gallery — All ${shownTotal} Cards`,
          `Riftbound ${set.name} Card Gallery — ${shownTotal} Cards`,
        ]
      : []),
    `Riftbound ${set.name} Card Gallery`,
    `${set.name} Card Gallery`,
  ];
  const title = titleCandidates.find((t) => `${t} | RiftCompare`.length <= 60) ?? titleCandidates[titleCandidates.length - 1];
  const announced = set.announcedCards ?? set.totalCards;
  const description = preview
    ? [
        ...(announced && releaseLabel
          ? [`Every Riftbound ${set.name} card shown so far, ${total} of ${announced}, in one gallery of official card images. Filter by domain, rarity or type. Prices from ${releaseLabel}.`]
          : []),
        `Every Riftbound ${set.name} card shown so far, ${total} in all, in one gallery of official card images. Filter by domain, rarity or type.`,
      ].find((d) => d.length <= 155) ?? `Every Riftbound ${set.name} card shown so far, in one gallery of official card images.`
    : `Browse every Riftbound ${set.name} card in one visual gallery — full card images, filterable by domain, ` +
      `rarity and type, with live prices from every store we track. Tap any card for its rules text and price comparison.`;

  // A set with nothing imported has no gallery to show — noindex until it does,
  // matching the parent set page's rule. Flips back automatically on import.
  // Only a CONFIRMED zero trips this; -1 ("couldn't count") deliberately does not.
  const thin = total === 0;

  return {
    title: { absolute: `${title} | RiftCompare` },
    description,
    keywords: [
      `Riftbound ${set.name} card gallery`,
      `${set.name} card gallery`,
      `Riftbound ${set.name} gallery`,
      `${set.name} card list`,
      `Riftbound ${set.name} all cards`,
      `${set.name} card images`,
    ],
    alternates: pageAlternates(`/sets/${set.slug}/gallery`, {
      languages: { "x-default": `${SITE_URL}/sets/${set.slug}/gallery` },
    }),
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title: `${title} | RiftCompare`, description, url: `/sets/${set.slug}/gallery` }),
  };
}

export function generateStaticParams() {
  return SETS.map((s) => ({ set: s.slug }));
}

export default async function SetGalleryPage({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  if (!set) notFound();

  const [cards, promos] = await Promise.all([getGalleryCards(set.code), getGalleryPromos(set.code)]);
  const total = cards.length;
  const capped = total >= MAX_TILES;
  const priced = cards.filter((c) => c.lowestPriceCents != null).length;

  // Pre-release (the same gate generateMetadata uses): the copy counts what is
  // here so far and dates the prices, rather than claiming a complete, priced set.
  const preview = isPreorderSetCode(set.code) && total > 0;
  const announced = set.announcedCards ?? set.totalCards ?? null;
  const releaseLabel = set.releasedOn
    ? new Date(`${set.releasedOn}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  // Text a searcher can read and a crawler can follow, beside the image grid:
  // the set's Legends by name, and how the cards split across the domains.
  // One Legend per name, the in-set printing ahead of its chase prints.
  const legends = [...cards]
    .filter((c) => c.type === "Legend")
    .sort((a, b) => Number(a.rarity === "Showcase") - Number(b.rarity === "Showcase"))
    .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);
  // The set's own run-up pages, from its release-calendar row; each goes null
  // on its own when the set ships.
  const spoilersHref = spoilersHrefForSet(set.code);
  const preordersHref = preordersHrefForSet(set.code);
  const byDomain = DOMAIN_KEYS.map((d) => ({ domain: d, count: cards.filter((c) => c.domain === d).length })).filter((d) => d.count > 0);

  // One FAQ, rendered on the page and marked up as FAQPage, so the two never drift.
  const faq: { q: string; a: string }[] = preview
    ? [
        {
          q: `How many cards are in Riftbound ${set.name}?`,
          a: `${set.totalCards ? `The base set is ${set.totalCards} cards: every base card is numbered out of ${set.totalCards}. ` : ""}${
            set.announcedCards && set.announcedCards !== set.totalCards ? `Riot announced ${set.announcedCards} cards in all, counting Showcase printings. ` : ""
          }This gallery shows the ${total.toLocaleString()} printings shown so far, alternate arts and chase printings included, and grows as more are shown.`,
        },
        ...(releaseLabel
          ? [{ q: `When does Riftbound ${set.name} come out?`, a: `${set.name} releases on ${releaseLabel}. Until then, each card Riot shows is added here as it is catalogued, so the gallery grows through the preview season.` }]
          : []),
        {
          q: "Where do these card images come from?",
          a: "Each image is the finished card as Riot has shown it, from Riot's official card gallery wherever Riot has published the card. Tap any card for its rules text, domain, rarity and every printing.",
        },
        {
          q: `Do ${set.name} cards have prices yet?`,
          a: `Not yet: singles go on sale ${releaseLabel ? `on ${releaseLabel}` : "at release"}. Each card page starts comparing store prices as listings appear, cheapest first by item price.`,
        },
      ]
    : [
        {
          q: `How many cards are in Riftbound ${set.name}?`,
          a: set.totalCards
            ? `The main set is ${set.totalCards} cards. This gallery shows ${total.toLocaleString()} printings in total, because it also includes the alternate-art, Overnumbered and signature versions that sit on top of that base numbering.`
            : `This gallery shows ${total.toLocaleString()} ${set.name} printings, including alternate-art and chase variants.`,
        },
        {
          q: "Can I filter the gallery?",
          a: "Yes — filter by domain, rarity and card type, search by card name or collector number, and sort by collector number or most recently added. Filtering happens instantly in your browser; no page reloads.",
        },
        {
          q: "Do the cards show prices?",
          a: "Yes. Each tile shows the cheapest live price we can find in your market, and tapping a card opens its full store-by-store comparison: cheapest first by item price, with the delivered total shown where the store publishes its postage.",
        },
      ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  // ItemList — the schema type that actually describes a gallery. Entries stay lean
  // (see MAX_ITEMLIST above) and every one points at a real, crawlable card page
  // that the grid below also links, so the markup never describes cards the visitor
  // cannot see.
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound ${set.name} card gallery`,
    description: preview ? `Every Riftbound ${set.name} card shown so far, with official card images.` : `Every Riftbound ${set.name} card with images and live prices.`,
    url: `${SITE_URL}/sets/${set.slug}/gallery`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    numberOfItems: total,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: cards.slice(0, MAX_ITEMLIST).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    })),
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      {total > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <section className="card-surface animate-fade-up relative overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-8">
          <Breadcrumbs
            trail={[
              { name: "Database", href: "/browse" },
              { name: set.name, href: `/sets/${set.slug}` },
              { name: "Card gallery", href: `/sets/${set.slug}/gallery` },
            ]}
          />

          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Riftbound {set.name} card gallery — every card{preview ? " so far" : ""}
          </h1>

          {preview ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Every Riftbound <strong className="text-slate-200">{set.name}</strong> card Riot has shown so far
              {announced ? <> — <span className="num">{total}</span> of the {announced} announced —</> : ""} in one place,
              with the finished card images. Filter by domain, rarity or type, search by name or collector number, and
              tap any card for its rules text and every printing. New cards appear here as they are catalogued
              {releaseLabel ? <>, and prices start when {set.name} releases on {releaseLabel}</> : ""}.
            </p>
          ) : (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Every Riftbound <strong className="text-slate-200">{set.name}</strong> card in one place, with full card
              images you can actually see. Filter by domain, rarity or type, search by name or collector number, and tap
              any card to open its page — rules text, every printing, price history and a live price comparison across
              every store we track.
            </p>
          )}

          {total > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-brand-500/15 text-brand-300">
                <span className="num font-bold">{total.toLocaleString()}</span>&nbsp;
                {preview && announced ? `of ${announced} cards so far` : "cards shown"}
              </span>
              {preview && releaseLabel && <span className="chip bg-ink-800 text-slate-300">Releases {releaseLabel}</span>}
              {priced > 0 && (
                <span className="chip bg-gold/20 text-gold">
                  <span className="num font-bold">{priced.toLocaleString()}</span>&nbsp;priced
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/sets/${set.slug}`} className="btn-primary text-sm">
              {preview ? `${set.name} card list →` : `Compare ${set.name} prices →`}
            </Link>
            <Link href="/browse" className="btn-ghost text-sm">Full card database</Link>
          </div>
        </div>
      </section>

      {total === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No {set.name} cards yet</p>
            <p className="mt-1 text-sm">
              This gallery fills in automatically as {set.name} cards are imported.
            </p>
            <Link href="/browse" className="btn-primary mt-4">Card database</Link>
          </div>
        </div>
      ) : (
        <section>
          <h2 className="sr-only">All {set.name} cards</h2>
          {/* Server-rendered tiles, client-side filtering only — every card is a real
              crawlable <a href> in the HTML whatever the filter state. */}
          <FilterableCardGallery cards={cards.map(trimTileArtFallback)} />
          {capped && (
            <p className="mt-6 text-sm text-slate-400">
              Showing the first {MAX_TILES.toLocaleString()} {set.name} cards.{" "}
              <Link href={`/sets/${set.slug}`} className="text-brand-300 underline-offset-2 hover:underline">
                Browse the complete set with filters and prices →
              </Link>
            </p>
          )}
        </section>
      )}

      {promos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-white">Promo printings from {set.name}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Prerelease, organised-play and Nexus Night printings. They share a collector number with the card they
            reprint but are separate products with their own prices, so they are listed apart from the numbered set
            above.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {promos.map((c) => (
              <CardTile key={c.id} card={trimTileArtFallback(c)} />
            ))}
          </div>
        </section>
      )}

      {(legends.length > 0 || byDomain.length > 0) && (
        <section className="card-surface p-6">
          {legends.length > 0 && (
            <>
              <h2 className="text-xl font-extrabold text-white">{set.name} Legends{preview ? " so far" : ""}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {legends.map((c) => (
                  <li key={c.id}>
                    <Link href={`/card/${c.slug ?? c.id}`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {byDomain.length > 0 && (
            <>
              <h2 className={`${legends.length > 0 ? "mt-6 " : ""}text-xl font-extrabold text-white`}>{set.name} cards by domain</h2>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {byDomain.map((d) => (
                  <li key={d.domain}>
                    <Link href={`/domains/${d.domain.toLowerCase()}`} className="chip border border-ink-700 px-3 py-1.5 transition-colors hover:border-brand-500">
                      {d.domain} <span className="num ml-1 font-bold text-white">{d.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Editorial context — a gallery of images alone is a thin page; this is the
          part that answers what a searcher landing here actually wants to know. */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">About the Riftbound {set.name} card gallery</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {preview
            ? `This gallery shows every Riftbound ${set.name} card shown so far — main-set cards alongside the alternate-art Showcase printings, Overnumbered chase cards and signature variants that share the set's numbering. `
            : `This gallery shows every card in Riftbound ${set.name} — the main set plus the alternate-art Showcase printings, Overnumbered chase cards and signature variants that share the set's numbering. `}
          Cards come straight from our live database, so the gallery updates itself as new printings are catalogued
          {preview ? "" : " and as prices move"}. Nothing here is a mock-up: every tile links to a real card page.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          {preview
            ? `${set.name} has not released yet, so no tile carries a price. From release day each tile shows the cheapest in-stock listing we have for that card in your market, from our two imports a day, and every card page compares every store we track.`
            : "The price on each tile is the cheapest in-stock listing we have for that card in your market — the item price, before postage — from our two imports a day. Switch your country at the top of the page to see local prices in your own currency — the gallery and every card page follow it."}
        </p>

        <h3 className="mt-6 text-base font-bold text-white">Gallery FAQ</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-400">
          {faq.map((f) => (
            <p key={f.q}>
              <strong className="text-slate-200">{f.q}</strong> {f.a}
            </p>
          ))}
        </div>
      </section>

      {/* The set's own guides (lib/content/related-guides.ts SET_GUIDES, topped
          up with the /sets guides). Was a `set.code === "VEN"` block of four
          hard-coded chips, so every other set's gallery linked no guide at all;
          a set's reading list is now a data row, and no template names a set
          (2026-09-26, "Blog and tools, joined up" in DECISIONS.md). */}
      <RelatedGuides guides={guidesForSet(set.code)} className="card-surface p-5" />

      {/* Internal links out — the gallery is a strong crawl entry point, so it
          should pass that on to the set page and the other sets. */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Keep exploring {set.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`/sets/${set.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
            {preview ? `${set.name} card list →` : `${set.name} prices →`}
          </Link>
          {spoilersHref && (
            <Link href={spoilersHref} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {set.name} spoilers, reveal by reveal →
            </Link>
          )}
          {preordersHref && (
            <Link href={preordersHref} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {set.name} pre-order prices →
            </Link>
          )}
          {/* hasSetHub, not !comingSoon: a set in its preview season has a real
              gallery, and every other set's gallery should lead to it. */}
          {SETS.filter((s) => s.slug !== set.slug && hasSetHub(s)).map((s) => (
            <Link key={s.slug} href={`/sets/${s.slug}/gallery`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {s.name} gallery
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
