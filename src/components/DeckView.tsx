"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ResolvedDeck, ResolvedCardData, ResolvedCard } from "@/lib/meta-decks";
import { DomainBadge } from "./Badge";
import { TierBadge } from "./TierBadge";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { COUNTRIES } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { cardImageAlt } from "@/lib/image-alt";
import { trackEvent } from "@/lib/analytics";

// Tidy display for cards our data labels with a precon suffix (e.g. OGS starter
// legends imported as "Master, Wuju Bladesman - Starter").
function cleanName(name: string): string {
  return name.replace(/\s*-\s*Starter$/i, "");
}

// Decklist display groups (riftDecks-style), in order. The legend is shown above.
// "Main Deck" folds the unit/gear/spell cards together.
const GROUPS: { title: string; sections: string[]; muted?: boolean }[] = [
  { title: "Champion", sections: ["champion"] },
  { title: "Main Deck", sections: ["unit", "gear", "spell"] },
  { title: "Battlefields", sections: ["battlefield"] },
  { title: "Runes", sections: ["rune"] },
  { title: "Side Deck", sections: ["sideboard"], muted: true },
];

export function DeckView({
  deck,
  builderHref,
  bestBasketHref,
}: {
  deck: ResolvedDeck;
  builderHref: string;
  /** Same decklist, pre-filled into the account-gated Best Basket optimiser — a
   *  handoff, not a duplicate of the free inline <DeckCart> below. Optional so
   *  other DeckView callers (deck GROUP pages, which already show their own
   *  Best-Basket-style cart) aren't forced to wire it. */
  bestBasketHref?: string;
}) {
  const { fmt, country } = useCountry();
  const label = COUNTRIES[country].label;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { trackEvent("deck_view", { deck_id: deck.slug, archetype: deck.archetype }); }, [deck.slug]);
  // The big image on the left follows whichever card you hover (defaults to legend).
  const [preview, setPreview] = useState<ResolvedCardData | null>(deck.legendCard);
  const bigImage = preview?.imageUrl ?? preview?.imageThumbUrl ?? deck.imageUrl;

  // The legend rendered as its own pseudo-row in the "Legend" group.
  const legendRow: ResolvedCard = {
    qty: 1,
    inputName: deck.legend,
    section: "legend",
    card: deck.legendCard,
    unitPriceCents: deck.legendPriceCents,
    lineCents: deck.legendPriceCents ?? 0,
  };

  function CardRow({ item }: { item: ResolvedCard }) {
    return (
      <li
        onMouseEnter={() => item.card && setPreview(item.card)}
        onFocus={() => item.card && setPreview(item.card)}
        className="flex items-center gap-3 p-3 hover:bg-ink-900/50"
      >
        <div className="num w-8 text-center font-bold text-slate-400">{item.qty}×</div>
        {item.card?.imageThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.card.imageThumbUrl} alt={cardImageAlt(item.card)} width={36} height={48} className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-ink-700" />
        ) : (
          <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
        )}
        <div className="min-w-0 flex-1">
          {item.card ? (
            <Link href={cardHref(item.card)} className="font-medium text-white hover:text-brand-400">
              {cleanName(item.card.name)}
            </Link>
          ) : (
            <span className="font-medium text-slate-400">{cleanName(item.inputName)}</span>
          )}
          <div className="text-xs text-slate-500">
            {item.card ? <>{item.card.setCode} · {item.card.collectorNumber} · {item.card.type}</> : "not found"}
          </div>
        </div>
        <div className="text-right">
          {item.unitPriceCents != null ? (
            <>
              <div className="num font-bold text-white">{fmt(item.unitPriceCents * item.qty)}</div>
              <div className="num text-[11px] text-slate-500">{fmt(item.unitPriceCents)} ea</div>
            </>
          ) : (
            <div className="text-xs text-slate-500">no price</div>
          )}
        </div>
      </li>
    );
  }

  function Section({ title, items, muted }: { title: string; items: ResolvedCard[]; muted?: boolean }) {
    if (items.length === 0) return null;
    const count = items.reduce((n, i) => n + i.qty, 0);
    return (
      <div className={muted ? "bg-ink-950/40" : ""}>
        <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900/50 px-4 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">{title}</h3>
          <span className="text-[11px] text-slate-500">{count} {count === 1 ? "card" : "cards"}</span>
        </div>
        <ul className="divide-y divide-ink-800">
          {items.map((it, i) => (
            <CardRow key={i} item={it} />
          ))}
        </ul>
      </div>
    );
  }

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
                width={300}
                height={420}
                className="h-full w-full object-cover object-top transition-opacity duration-150"
              />
            )}
            {preview && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 to-transparent p-3">
                <div className="text-sm font-bold text-white">{cleanName(preview.name)}</div>
                <div className="num text-[11px] text-slate-400">
                  {preview.setCode} · {preview.collectorNumber}
                  {preview.lowestPriceCents != null ? ` · from ${fmt(preview.lowestPriceCents)}` : ""}
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
            <p className="mt-0.5 text-xs text-slate-500">{deck.archetype} · {cleanName(deck.legend)}</p>
            <p className="mt-3 text-sm text-slate-400">{deck.description}</p>

            {deck.sourceUrl && (
              <a
                href={deck.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500 hover:text-brand-400"
              >
                <svg className="mt-0.5 h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                </svg>
                <span>
                  Decklist source: <span className="underline">riftDecks.com</span>
                  {deck.source ? ` — ${deck.source}` : ""}
                </span>
              </a>
            )}

            <div className="mt-4 rounded-lg bg-ink-900 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Build cost (cheapest {country})</div>
              <div className="num text-2xl font-extrabold text-accent">{fmt(deck.totalCents)}</div>
              <div className="num text-[11px] text-slate-500">
                {deck.totalCards - 1}-card main deck + legend · {deck.pricedCards}/{deck.priceableCards} priced
              </div>
              <div className="mt-1 text-[11px] text-slate-600">Runes excluded — every deck runs 12 cheap commons.</div>
              {deck.sideboardCards > 0 && (
                <div className="num mt-1 text-[11px] text-slate-500">
                  + {fmt(deck.sideboardCents)} side deck ({deck.sideboardCards} cards)
                </div>
              )}
            </div>

            <Link href={builderHref} className="btn-primary mt-3 w-full text-center">
              Open in Deck Builder →
            </Link>
            {bestBasketHref && (
              <Link href={bestBasketHref} className="btn-ghost mt-2 w-full text-center text-sm">
                Price this deck in Best Basket →
              </Link>
            )}
            <p className="mt-2 text-center text-[11px] text-slate-600">Hover a card to preview it here.</p>
          </div>
        </div>
      </div>

      {/* Decklist (grouped) */}
      <div className="min-w-0">
        <div className="card-surface overflow-hidden">
          <div className="border-b border-ink-700 p-4">
            <h2 className="font-bold text-white">
              Decklist <span className="text-slate-500">· {deck.totalCards - 1} cards + legend</span>
            </h2>
          </div>

          <Section title="Legend" items={[legendRow]} />
          {GROUPS.map((g) => (
            <Section
              key={g.title}
              title={g.title}
              items={deck.items.filter((i) => g.sections.includes(i.section))}
              muted={g.muted}
            />
          ))}

          <div className="flex items-center justify-between border-t border-ink-700 p-4">
            <span className="text-sm text-slate-400">Main deck build cost (cheapest in-stock {country})</span>
            <span className="num text-xl font-extrabold text-accent">{fmt(deck.totalCents)}</span>
          </div>
          {deck.sideboardCards > 0 && (
            <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2">
              <span className="text-xs text-slate-500">Side deck ({deck.sideboardCards} cards)</span>
              <span className="num text-sm font-semibold text-slate-400">{fmt(deck.sideboardCents)}</span>
            </div>
          )}
        </div>
        <div className="mt-3 text-center">
          <p className="text-[11px] text-slate-500">
            Community reference list — may change with the metagame. Each card links to its full {label}
            {" "}price comparison.
          </p>
          <AffiliateDisclosure partner="both" tight />
        </div>
      </div>
    </div>
  );
}
