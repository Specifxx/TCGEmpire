import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeckSeed, resolveDeck } from "@/lib/meta-decks";
import { DeckView } from "@/components/DeckView";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const seed = getDeckSeed(params.slug);
  if (!seed) return { title: "Deck not found" };
  return {
    title: `${seed.name} — Riftbound preconstructed deck & build cost`,
    description: `${seed.description} See the full ${seed.legend} decklist priced live across Australian stores.`,
    alternates: { canonical: `/decks/${params.slug}` },
  };
}

// Build a deck-builder text blob so users can re-price/tweak the list in one click.
function deckListText(legend: string, cards: { name: string; qty: number }[]): string {
  return [`1 ${legend}`, ...cards.map((c) => `${c.qty} ${c.name}`)].join("\n");
}
function encodeForBuilder(text: string): string {
  return encodeURIComponent(Buffer.from(text, "utf8").toString("base64"));
}

export default async function DeckDetailPage({ params }: { params: { slug: string } }) {
  const seed = getDeckSeed(params.slug);
  if (!seed) notFound();
  const deck = await resolveDeck(seed);

  const builderHref = `/deck?list=${encodeForBuilder(deckListText(seed.legend, seed.cards))}`;

  return (
    <div>
      <Link href="/decks" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← All preconstructed decks
      </Link>
      <DeckView deck={deck} builderHref={builderHref} />
    </div>
  );
}
