import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { pickPrice, DEFAULT_COUNTRY } from "@/lib/country";
import { SETS, setBySlug } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Statically generated per set (great for SEO/speed) and revalidated so prices stay
// fresh. Rendered on the AU baseline server-side; the card tiles show each visitor's
// own market price client-side (the card data carries all three price columns).
export const revalidate = 1800;

// Only the real set slugs are valid routes; anything else is a hard 404 (no
// soft-404). Valid pages still render per request (getCountry reads the cookie).
export const dynamicParams = false;
export function generateStaticParams() {
  return SETS.map((s) => ({ set: s.slug }));
}

export async function generateMetadata({ params }: { params: { set: string } }): Promise<Metadata> {
  const set = setBySlug(params.set);
  if (!set) return { title: "Set not found" };
  // Market-neutral title (no country) so it ranks globally; the page itself is
  // tailored to the visitor's market.
  const title = `Riftbound ${set.name} Card Prices, Values & Full Card List`;
  const description = `Every Riftbound ${set.name} card with live prices compared across stores — find the cheapest ${set.name} singles. Full ${set.name} card list and values, updated daily.`;
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
    alternates: { canonical: `/sets/${set.slug}` },
    openGraph: { title: `${title} | RiftCompare`, description, url: `${SITE_URL}/sets/${set.slug}` },
  };
}

export default async function SetPage({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  if (!set) notFound();

  const country = DEFAULT_COUNTRY; // AU baseline; client tiles localise the price

  const cards = await prisma.card.findMany({
    where: { setCode: set.code },
    orderBy: [{ collectorNumber: "asc" }],
    select: cardTileSelect(country),
  });
  const priced = cards.filter((c) => pickPrice(c, country) != null).length;

  const otherSets = SETS.filter((s) => s.slug !== set.slug && !s.comingSoon);

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
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection]) }} />

      {/* Breadcrumb + hero */}
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/browse" className="hover:text-slate-300">Database</Link>
          <span>/</span>
          <span className="text-slate-300">{set.name}</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound {set.name} — card prices &amp; full list
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {set.comingSoon ? (
            <>Riftbound <strong className="text-slate-200">{set.name}</strong> isn&apos;t out yet. This page will list every {set.name} card with live prices the moment it releases — check back soon.</>
          ) : (
            <>Browse all {cards.length} Riftbound <strong className="text-slate-200">{set.name}</strong> cards and compare live prices across stores to find the cheapest singles. {priced.toLocaleString()} cards are priced right now, updated daily — switch your country at the top to see local prices.</>
          )}
        </p>
      </div>

      {/* Card grid */}
      {set.comingSoon || cards.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">{set.name} cards aren&apos;t available yet</p>
            <p className="mt-1 text-sm">We&apos;ll have the full list with live prices as soon as the set drops.</p>
            <Link href="/browse" className="btn-primary mt-4">Browse released sets</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}

      {/* Internal links to the other sets (crawl + UX) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Other Riftbound sets</h2>
        <div className="flex flex-wrap gap-2">
          {otherSets.map((s) => (
            <Link key={s.slug} href={`/sets/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
              {s.name}
            </Link>
          ))}
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">All cards →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">Sealed products →</Link>
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
    </div>
  );
}
