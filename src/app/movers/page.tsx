import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getPriceMovers } from "@/lib/price-history";
import { PriceWatch } from "@/components/PriceWatch";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";

// ISR: the underlying PriceHistory is rewritten once per day by the price-refresh
// workflow (GitHub Action → import-prices), so a 30-minute window keeps the page
// fresh without recomputing the 35-day aggregation on every request.
export const revalidate = 86400;

// Market-neutral metadata (no country in the title) so the page can rank globally;
// the body is the AU-baseline market the cached page is built from.
export const metadata: Metadata = {
  title: { absolute: "Riftbound Price Movers — Top Risers & Drops | RiftCompare" },
  description:
    "This week's biggest Riftbound card price movers — top risers, biggest drops and best-value deals, compared across stores. Updated daily.",
  keywords: [
    "Riftbound price movers",
    "Riftbound card prices going up",
    "Riftbound price drops",
    "Riftbound best deals",
    "Riftbound cards spiking",
    "Riftbound trending cards",
  ],
  alternates: { canonical: "/movers" },
  openGraph: {
    title: "Riftbound Price Movers — Top Risers & Drops",
    description:
      "This week's biggest Riftbound card price movers — top risers, biggest drops and best-value deals, compared across stores. Updated daily.",
    url: `${SITE_URL}/movers`,
  },
};

export default async function MoversPage() {
  // AU baseline, no cookie read: a getCountry() call would force this route
  // dynamic and kill the revalidate above, so the page is genuinely static.
  const country = DEFAULT_COUNTRY;
  const info = COUNTRIES[country];

  // Deeper list than the homepage teaser. Cache the heavy 35-day aggregation
  // across regenerations (the data only changes on the daily import).
  const movers = await unstable_cache(
    () => getPriceMovers(country, 20),
    ["price-movers-page", country],
    { revalidate: 600 }
  )();

  const hasAny = movers.spiking.length || movers.plummeting.length || movers.value.length;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Price Movers", item: `${SITE_URL}/movers` },
    ],
  };
  // ItemList of the cards actually rendered (risers → drops → value), deduplicated
  // so a card appearing in two lists is listed once, ranked positionally.
  const renderedCards = [...movers.spiking, ...movers.plummeting, ...movers.value].map((m) => m.card);
  const seenIds = new Set<string>();
  const uniqueCards = renderedCards.filter((c) => (seenIds.has(c.id) ? false : (seenIds.add(c.id), true)));
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Riftbound Price Movers",
    url: `${SITE_URL}/movers`,
    description: "This week's biggest Riftbound card price movers — risers, drops and best-value buys.",
    isPartOf: { "@type": "WebSite", name: "RiftCompare", url: SITE_URL },
    ...(uniqueCards.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: uniqueCards.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              url: `${SITE_URL}/card/${c.slug ?? c.id}`,
            })),
          },
        }
      : {}),
  };

  const liveSets = SETS.filter((s) => !s.comingSoon);

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection]) }}
      />

      {/* Breadcrumb + hero */}
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Price Movers</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound price movers — this week
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The Riftbound cards moving the most right now in {info.place}: which singles are{" "}
          <strong className="text-slate-200">spiking</strong>, which are seeing the{" "}
          <strong className="text-slate-200">biggest drops</strong>, and where the{" "}
          <strong className="text-slate-200">best value</strong> is off a card&apos;s recent high. Every
          figure is the latest {info.adjective} lowest price in {info.currency}, compared across stores
          and updated daily. Tap any card for its full price-history chart.
        </p>
      </div>

      {hasAny ? (
        <PriceWatch movers={movers} currency={info.currency} place={info.place} showHeader={false} />
      ) : (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No notable movers yet</p>
            <p className="mt-1 text-sm">
              We need a few days of price history to spot trends. Check back soon, or browse the full
              database in the meantime.
            </p>
            <Link href="/browse" className="btn-primary mt-4">Browse all cards</Link>
          </div>
        </div>
      )}

      {/* Internal links (crawl + discovery) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Browse Riftbound prices by set</h2>
        <div className="flex flex-wrap gap-2">
          {liveSets.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600"
            >
              {s.name}
            </Link>
          ))}
          <Link href="/market" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            RiftCompare Index →
          </Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            All cards →
          </Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            Sealed products →
          </Link>
        </div>
      </section>

      <AdSlot height={100} />

      {/* Keyword-relevant copy for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">How RiftCompare tracks price movers</h2>
        <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            RiftCompare records the lowest live price of every Riftbound card, every day, across the
            stores it tracks in {info.place}. The movers above compare each card&apos;s price today against
            its price about seven days ago to surface the biggest <strong className="text-slate-200">risers</strong> and{" "}
            <strong className="text-slate-200">fallers</strong> of the week, and against its recent high to
            highlight the <strong className="text-slate-200">best-value</strong> buys.
          </p>
          <p>
            It&apos;s the fastest way to spot which Riftbound singles are heating up before a tournament,
            which have cooled off, and where today&apos;s discounts are. Click any card to compare every
            store&apos;s price, ranked by total delivered cost, and to see its full price-history chart.
          </p>
        </div>
      </section>
    </div>
  );
}
