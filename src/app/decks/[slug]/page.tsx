import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeckSeed, resolveDeck } from "@/lib/meta-decks";
import { DeckView } from "@/components/DeckView";
import { DeckCart } from "@/components/DeckCart";
import type { DeckCartLine } from "@/lib/deck-basket";
import { getCountry } from "@/lib/get-country";

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const seed = getDeckSeed(params.slug);
  if (!seed) notFound(); // real 404 — metadata resolves before streaming
  const legendName = seed.legend.replace(/\s*-\s*Starter$/i, "");
  return {
    title: `${seed.name} — Riftbound meta deck & build cost`,
    description: `${seed.description} See the full ${legendName} decklist priced live across stores.`,
    alternates: { canonical: `/decks/${params.slug}` },
  };
}

// Build a deck-builder text blob so users can re-price/tweak the list in one click.
// The sideboard is excluded — the builder prices the main deck.
function deckListText(legend: string, cards: { name: string; qty: number; section: string }[]): string {
  return [
    `1 ${legend}`,
    ...cards.filter((c) => c.section !== "sideboard").map((c) => `${c.qty} ${c.name}`),
  ].join("\n");
}
function encodeForBuilder(text: string): string {
  return encodeURIComponent(Buffer.from(text, "utf8").toString("base64"));
}

export default async function DeckDetailPage({ params }: { params: { slug: string } }) {
  const seed = getDeckSeed(params.slug);
  if (!seed) notFound();
  const country = getCountry();
  const deck = await resolveDeck(seed, country);

  const builderHref = `/deck?list=${encodeForBuilder(deckListText(seed.legend, seed.cards))}`;

  // Cheapest-cart buy list: main-deck cards (excl. sideboard) that matched a
  // real card, plus the legend. Deduped by card id with summed quantities.
  const cartLineMap = new Map<string, DeckCartLine>();
  const addLine = (card: { id: string; name: string; slug: string | null } | null, qty: number) => {
    if (!card || qty <= 0) return;
    const ex = cartLineMap.get(card.id);
    if (ex) ex.qty += qty;
    else cartLineMap.set(card.id, { cardId: card.id, name: card.name, slug: card.slug, qty });
  };
  for (const item of deck.items) {
    if (item.section === "sideboard") continue;
    addLine(item.card, item.qty);
  }
  addLine(deck.legendCard, 1);
  const cartLines = [...cartLineMap.values()];

  return (
    <div>
      <Link href="/decks" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← All meta decks
      </Link>
      <DeckView deck={deck} builderHref={builderHref} />
      <DeckCart lines={cartLines} country={country} />
    </div>
  );
}
