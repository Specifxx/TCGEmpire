import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeckLibrary, type LibraryDeck } from "@/components/decks/DeckLibrary";
import { championBySlug, championCardWhere } from "@/lib/champions";
import { currentTotals, liveDecks } from "@/lib/published-decks-server";
import { SITE_URL } from "@/lib/site";

// Legend landing pages (2026-09-26): every published deck for one champion's
// Legend. ISR, an hour; publishing revalidates the legend's page. A legend with
// no decks yet shows "Publish the first {Legend} deck" and is noindexed until
// it has one, so no thin page is offered to search.
export const revalidate = 3600;

// Returns NOTHING, deliberately — the same device as /card/[id]: an (empty)
// generateStaticParams is what makes Next cache each on-demand render for
// `revalidate` (ISR) instead of rendering every request. It prerenders no page
// at build, so it adds no build-time database load (CLAUDE.md).
export async function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  const champ = championBySlug(slug);
  if (!champ) return null;
  // Only champions that actually have a Legend card get a page.
  const legend = await prisma.card
    .findFirst({ where: { AND: [championCardWhere(champ), { type: "Legend" }] }, select: { id: true } })
    .catch(() => null);
  if (!legend) return null;
  const decks = await liveDecks({ legendSlug: champ.slug });
  return { champ, decks };
}

export async function generateMetadata({ params }: { params: { legend: string } }): Promise<Metadata> {
  const data = await load(params.legend);
  if (!data) return { title: "Legend not found", robots: { index: false } };
  const n = data.decks.length;
  return {
    title: `${data.champ.name} Decks — Riftbound Decklists Priced Across Stores`,
    description: `Riftbound ${data.champ.name} decks published by players, each priced card by card at the cheapest store in your market.`,
    alternates: { canonical: `${SITE_URL}/decks/legend/${data.champ.slug}` },
    ...(n === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function LegendDecksPage({ params }: { params: { legend: string } }) {
  const data = await load(params.legend);
  if (!data) notFound();
  const { champ, decks } = data;
  const totals = await currentTotals(decks);
  const rows: LibraryDeck[] = decks.map((d) => ({
    slug: d.slug,
    title: d.title,
    authorName: d.authorName,
    legendName: d.legendName,
    legendSlug: d.legendSlug,
    domains: d.domains ? d.domains.split(",") : [],
    cardCount: d.cardCount,
    createdAt: d.createdAt.toISOString(),
    totals: totals[d.id] ?? {},
  }));

  return (
    <div>
      <Breadcrumbs
        trail={[
          { name: "Decks", href: "/decks" },
          { name: `${champ.name} decks`, href: `/decks/legend/${champ.slug}` },
        ]}
      />
      <h1 className="text-2xl font-extrabold text-white">{champ.name} decks</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        {champ.name} decklists published by players, priced card by card at the cheapest store in your market.{" "}
        <Link href={`/champions/${champ.slug}`} className="text-brand-300 hover:underline">
          Every {champ.name} card and price →
        </Link>
      </p>
      {rows.length === 0 ? (
        <section className="card-surface mt-6 p-8 text-center">
          <h2 className="text-lg font-bold text-white">No {champ.name} decks yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Build it in the deck builder, price every card, and publish it here with your name on it.
          </p>
          <Link href="/deck" className="btn-primary mt-5 inline-flex">
            Publish the first {champ.name} deck →
          </Link>
        </section>
      ) : (
        <div className="mt-5">
          <DeckLibrary decks={rows} legends={[]} domains={[...new Set(rows.flatMap((d) => d.domains))].sort()} />
        </div>
      )}
    </div>
  );
}
