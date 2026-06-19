import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { DOMAIN_PAGES } from "@/lib/domains";
import { SITE_URL } from "@/lib/site";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Domains — Fury, Calm, Mind, Body, Chaos & Order | RiftCompare" },
  description:
    "Browse Riftbound: League of Legends TCG cards by domain. Compare live prices for every Fury, Calm, Mind, Body, Chaos and Order card and find the cheapest singles for your deck.",
  alternates: { canonical: "/domains" },
  openGraph: {
    title: "Riftbound Domains | RiftCompare",
    description: "Browse Riftbound cards by domain and compare live prices.",
    url: `${SITE_URL}/domains`,
  },
};

export default async function DomainsIndexPage() {
  // Per-domain card counts so each hub tile shows how many cards it links to.
  const grouped = await prisma.card.groupBy({ by: ["domain"], _count: { _all: true } });
  const counts = new Map(grouped.map((g) => [g.domain, g._count._all]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Domains</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound domains</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Every card in Riftbound: League of Legends TCG belongs to a domain. Pick one to browse all
          its cards and compare live prices across stores — find the cheapest singles for the deck
          you&apos;re building.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOMAIN_PAGES.map((d) => {
          const n = counts.get(d.key) ?? 0;
          return (
            <Link
              key={d.slug}
              href={`/domains/${d.slug}`}
              className="card-surface group p-5 transition-colors hover:border-brand-500"
            >
              <div className="flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                <h2 className="text-lg font-bold text-white group-hover:text-brand-300" style={{ color: d.color }}>
                  {d.label}
                </h2>
                {n > 0 && <span className="ml-auto text-xs text-slate-500">{n} cards</span>}
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{d.tagline}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d.lore}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
