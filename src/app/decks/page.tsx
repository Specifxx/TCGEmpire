import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { DeckLibrary, type LibraryDeck } from "@/components/decks/DeckLibrary";
import { guidesForTool } from "@/lib/content/tool-guides";
import { currentTotals, liveDecksOrNull } from "@/lib/published-decks-server";
import { pageAlternates } from "@/lib/seo";

// The public deck library (2026-09-26, DECISIONS.md "Public decks"). ISR: one
// render an hour, and publishing revalidates it on demand. Filters and sort
// run client-side over this list.
export const revalidate = 3600;

// One read of the library per render, shared by generateMetadata and the page
// (React's request cache, not a data cache: nothing here outlives the render,
// so no loader is wrapped in another cache — src/lib/db.ts rule 6).
const loadDecks = cache(() => liveDecksOrNull());

// Noindexed while the library is empty (2026-09-26, "Blog and tools, joined
// up"): with no decks it is a heading, an intro and a button — the thin,
// indexable page an ad review marks down. The same rule the legend pages
// already follow; the intro renders either way, and the first published deck
// makes the page indexable on its next render (publishing revalidates it).
// A failed read (null) is not an empty library: the page stays indexable.
export async function generateMetadata(): Promise<Metadata> {
  const decks = await loadDecks();
  return {
    title: "Riftbound Decks — Player Decklists Priced Across Stores",
    description:
      "Riftbound decks published by players, each priced card by card at the cheapest store in your market. Filter by legend, domain and budget.",
    alternates: pageAlternates("/decks"),
    ...(decks !== null && decks.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DecksPage() {
  const decks = (await loadDecks()) ?? [];
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
      {/* How a deck's total is worked out and what a missing one means
          (2026-09-26, "Blog and tools, joined up"): lib/content/hub-intros.ts,
          in place of a one-sentence lede. */}
      <HubIntro path="/decks" />

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

      {/* The guides for reading a list, after the library. */}
      <RelatedGuides guides={guidesForTool("/decks")} className="card-surface mt-8 p-5" />
    </div>
  );
}
