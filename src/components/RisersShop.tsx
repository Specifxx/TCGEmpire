"use client";

import { useEffect, useState } from "react";
import type { CardTileData } from "./CardTile";
import { CardQuickLink } from "./CardQuickLink";
import { useCountry } from "./CountryProvider";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";

// "Shop the top risers" (buy-clicks boardroom, 2026-11-20, move 2). Reddit link posts land on /rising/<token> snapshots
// and /movers, and those visitors almost never clicked buy: 2 buy clickers in 997 snapshot visitors (13–19 Nov), Rift's
// Reddit visitors 0.7% against 12% from Google. This strip goes in the first screen: the week's top three risers, each
// with its cheapest price NOW in the visitor's market (useCountry().price, the figure every tile shows) and a Buy button
// that opens the quick view, whose first rows are eBay and TCGplayer.
//
// Two sources. /movers passes the cards it already loaded. A snapshot is frozen and holds no live price, so it passes
// slugs and the strip reads those three cards from /api/card/<slug> in the browser: the quick view's own request, cached
// six hours by the CDN, so opening one afterwards costs nothing more. The rows are drawn from the frozen name and image
// at once, so nothing moves when the prices arrive.
export interface RiserSeed {
  slug: string;
  name: string;
  image: string | null;
  setCode: string;
  collectorNumber: string;
}

export function RisersShop({ cards, seeds, note }: { cards?: CardTileData[]; seeds?: RiserSeed[]; note?: string }) {
  const { price, fmt } = useCountry();
  const [loaded, setLoaded] = useState<(CardTileData | null)[] | null>(null);
  const key = (seeds ?? []).map((s) => s.slug).join("|");
  useEffect(() => {
    if (!seeds?.length) return;
    let alive = true;
    Promise.all(
      seeds.map((s) =>
        fetch(`/api/card/${encodeURIComponent(s.slug)}`)
          .then((r) => (r.ok ? (r.json() as Promise<CardTileData>) : null))
          .catch(() => null),
      ),
    ).then((d) => alive && setLoaded(d));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rows: { seed: RiserSeed; card: CardTileData | null }[] = cards
    ? cards.map((c) => ({ seed: { slug: c.slug ?? c.id, name: cardDisplayName(c.name, c), image: c.imageThumbUrl, setCode: c.setCode, collectorNumber: c.collectorNumber }, card: c }))
    : (seeds ?? []).map((s, i) => ({ seed: s, card: loaded?.[i] ?? null }));
  if (!rows.length) return null;

  return (
    <section className="card-surface overflow-hidden" aria-labelledby="shop-risers" data-risers-shop>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-800 bg-ink-900 px-4 py-2.5">
        <h2 id="shop-risers" className="text-base font-bold text-white">Shop the top risers</h2>
        <span className="text-xs text-slate-400">{note ?? "Cheapest price now in your market"}</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {rows.map(({ seed, card }) => {
          const cents = card ? price(card) : null;
          return (
            <li key={seed.slug} className="flex items-center gap-3 px-4 py-2.5">
              {seed.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seed.image} alt={cardImageAlt({ name: seed.name, setCode: seed.setCode, collectorNumber: seed.collectorNumber })} width={32} height={44} loading="lazy" className="h-11 w-8 shrink-0 rounded-sm object-cover" />
              ) : (
                <span className="h-11 w-8 shrink-0 rounded-sm bg-ink-800" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{seed.name}</p>
                <p className="num text-xs text-slate-400">
                  {card == null && seeds ? (
                    <span className="inline-block h-3 w-24 animate-pulse rounded bg-ink-800 align-middle" aria-label="Loading price" />
                  ) : cents != null ? (
                    <>
                      <b className="text-base text-white">{fmt(cents)}</b> cheapest now
                    </>
                  ) : (
                    "Check eBay and TCGplayer"
                  )}
                </p>
              </div>
              {card ? (
                <CardQuickLink card={card} className="btn-buy min-h-10 shrink-0 whitespace-nowrap px-4 text-sm">
                  Buy
                </CardQuickLink>
              ) : (
                // Before the card arrives (or if it can't be read), a plain link: the site-wide handler opens the quick view.
                <a href={`/card/${seed.slug}`} className="btn-buy min-h-10 shrink-0 whitespace-nowrap px-4 text-sm">
                  Buy
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
