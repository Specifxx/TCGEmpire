import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeckSeed, resolveDeck } from "@/lib/meta-decks";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { formatAUD } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const seed = getDeckSeed(params.slug);
  if (!seed) return { title: "Deck not found" };
  return {
    title: `${seed.name} — Riftbound meta deck & build cost`,
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

  const rows: { qty: number; name: string; card: (typeof deck.items)[number]["card"]; unit: number | null }[] = [
    { qty: 1, name: seed.legend, card: deck.legendCard, unit: deck.legendPriceCents },
    ...deck.items.map((i) => ({ qty: i.qty, name: i.inputName, card: i.card, unit: i.unitPriceCents })),
  ];

  return (
    <div>
      <Link href="/decks" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← All meta decks
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Legend / summary */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card-surface overflow-hidden">
            {deck.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deck.imageUrl} alt={seed.legend} className="aspect-[5/7] w-full object-cover object-top" />
            )}
            <div className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <TierBadge tier={seed.tier} />
                {seed.domains.map((d) => (
                  <DomainBadge key={d} domain={d} />
                ))}
              </div>
              <h1 className="text-xl font-extrabold text-white">{seed.name}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{seed.archetype} · {seed.legend}</p>
              <p className="mt-3 text-sm text-slate-400">{seed.description}</p>

              <div className="mt-4 rounded-lg bg-ink-900 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Build cost (cheapest AU)</div>
                <div className="text-2xl font-extrabold text-accent">{formatAUD(deck.totalCents)}</div>
                <div className="text-[11px] text-slate-500">
                  {deck.totalCards} cards · {deck.pricedCards} priced
                </div>
              </div>

              <Link href={builderHref} className="btn-primary mt-3 w-full text-center">
                Open in Deck Builder →
              </Link>
            </div>
          </div>
        </div>

        {/* Decklist */}
        <div className="min-w-0">
          <div className="card-surface overflow-hidden">
            <div className="border-b border-ink-700 p-4">
              <h2 className="font-bold text-white">Decklist <span className="text-slate-500">({deck.totalCards})</span></h2>
            </div>
            <ul className="divide-y divide-ink-800">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-3 p-3 hover:bg-ink-900/50">
                  <div className="w-8 text-center font-bold text-slate-400">{r.qty}×</div>
                  {r.card?.imageThumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.card.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    {r.card ? (
                      <Link href={`/card/${r.card.id}`} className="font-medium text-white hover:text-brand-400">
                        {r.card.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-400">{r.name}</span>
                    )}
                    <div className="text-xs text-slate-500">
                      {r.card ? <>{r.card.setCode} · {r.card.collectorNumber} · {r.card.type}</> : "not found"}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.unit != null ? (
                      <>
                        <div className="font-bold text-white">{formatAUD(r.unit * r.qty)}</div>
                        <div className="text-[11px] text-slate-500">{formatAUD(r.unit)} ea</div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">no price</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-ink-700 p-4">
              <span className="text-sm text-slate-400">Total build cost (cheapest in-stock AU)</span>
              <span className="text-xl font-extrabold text-accent">{formatAUD(deck.totalCents)}</span>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-600">
            Community meta reference — lists may change with the metagame. Each card links to its
            full AU price comparison. RiftCompareAU may earn a commission on some outbound links.
          </p>
        </div>
      </div>
    </div>
  );
}
