"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CardTile, type CardTileData } from "./CardTile";
import { CardImage } from "./CardImage";
import { PriceWatchButton } from "./PriceWatchButton";
import { TargetPriceField } from "./TargetPriceField";
import { VariantBadge, OvernumberedBadge, SignatureBadge, CrystalRoseBadge, UltimateBadge } from "./Badge";
import { useCountry } from "./CountryProvider";
import { useWatchlist } from "@/lib/use-watchlist";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { watchBaseline } from "@/lib/watch-baseline";
import { tileStock } from "@/lib/market-rows";
import { isOvernumbered, isSignature, isCrystalRose, isUltimate } from "@/lib/constants";
import { EmptyState } from "./ui/EmptyState";
import { Skeleton, SkeletonTile } from "./ui/Skeleton";

// The body of /watching. (Not /watchlist — that path is a permanent redirect to
// the price-alerts explainer; see the route's own header for why.)
//
// THE REMOVE CONTROL IS THE TILE'S OWN HEART. There is no second "remove" button,
// because CardTile already renders PriceWatchButton and that button is now a real
// toggle. Clicking it unwatches, which updates the shared watched-Set, which
// filters the card out of the list below — no refetch, no router refresh, and no
// forked copy of CardTile (which takes only `card` and accepts no children).
interface WatchItem {
  id: string;
  cardId: string;
  market: string;
  lastPriceCents: number | null;
  // The price when the watch was created (null on rows older than the column).
  startPriceCents: number | null;
  // The member's "notify me at" price, in the watch's market currency.
  targetCents: number | null;
  createdAt: string;
  card: CardTileData;
}

// "Watching from" and its %-change come from lib/watch-baseline.ts: the start
// price in the watch's own currency, the delta only for the viewer's market.

// TWO LAYOUTS, because the component is rendered in two very different widths.
//
// `grid` is the /watching page: max-w-5xl, room for three or four CardTiles.
//
// `list` is the header drawer (WatchlistDrawer), which is max-w-md — 448px, and
// about 408px of content once padded. It used to render the SAME grid, and that
// grid's columns are chosen by VIEWPORT breakpoints: on any desktop the viewport
// is past xl, so the drawer got four columns in 408px — tiles about 90px wide,
// names cut to "Baron Nashor…", prices clipped, and a variant badge wide enough
// to lie on top of the heart so the card could not be unwatched at all. The
// breakpoints cannot know they are inside a drawer; there is no container-query
// support in this project to let them. So the drawer gets its own shape: one
// wide row per card, the art large enough to recognise, the full name, the
// price at full size, and the heart in a column of its own that nothing else
// can occupy.
export function Watchlist({
  layout = "grid",
  onNavigate,
}: {
  layout?: "grid" | "list";
  /** Called when a row is followed to its card page — the drawer passes its own close. */
  onNavigate?: () => void;
} = {}) {
  const { country, price } = useCountry();
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
    if (layout === "list") {
      return (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading your watchlist">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-surface flex gap-3 p-3">
              <Skeleton className="aspect-[5/7] w-24 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-auto h-6 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading your watchlist">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  // Once the shared set has loaded, it is the source of truth for what is still
  // watched — that is what makes an unwatch remove the tile instantly. Before it
  // loads, show everything the server sent rather than flashing an empty page.
  const visible = watched ? items.filter((it) => watched.has(it.cardId)) : items;
  // Targets in use across the whole watchlist, every market — the same count
  // the PATCH route enforces the Plus limit on. Updated in place on each save.
  const targetsUsed = visible.filter((it) => it.targetCents != null).length;
  const onTargetSaved = (id: string, cents: number | null) =>
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, targetCents: cents } : it)) : prev));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="heart"
        title="Nothing on watch yet"
        body="Tap the heart on any card and we'll email you the moment it gets cheaper — no need to keep checking back."
        primary={{ href: "/browse", label: "Card database →" }}
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-slate-400">
          <span className="num font-semibold text-white">{visible.length}</span>{" "}
          {visible.length === 1 ? "card" : "cards"} · newest first
        </p>
        <p className="text-xs text-slate-500">Tap a card&apos;s heart to stop watching it</p>
      </div>
      {/* Buy this list (Premium; a free account gets its own delivered total
          as a preview). Best Basket reads the watchlist server-side for the
          viewer's market — nothing is passed in the URL. */}
      <Link
        href="/tools/best-basket?source=watchlist"
        prefetch={false}
        onClick={onNavigate}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline"
      >
        Price my watchlist, delivered →
      </Link>

      {layout === "list" ? (
        <ul className="flex flex-col gap-3">
          {visible.map((it) => (
            <WatchRow
              key={it.id}
              item={it}
              onNavigate={onNavigate}
              targetsUsed={targetsUsed}
              onTargetSaved={(cents) => onTargetSaved(it.id, cents)}
            />
          ))}
        </ul>
      ) : (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((it) => {
          const { label, text, delta } = watchBaseline(it, country, price(it.card));
          return (
            <div key={it.id}>
              <CardTile card={it.card} />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                {text != null ? (
                  <span>
                    {label} <span className="num text-slate-400">{text}</span>
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
              <TargetPriceField
                cardId={it.cardId}
                cardName={cardDisplayName(it.card.name, it.card)}
                market={it.market}
                initialCents={it.targetCents}
                used={targetsUsed}
                onSaved={(cents) => onTargetSaved(it.id, cents)}
                className="mt-2"
              />
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

// One watched card as a full-width row, for the drawer.
//
// THE HEART HAS A COLUMN OF ITS OWN. On a CardTile the heart floats over the
// art in a corner it shares with the variant badges, which is fine at tile
// widths and was fatal at 90px. Here it is a flex sibling of the row's link, so
// no badge, name or price can be laid on top of it at any width, and toggling
// it never follows the link. It is still PriceWatchButton — the same control as
// everywhere else, not a second "remove" button.
function WatchRow({
  item,
  onNavigate,
  targetsUsed,
  onTargetSaved,
}: {
  item: WatchItem;
  onNavigate?: () => void;
  targetsUsed: number;
  onTargetSaved: (cents: number | null) => void;
}) {
  const { country, fmt, price } = useCountry();
  const card = item.card;
  const now = price(card);
  const { label, text, delta } = watchBaseline(item, country, now);
  // Same market-matched count the tile uses; see CardTile and tileStock().
  const stock = tileStock(now, card.storeCounts?.[country] ?? card._count.retailerPrices, card);
  const name = cardDisplayName(card.name, card);
  const ultimate = isUltimate(card.setCode, card.collectorNumber);

  return (
    <li className="card-surface p-3 transition-colors hover:border-ink-600">
      <div className="flex items-start gap-3">
        <Link
          href={cardHref(card)}
          prefetch={false}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="relative aspect-[5/7] w-24 shrink-0 overflow-hidden rounded-md bg-ink-900">
            <CardImage card={card} className="h-full w-full" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="line-clamp-3 text-base font-semibold leading-snug text-white" title={name}>
              {name}
            </h3>
            <p className="text-xs text-slate-500">
              {card.setCode} · {card.collectorNumber}
            </p>
            {/* Inline and wrapping, not overlaid on the art — the badge that used
                to cover the heart now sits in the text column where it has room. */}
            <div className="flex flex-wrap gap-1 empty:hidden">
              <VariantBadge variant={card.variant} />
              <UltimateBadge show={ultimate} />
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber) && !ultimate} />
              <CrystalRoseBadge show={isCrystalRose(card.setCode, card.collectorNumber)} />
            </div>

            <div className="mt-auto pt-1">
              {now != null ? (
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-xl font-bold leading-tight text-accent">{fmt(now)}</span>
                  {stock.kind === "stores" && (
                    <span className="text-xs font-semibold text-brand-400">
                      {stock.count} {stock.count === 1 ? "store" : "stores"}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-500">
                  {stock.kind === "elsewhere" ? "Stocked in another market" : "No price yet"}
                </p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                {text != null ? (
                  <span>
                    {label} <span className="num text-slate-400">{text}</span>
                  </span>
                ) : (
                  <span>no price when you started</span>
                )}
                {delta != null && delta !== 0 && (
                  <span className={`num font-semibold ${delta < 0 ? "text-up" : "text-down"}`}>
                    {delta < 0 ? "↓" : "↑"} {Math.abs(delta)}%
                  </span>
                )}
                {item.market !== country && <span className="chip px-1.5 py-0 text-[10px]">{item.market}</span>}
              </p>
            </div>
          </div>
        </Link>

        <div className="shrink-0">
          <PriceWatchButton cardId={card.id} />
        </div>
      </div>
      {/* Below the row, outside its link: an input inside a link would follow
          the link on every tap. */}
      <TargetPriceField
        cardId={card.id}
        cardName={name}
        market={item.market}
        initialCents={item.targetCents}
        used={targetsUsed}
        onSaved={(cents) => onTargetSaved(cents)}
        className="mt-3 border-t border-ink-800 pt-3"
      />
    </li>
  );
}
