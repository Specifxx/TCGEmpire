import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { cardTileSelect } from "@/lib/cards";
import { pickPrice, DEFAULT_COUNTRY } from "@/lib/country";
import { SETS, setBySlug } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Rendered on the AU baseline server-side (country-neutral copy); the card tiles
// localise each visitor's price client-side from the three price columns in the
// card data. (The root layout is cookie-free since be98c66, so this revalidate
// actually applies — the page is on-demand ISR, not per-request dynamic.)
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { set: string } }): Promise<Metadata> {
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
    ...(cardCount === 0 ? { robots: { index: false, follow: true } } : {}),
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
                Riftbound <strong className="text-slate-200">{set.name}</strong> singles aren&apos;t out yet. This page will list every {set.name} card with live prices the moment they release — check back soon.
                {set.sealedAvailable && (
                  <> {set.name} sealed products (booster boxes &amp; packs) are available now — <Link href={`/sealed?q=${set.name.toLowerCase()}`} className="text-brand-300 underline-offset-2 hover:underline">compare them on the sealed page</Link>.</>
                )}
              </>
            ) : (
              <>Browse all {cards.length} Riftbound <strong className="text-slate-200">{set.name}</strong> cards and compare live prices across stores to find the cheapest singles. {priced.toLocaleString()} cards are priced right now, updated daily — switch your country at the top to see local prices.</>
            )}
          </p>

          {/* Count pills (released sets only) */}
          {!set.comingSoon && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip bg-brand-500/15 text-brand-300">
                <CountUp value={cards.length} className="num font-bold" />&nbsp;cards
              </span>
              <span className="chip bg-gold/20 text-gold">
                <CountUp value={priced} className="num font-bold" />&nbsp;priced
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Card grid */}
      {set.comingSoon || cards.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">{set.name} singles aren&apos;t available yet</p>
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
          </div>
        </div>
      ) : (
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </Reveal>
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
