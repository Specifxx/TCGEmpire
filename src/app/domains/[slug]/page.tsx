import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { pickPrice, DEFAULT_COUNTRY, COUNTRIES } from "@/lib/country";
import { buildCollectionNarrative } from "@/lib/content/collection-narrative";
import { getSiteMedianCents } from "@/lib/content/site-median";
import { DOMAIN_PAGES, domainBySlug } from "@/lib/domains";
import { SITE_URL } from "@/lib/site";
import { pageOpenGraph } from "@/lib/seo";
import { deckGroupBySlug, deckGroupPath, seedsInGroup } from "@/lib/deck-groups";

// AU baseline server render (country-neutral copy); card tiles localise the price
// client-side from the per-market price columns, like the set pages.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const domain = domainBySlug(params.slug);
  if (!domain) return notFoundMetadata("Domain");
  const title = `Riftbound ${domain.label} Cards — Prices, Values & Full List`;
  const description = `Every Riftbound ${domain.label} card with live prices compared across stores — find the cheapest ${domain.label} singles. Full ${domain.label} domain card list and values, updated daily.`;
  return {
    title: { absolute: `${title} | RiftCompare` },
    description,
    keywords: [
      `Riftbound ${domain.label}`,
      `Riftbound ${domain.label} cards`,
      `Riftbound ${domain.label} prices`,
      `${domain.label} domain Riftbound`,
      `cheapest Riftbound ${domain.label} cards`,
    ],
    alternates: { canonical: `/domains/${domain.slug}` },
    openGraph: pageOpenGraph({ title: `${title} | RiftCompare`, description, url: `/domains/${domain.slug}` }),
  };
}

export default async function DomainPage({ params }: { params: { slug: string } }) {
  const domain = domainBySlug(params.slug);
  if (!domain) notFound();

  const country = DEFAULT_COUNTRY; // AU baseline; client tiles localise the price

  // Most-valuable first — the cards people actually search for lead, and every tile
  // is an internal link to a long-tail card page (the whole point of these hubs).
  const cards = await prisma.card.findMany({
    where: { domain: domain.key },
    orderBy: [
      { lowestPriceCents: { sort: "desc", nulls: "last" } },
      { collectorNumber: "asc" },
    ],
    select: cardTileSelect(country),
  });
  const priced = cards.filter((c) => pickPrice(c, country) != null).length;

  // Data-derived editorial intro (GROWTH-AUDIT.md § 3). This page measured ~80
  // words of real prose — an intro sentence, two hand-written lore sentences and
  // a link row — carrying 233 inbound internal links, which made it the site's
  // best-linked thin page. buildCollectionNarrative already supported
  // kind: "domain" and was simply never called here; it is the same generator
  // the champion hubs and the type/rarity/printing facets use, so the tone
  // matches by construction rather than by imitation.
  //
  // NO EXTRA QUERY: it reads the card rows this page has already fetched, so
  // every figure is the same data the grid below renders and the two cannot
  // disagree. Anything the data doesn't support, the generator omits.
  const siteMedianCents = await getSiteMedianCents(country);
  const intro = buildCollectionNarrative({
    kind: "domain",
    label: domain.label,
    currency: COUNTRIES[country].currency,
    place: COUNTRIES[country].place,
    members: cards.map((c) => ({
      name: c.name,
      priceCents: pickPrice(c, country),
      setCode: c.setCode,
      rarity: c.rarity,
      collectorNumber: c.collectorNumber,
    })),
    siteMedianCents,
  });

  const otherDomains = DOMAIN_PAGES.filter((d) => d.slug !== domain.slug);
  // Only when a real meta deck plays this domain — a link to a page that 404s is
  // worse than no link.
  const dg = deckGroupBySlug("domain", domain.slug);
  const deckGroup = dg && seedsInGroup(dg).length > 0 ? dg : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Domains", item: `${SITE_URL}/domains` },
      { "@type": "ListItem", position: 3, name: domain.label, item: `${SITE_URL}/domains/${domain.slug}` },
    ],
  };
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Riftbound ${domain.label} Card Prices & List`,
    url: `${SITE_URL}/domains/${domain.slug}`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    description: `Live prices for every Riftbound ${domain.label} card.`,
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection]) }} />

      {/* Breadcrumb + hero */}
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/domains" className="hover:text-slate-300">Domains</Link>
          <span>/</span>
          <span className="text-slate-300">{domain.label}</span>
        </nav>
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: domain.color }} aria-hidden />
          Riftbound {domain.label} cards — prices &amp; full list
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {cards.length > 0 ? (
            <>Browse all {cards.length} Riftbound <strong className="text-slate-200">{domain.label}</strong> cards and compare live prices across stores to find the cheapest singles. {priced.toLocaleString()} are priced right now, updated daily — switch your country at the top to see local prices.</>
          ) : (
            <>We&apos;re tracking the Riftbound <strong className="text-slate-200">{domain.label}</strong> domain — {domain.label} cards with live prices will appear here as they release.</>
          )}
        </p>
        {intro.length > 0 && (
          <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
            {intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </div>

      {/* Card grid */}
      {cards.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No {domain.label} cards yet</p>
            <Link href="/browse" className="btn-primary mt-4">Browse all cards</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}

      {/* Internal links to the other domains (crawl + UX) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Other Riftbound domains</h2>
        <div className="flex flex-wrap gap-2">
          {otherDomains.map((d) => (
            <Link key={d.slug} href={`/domains/${d.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500" style={{ color: d.color }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              {d.label}
            </Link>
          ))}
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">All cards →</Link>
        </div>
      </section>

      {/* Keyword-relevant copy for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">About the {domain.label} domain</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{domain.lore}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Click any card above to see every store&apos;s price ranked by total delivered cost, or
          {" "}
          <Link href={`/browse?domain=${domain.key}`} className="text-brand-400 hover:underline">
            filter the full database by the {domain.label} domain
          </Link>
          .
        </p>
        {/* The deck-side counterpart. This page answers "which {domain} cards
            exist and what do they cost"; /decks/domain/{slug} answers "which meta
            decks play {domain} and what does one cost to build". Linked rather
            than merged so neither has to chase the other's query — and only when
            a real list actually plays the domain (Colorless has none today). */}
        {deckGroup && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            Building rather than collecting?{" "}
            <Link href={deckGroupPath(deckGroup)} className="text-brand-400 hover:underline">
              Every meta deck that plays {domain.label}, with live build costs
            </Link>{" "}
            — priced card for card across stores, with the cheapest cart to buy one right now.
          </p>
        )}
      </section>
    </div>
  );
}
