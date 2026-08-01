import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// ISR: a small, stable hub. A crawlable index of every Riftbound set that funnels
// internal link equity to the set pages (the pages already earning impressions),
// and targets the "Riftbound sets / card list / prices" query cluster.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Sets — Full Card Lists & Prices | RiftCompare" },
  description:
    "Every Riftbound: League of Legends TCG set — Origins, Proving Grounds, Spirit Forged and more — with the full card list and live prices compared across AU, NZ, US, UK & SG stores.",
  alternates: { canonical: "/sets" },
  keywords: ["Riftbound sets", "Riftbound card list", "Riftbound set prices", "Riftbound TCG sets"],
  openGraph: {
    title: "Riftbound Sets — Full Card Lists & Prices",
    description: "Every Riftbound set with its full card list and live prices, updated daily.",
    url: `${SITE_URL}/sets`,
  },
};

export default async function SetsIndexPage() {
  // One grouped query for per-set card counts (drives the "N cards" chips + ordering).
  const counts = await prisma.card.groupBy({ by: ["setCode"], _count: { _all: true } });
  const countByCode = new Map(counts.map((c) => [c.setCode, c._count._all]));

  const withCounts = SETS.map((s) => ({ ...s, cards: countByCode.get(s.code) ?? 0 }));
  const released = withCounts.filter((s) => !s.comingSoon && s.cards > 0);
  const upcoming = withCounts.filter((s) => s.comingSoon || s.cards === 0);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Sets", item: `${SITE_URL}/sets` },
    ],
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound Sets",
    url: `${SITE_URL}/sets`,
    itemListElement: released.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Riftbound ${s.name}`,
      url: `${SITE_URL}/sets/${s.slug}`,
    })),
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, itemList]) }} />

      <section className="card-surface animate-fade-up overflow-hidden border-l-2 border-brand-500 bg-ink-900">
        <div className="px-6 py-8">
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <span>/</span>
            <span className="text-slate-300">Sets</span>
          </nav>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound sets — card lists &amp; prices</h1>
      <HubIntro path="/sets" />
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Every set in Riftbound: League of Legends TCG. Open a set for its full card list with live
            prices compared across stores, so you can find the cheapest singles — or complete the set.
          </p>
        </div>
      </section>

      {released.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">Released sets</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {released.map((s) => (
              <Link
                key={s.slug}
                href={`/sets/${s.slug}`}
                className="card-surface group flex items-center justify-between gap-3 p-4 transition-colors hover:border-brand-500"
              >
                <div className="min-w-0">
                  <div className="font-display text-xs font-bold tracking-wide text-brand-300">{s.code}</div>
                  <div className="truncate font-bold text-white group-hover:text-brand-300">{s.name}</div>
                </div>
                <span className="chip shrink-0 bg-brand-500/15 text-brand-300">
                  <span className="num">{s.cards.toLocaleString()}</span>&nbsp;cards
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">Upcoming &amp; unreleased</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((s) => (
              <Link
                key={s.slug}
                href={`/sets/${s.slug}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500"
              >
                {s.name}
                {s.sealedAvailable ? " · sealed live" : " · new"}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">About Riftbound sets</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Riftbound: League of Legends TCG releases in sets, each adding new cards, mechanics and chase
          singles. RiftCompare tracks live prices for every card in every released set across AU, NZ, US
          and UK stores — pick a set above to see its full card list ranked by price and find the cheapest
          place to buy.
        </p>
      </section>
    </div>
  );
}
