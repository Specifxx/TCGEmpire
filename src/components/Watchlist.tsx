"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CardTile, type CardTileData } from "./CardTile";
import { useCountry } from "./CountryProvider";
import { useWatchlist } from "@/lib/use-watchlist";

// The body of /watchlist.
//
// THE REMOVE CONTROL IS THE TILE'S OWN BELL. There is no second "remove" button,
// because CardTile already renders PriceWatchButton and that button is now a real
// toggle. Clicking it unwatches, which updates the shared watched-Set, which
// filters the card out of the list below — no refetch, no router refresh, and no
// forked copy of CardTile (which takes only `card` and accepts no children).
interface WatchItem {
  id: string;
  cardId: string;
  market: string;
  lastPriceCents: number | null;
  createdAt: string;
  card: CardTileData;
}

export function Watchlist() {
  const { country, fmt, price } = useCountry();
  const { watched } = useWatchlist();
  const [items, setItems] = useState<WatchItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts/watchlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: WatchItem[] }) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className="card-surface grid min-h-[200px] place-items-center text-sm text-slate-500">Loading…</div>
    );
  }

  // Once the shared set has loaded, it is the source of truth for what is still
  // watched — that is what makes an unwatch remove the tile instantly. Before it
  // loads, show everything the server sent rather than flashing an empty page.
  const visible = watched ? items.filter((it) => watched.has(it.cardId)) : items;

  if (visible.length === 0) {
    return (
      <div className="card-surface p-8 text-center">
        <p className="text-base font-semibold text-white">Nothing on watch yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-400">
          Tap the 🔔 on any card and we&apos;ll email you the moment it gets cheaper — no need to keep
          checking back.
        </p>
        <Link href="/browse" className="btn-primary mt-4 inline-flex">Browse cards →</Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-slate-400">
          <span className="num font-semibold text-white">{visible.length}</span>{" "}
          {visible.length === 1 ? "card" : "cards"} · newest first
        </p>
        <p className="text-xs text-slate-500">Tap a card&apos;s 🔔 to stop watching it</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((it) => {
          const now = price(it.card);
          const base = it.lastPriceCents;
          // The delta only means something when both ends exist. A card with no
          // current price shows the baseline alone rather than a fake 0%.
          const delta = base != null && base > 0 && now != null ? Math.round(((now - base) / base) * 100) : null;
          return (
            <div key={it.id}>
              <CardTile card={it.card} />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                {base != null ? (
                  <span>
                    watching from <span className="num text-slate-400">{fmt(base)}</span>
                  </span>
                ) : (
                  <span>no price when you started</span>
                )}
                {delta != null && delta !== 0 && (
                  <span className={`num font-semibold ${delta < 0 ? "text-up" : "text-down"}`}>
                    {delta < 0 ? "↓" : "↑"} {Math.abs(delta)}%
                  </span>
                )}
                {it.market !== country && <span className="chip px-1.5 py-0 text-[10px]">{it.market}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
