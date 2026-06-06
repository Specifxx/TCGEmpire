"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResolvedDeck, ResolvedCardData } from "@/lib/meta-decks";
import { DomainBadge } from "./Badge";
import { TierBadge } from "./TierBadge";
import { formatAUD } from "@/lib/format";

interface Row {
  qty: number;
  name: string;
  card: ResolvedCardData | null;
  unit: number | null;
}

export function DeckView({ deck, builderHref }: { deck: ResolvedDeck; builderHref: string }) {
  const rows: Row[] = [
    { qty: 1, name: deck.legend, card: deck.legendCard, unit: deck.legendPriceCents },
    ...deck.items.map((i) => ({ qty: i.qty, name: i.inputName, card: i.card, unit: i.unitPriceCents })),
  ];

  // The big image on the left follows whichever card you hover (defaults to legend).
  const [preview, setPreview] = useState<ResolvedCardData | null>(deck.legendCard);
  const bigImage = preview?.imageUrl ?? preview?.imageThumbUrl ?? deck.imageUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Preview + summary */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="card-surface overflow-hidden">
          <div className="relative aspect-[5/7] w-full overflow-hidden bg-ink-900">
            {bigImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bigImage}
                alt={preview?.name ?? deck.legend}
                className="h-full w-full object-cover object-top transition-opacity duration-150"
              />
            )}
            {preview && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 to-transparent p-3">
                <div className="text-sm font-bold text-white">{preview.name}</div>
                <div className="text-[11px] text-slate-400">
                  {preview.setCode} · {preview.collectorNumber}
                  {preview.lowestPriceCents != null ? ` · from ${formatAUD(preview.lowestPriceCents)}` : ""}
                </div>
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TierBadge tier={deck.tier} />
              {deck.domains.map((d) => (
                <DomainBadge key={d} domain={d} />
              ))}
            </div>
            <h1 className="text-xl font-extrabold text-white">{deck.name}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{deck.archetype} · {deck.legend}</p>
            <p className="mt-3 text-sm text-slate-400">{deck.description}</p>

            <div className="mt-4 rounded-lg bg-ink-900 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Build cost (cheapest AU)</div>
              <div className="text-2xl font-extrabold text-accent">{formatAUD(deck.totalCents)}</div>
              <div className="text-[11px] text-slate-500">
                {deck.totalCards - 1}-card main deck + legend · {deck.pricedCards}/{deck.totalCards} priced
              </div>
            </div>

            <Link href={builderHref} className="btn-primary mt-3 w-full text-center">
              Open in Deck Builder →
            </Link>
            <p className="mt-2 text-center text-[11px] text-slate-600">Hover a card to preview it here.</p>
          </div>
        </div>
      </div>

      {/* Decklist */}
      <div className="min-w-0">
        <div className="card-surface overflow-hidden">
          <div className="border-b border-ink-700 p-4">
            <h2 className="font-bold text-white">
              Decklist <span className="text-slate-500">· {deck.totalCards - 1} cards + legend</span>
            </h2>
          </div>
          <ul className="divide-y divide-ink-800">
            {rows.map((r, i) => (
              <li
                key={i}
                onMouseEnter={() => r.card && setPreview(r.card)}
                onFocus={() => r.card && setPreview(r.card)}
                className="flex items-center gap-3 p-3 hover:bg-ink-900/50"
              >
                <div className="w-8 text-center font-bold text-slate-400">{r.qty}×</div>
                {r.card?.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.card.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-ink-700" />
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
          Community reference list — may change with the metagame. Each card links to its full AU
          price comparison. RiftCompareAU may earn a commission on some outbound links.
        </p>
      </div>
    </div>
  );
}
