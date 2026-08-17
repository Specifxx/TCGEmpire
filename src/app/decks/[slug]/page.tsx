import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getDeckSeed, resolveDeck } from "@/lib/meta-decks";
import { DeckView } from "@/components/DeckView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeckCart } from "@/components/DeckCart";
import type { DeckCartLine } from "@/lib/deck-basket";
import { getCountry } from "@/lib/get-country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { META_DECKS } from "@/lib/meta-decks";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

// META_DECKS is a static 10-item list (prisma/meta-decks.json, no DB call), so
// every deck detail page can be prerendered at build time instead of rendered
// dynamically on each first request — the group routes already do this
// (archetype/[slug], domain/[slug]); this was the one deck route that didn't.
export function generateStaticParams() {
  return META_DECKS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const seed = getDeckSeed(params.slug);
  if (!seed) return notFoundMetadata("Deck");
  const legendName = seed.legend.replace(/\s*-\s*Starter$/i, "");
  const title = `${seed.name} — Riftbound meta deck & build cost`;
  const description = `${seed.description} See the full ${legendName} decklist priced live across stores.`;
  return {
    title,
    description,
    alternates: pageAlternates(`/decks/${params.slug}`),
    openGraph: pageOpenGraph({ title, description, url: `/decks/${params.slug}` }),
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
  // Per-market build cost → per-request; cache the deck's card-pricing behind
  // CONTENT_TAG (cleared by the daily import) so Neon is read ~2/day, not per hit.
  const deck = await unstable_cache(() => resolveDeck(seed, country), ["deck", params.slug, country], {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })();

  const builderHref = `/deck?list=${encodeForBuilder(deckListText(seed.legend, seed.cards))}`;
  // Same encoded list, handed to Best Basket instead of the deck builder — the
  // deck page already RUNS the optimiser inline (<DeckCart> below), but until now
  // had no link to the account-gated tool itself, where a signed-in visitor can
  // re-run it against their own wishlist additions or save/revisit the result.
  const bestBasketHref = `/tools/best-basket?list=${encodeForBuilder(deckListText(seed.legend, seed.cards))}`;

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
      {/* Visible trail + BreadcrumbList JSON-LD. The "← All meta decks" link
          below is a back-link, not a hierarchy — Google reads the structured
          trail, and the crawl check asserts every indexable page has one. */}
      <Breadcrumbs
        trail={[
          { name: "Meta decks", href: "/decks" },
          { name: deck.name, href: `/decks/${deck.slug}` },
        ]}
      />
      <Link href="/decks" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← All meta decks
      </Link>
      <DeckView deck={deck} builderHref={builderHref} bestBasketHref={bestBasketHref} />
      <DeckCart lines={cartLines} country={country} />
    </div>
  );
}
