"use client";

import Link from "next/link";
import { cardHref } from "@/lib/card-url";
import { useQuickView } from "./QuickView";
import type { CardTileData } from "./CardTile";

// Wraps card content in a link that opens the in-page QuickView popup on left-click
// (exactly like the search bar and the browse grid), while keeping a real href for
// SEO, sharing and middle/ctrl/cmd-click (open in a new tab). Drop this in anywhere
// a card list would otherwise navigate to /card/[id].
export function CardQuickLink({
  card,
  className,
  children,
  title,
}: {
  card: CardTileData;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { open } = useQuickView();
  function onClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    open(card);
  }
  return (
    <Link href={cardHref(card)} prefetch={false} onClick={onClick} className={className} title={title}>
      {children}
    </Link>
  );
}
