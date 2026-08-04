import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { DOMAIN_PAGES } from "@/lib/domains";
import { SITE_URL } from "@/lib/site";

// Facet index — links every card-type, rarity and printing hub in one place, plus
// the existing domain hubs. This is the internal-linking backbone item B2 needs:
// every facet page links back here, and every card page links out to its facets,
// so the ~370 currently crawled-not-indexed / discovered-not-indexed pages get a
// real path in from somewhere other than a 14-page-deep /browse pagination chain.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Browse Riftbound Cards by Type, Rarity & Printing | RiftCompare" },
  description:
    "Every way to browse the Riftbound card database — by domain, card type, rarity and printing — each with live prices across every store we track.",
  alternates: { canonical: "/cards" },
  openGraph: { title: "Browse Riftbound Cards | RiftCompare", description: "Browse by domain, type, rarity and printing.", url: `${SITE_URL}/cards` },
};

export default async function CardsIndexPage() {
  const [byType, byRarity] = await Promise.all([
    prisma.card.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.card.groupBy({ by: ["rarity"], _count: { _all: true } }),
  ]);
  const typeCounts = new Map(byType.map((g) => [g.type, g._count._all]));
  const rarityCounts = new Map(byRarity.map((g) => [g.rarity, g._count._all]));

  const [altCount, sigCount, overCount, promoCount] = await Promise.all([
    prisma.card.count({ where: { variant: { not: null } } }),
    prisma.card.count({ where: { collectorNumber: { contains: "*" } } }),
    prisma.card.count({ where: { isOvernumbered: true } }),
    prisma.card.count({ where: { isPromo: true } }),
  ]);
  const printingCounts: Record<string, number> = {
    "alternate-art": altCount,
    signature: sigCount,
    overnumbered: overCount,
    promo: promoCount,
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
    ],
  };

  function FacetGrid({
    title,
    facets,
    base,
    counts,
  }: {
    title: string;
    facets: { slug: string; label: string }[];
    base: string;
    counts: Map<string, number> | Record<string, number>;
  }) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-extrabold text-white">{title}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {facets.map((f) => {
            const n = counts instanceof Map ? counts.get(f.label) ?? 0 : counts[f.slug] ?? 0;
            const thin = n < FACET_THIN_THRESHOLD;
            return (
              <Link
                key={f.slug}
                href={`${base}/${f.slug}`}
                className="card-surface flex items-center justify-between gap-2 p-3.5 text-sm font-semibold text-white transition-colors hover:border-brand-500 hover:text-brand-300"
              >
                {f.label}
                <span className="text-xs font-normal text-slate-500">{thin ? "" : n.toLocaleString()}</span>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Cards</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Browse Riftbound cards</h1>
      <HubIntro path="/cards" />
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Every way to slice the Riftbound card database — by domain, card type, rarity or printing —
          each a live, server-rendered page with real prices. Want every filter at once?{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">Use the full filterable database →</Link>
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-white">By champion</h2>
        <p className="mb-3 text-sm text-slate-400">
          Every card featuring a champion, across every set, with live prices —{" "}
          <Link href="/champions" className="text-brand-400 hover:underline">browse all champions →</Link>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-white">By domain</h2>
        <div className="flex flex-wrap gap-2">
          {DOMAIN_PAGES.map((d) => (
            <Link key={d.slug} href={`/domains/${d.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500" style={{ color: d.color }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              {d.label}
            </Link>
          ))}
        </div>
      </section>

      <FacetGrid title="By card type" facets={TYPE_FACETS} base="/cards/type" counts={typeCounts} />
      <FacetGrid title="By rarity" facets={RARITY_FACETS} base="/cards/rarity" counts={rarityCounts} />
      <FacetGrid title="By printing" facets={PRINTING_FACETS} base="/cards/printing" counts={printingCounts} />

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Looking for a keyword or mechanic?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Empower, Flow, Burn and the rest of Riftbound&apos;s keywords have their own reference pages —
          see the <Link href="/keywords" className="text-brand-400 hover:underline">keywords &amp; game actions glossary</Link>.
        </p>
      </section>
    </div>
  );
}
