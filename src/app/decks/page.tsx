import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeckLibrary, type LibraryDeck } from "@/components/decks/DeckLibrary";
import { currentTotals, liveDecks } from "@/lib/published-decks-server";
import { pageAlternates } from "@/lib/seo";

// The public deck library (2026-09-26, DECISIONS.md "Public decks"). ISR: one
// render an hour, and publishing revalidates it on demand. Filters and sort
// run client-side over this list.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Riftbound Decks — Player Decklists Priced Across Stores",
  description:
    "Riftbound decks published by players, each priced card by card at the cheapest store in your market. Filter by legend, domain and budget.",
  alternates: pageAlternates("/decks"),
};

export default async function DecksPage() {
  const decks = await liveDecks();
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
  const legends = [...new Map(rows.map((d) => [d.legendSlug, { slug: d.legendSlug, name: d.legendName.split(",")[0] }])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const domains = [...new Set(rows.flatMap((d) => d.domains))].sort();

  return (
    <div>
      <Breadcrumbs trail={[{ name: "Decks", href: "/decks" }]} />
      <h1 className="text-2xl font-extrabold text-white">Riftbound decks</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Decklists published by players on RiftCompare, each priced card by card at the cheapest store in your market — so a
        deck&apos;s cost is what it takes to build today, not one store&apos;s price for every card.
      </p>

      {rows.length === 0 ? (
        <section className="card-surface mt-6 p-8 text-center">
          <h2 className="text-lg font-bold text-white">No decks published yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Build your deck in the deck builder, price it, and publish it here — with your name on it.
          </p>
          <Link href="/deck" className="btn-primary mt-5 inline-flex">
            Publish the first deck →
          </Link>
        </section>
      ) : (
        <>
          <nav aria-label="Decks by legend" className="mt-4 flex flex-wrap gap-2">
            {legends.map((l) => (
              <Link key={l.slug} href={`/decks/legend/${l.slug}`} className="chip border border-ink-700 hover:border-brand-500">
                {l.name} decks
              </Link>
            ))}
          </nav>
          <div className="mt-5">
            <DeckLibrary decks={rows} legends={legends} domains={domains} />
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Got a list?{" "}
            <Link href="/deck" className="font-semibold text-brand-300 hover:underline">
              Price and publish it in the deck builder →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
