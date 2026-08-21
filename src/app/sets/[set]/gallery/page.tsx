import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FilterableCardGallery } from "@/components/FilterableCardGallery";
import { cardTileSelect, trimTileArtFallback } from "@/lib/cards";
import type { CardTileData } from "@/components/CardTile";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { setBySlug, SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

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
  const titleCandidates = [
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
  const description =
    `Browse every Riftbound ${set.name} card in one visual gallery — full card images, filterable by domain, ` +
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

  const cards = await getGalleryCards(set.code);
  const total = cards.length;
  const capped = total >= MAX_TILES;
  const priced = cards.filter((c) => c.lowestPriceCents != null).length;

  // ItemList — the schema type that actually describes a gallery. Entries stay lean
  // (see MAX_ITEMLIST above) and every one points at a real, crawlable card page
  // that the grid below also links, so the markup never describes cards the visitor
  // cannot see.
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound ${set.name} card gallery`,
    description: `Every Riftbound ${set.name} card with images and live prices.`,
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
            Riftbound {set.name} card gallery — every card
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Every Riftbound <strong className="text-slate-200">{set.name}</strong> card in one place, with full card
            images you can actually see. Filter by domain, rarity or type, search by name or collector number, and tap
            any card to open its page — rules text, every printing, price history and a live price comparison across
            every store we track.
          </p>

          {total > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-brand-500/15 text-brand-300">
                <span className="num font-bold">{total.toLocaleString()}</span>&nbsp;cards shown
              </span>
              {priced > 0 && (
                <span className="chip bg-gold/20 text-gold">
                  <span className="num font-bold">{priced.toLocaleString()}</span>&nbsp;priced
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/sets/${set.slug}`} className="btn-primary text-sm">
              Compare {set.name} prices →
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
            <Link href="/browse" className="btn-primary mt-4">Browse released sets</Link>
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

      {/* Editorial context — a gallery of images alone is a thin page; this is the
          part that answers what a searcher landing here actually wants to know. */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">About the Riftbound {set.name} card gallery</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          This gallery shows every card in Riftbound {set.name} — the main set plus the alternate-art Showcase
          printings, Overnumbered chase cards and signature variants that share the set&apos;s numbering. Cards come
          straight from our live database, so the gallery updates itself as new printings are catalogued and as prices
          move. Nothing here is a mock-up: every tile links to a real card page.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Prices shown on each tile are the cheapest live listing we can find in your market, updated daily. Switch your
          country at the top of the page to see local prices in your own currency — the gallery and every card page
          follow it.
        </p>

        <h3 className="mt-6 text-base font-bold text-white">Gallery FAQ</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            <strong className="text-slate-200">How many cards are in Riftbound {set.name}?</strong>{" "}
            {set.totalCards
              ? `The main set is ${set.totalCards} cards. This gallery shows ${total.toLocaleString()} printings in total, because it also includes the alternate-art, Overnumbered and signature versions that sit on top of that base numbering.`
              : `This gallery shows ${total.toLocaleString()} ${set.name} printings, including alternate-art and chase variants.`}
          </p>
          <p>
            <strong className="text-slate-200">Can I filter the gallery?</strong> Yes — filter by domain, rarity and card
            type, search by card name or collector number, and sort by collector number or most recently added. Filtering
            happens instantly in your browser; no page reloads.
          </p>
          <p>
            <strong className="text-slate-200">Do the cards show prices?</strong> Yes. Each tile shows the cheapest live
            price we can find in your market, and tapping a card opens its full store-by-store comparison ranked by total
            delivered cost.
          </p>
        </div>
      </section>

      {/* Internal links out — the gallery is a strong crawl entry point, so it
          should pass that on to the set's guides and the other sets. */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Keep exploring {set.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`/sets/${set.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
            {set.name} prices →
          </Link>
          {set.code === "VEN" && (
            <>
              <Link href="/guides/riftbound-vendetta-card-list" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
                Vendetta card list →
              </Link>
              <Link href="/guides/riftbound-empower-explained" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
                Empower explained →
              </Link>
              <Link href="/guides/riftbound-flow-explained" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
                Flow explained →
              </Link>
              <Link href="/guides/riftbound-burn-explained" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
                Burn explained →
              </Link>
            </>
          )}
          {SETS.filter((s) => s.slug !== set.slug && !s.comingSoon).map((s) => (
            <Link key={s.slug} href={`/sets/${s.slug}/gallery`} className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">
              {s.name} gallery
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
