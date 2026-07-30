"use client";

import { useRef } from "react";
import Link from "next/link";
import { CardImage } from "./CardImage";
import { VariantBadge, OvernumberedBadge, SignatureBadge, CrystalRoseBadge } from "./Badge";
import { PriceWatchButton } from "./PriceWatchButton";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import { cardHref } from "@/lib/card-url";
import { rarityInfo, isOvernumbered, isSignature, isCrystalRose } from "@/lib/constants";
import { cardDisplayName } from "@/lib/card-name";

export interface CardTileData {
  id: string;
  slug: string | null;
  name: string;
  domain: string;
  type: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
  setCode: string;
  setName: string;
  collectorNumber: string;
  energyCost: number | null;
  might: number | null;
  artSeed: number;
  orientation: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  _count: { retailerPrices: number };
}

export function CardTile({ card }: { card: CardTileData }) {
  const r = rarityInfo(card.rarity);
  const stores = card._count.retailerPrices;
  const { open } = useQuickView();
  const { fmt, price } = useCountry();
  const lowest = price(card);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Left-click opens an instant in-page quick view (no navigation = no lag). The
  // real href is kept for SEO, sharing and middle/ctrl-click (open in new tab),
  // and prefetch is off so scrolling a long grid doesn't fire hundreds of prefetches.
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  // A click synthesized from a scroll/drag gesture (common on touch, and on some
  // trackpads that emit a click on release) moves noticeably between pointerdown
  // and click, or arrives long after it — a real tap/click fires both within a
  // few pixels and well under a second. Ignore anything that looks like a drag so
  // scrolling a card row never pops the quick-view preview open mid-scroll.
  function onClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const down = downRef.current;
    if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8 || Date.now() - down.t > 600)) return;
    e.preventDefault();
    open(card);
  }

  return (
    // Outer wrapper holds the hover state and the wishlist button. The wishlist
    // button is a SIBLING of the link (not inside it) so toggling it never triggers
    // navigation or the top loading bar. h-full + flex so every tile in a row (even
    // one with no price yet) matches its siblings' height.
    <div className="cv-auto group card-surface relative flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow">
      <div className="absolute right-2 top-2 z-10">
        <PriceWatchButton cardId={card.id} />
      </div>
      <Link href={cardHref(card)} prefetch={false} onPointerDown={onPointerDown} onClick={onClick} className="flex flex-1 flex-col">
        <div
          className="relative aspect-[5/7] w-full overflow-hidden p-3"
          style={{ backgroundColor: `${r.color}14` }}
        >
          <CardImage
            card={card}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute left-2 top-2 z-20 flex flex-col items-start gap-1">
            <VariantBadge variant={card.variant} />
            <SignatureBadge show={isSignature(card.collectorNumber)} />
            <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
            <CrystalRoseBadge show={isCrystalRose(card.setCode, card.collectorNumber)} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-700 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-white" title={cardDisplayName(card.name, card)}>
          {cardDisplayName(card.name, card)}
        </h3>
        <p className="text-xs text-slate-500">
          {card.setCode} · {card.collectorNumber}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            {lowest != null ? (
              <>
                <div className="text-[11px] text-slate-500">from</div>
                <div className="text-lg font-bold text-accent">
                  {fmt(lowest)}
                </div>
              </>
            ) : (
              <div className="text-sm font-medium text-slate-500">No price yet</div>
            )}
          </div>
          {stores > 0 && (
            <div className="shrink-0 whitespace-nowrap pb-0.5 text-right text-[11px] font-semibold text-brand-400">
              {stores} {stores === 1 ? "store" : "stores"}
            </div>
          )}
        </div>
        </div>
      </Link>
    </div>
  );
}
