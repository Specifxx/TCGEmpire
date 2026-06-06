"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardTile, CardTileData } from "./CardTile";
import { getWishlist } from "@/lib/wishlist-client";

// Renders the wishlist from the LIVE client cookie (not a server snapshot), so it
// always reflects what you've just added/removed — no refresh needed — and updates
// instantly as you toggle hearts.
export function WishlistView() {
  const [cards, setCards] = useState<CardTileData[] | null>(null);

  const loadFor = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setCards([]);
      return;
    }
    try {
      const res = await fetch(`/api/cards?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
      const data = await res.json();
      // keep the cookie order
      const order = new Map(ids.map((id, i) => [id, i]));
      const sorted = (data.cards as CardTileData[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setCards(sorted);
    } catch {
      setCards([]);
    }
  }, []);

  useEffect(() => {
    loadFor(getWishlist());
    // Live-update when a heart is toggled anywhere.
    const onChange = () => {
      const ids = getWishlist();
      setCards((prev) => {
        // Optimistically drop removed cards immediately; refetch for additions.
        if (prev) {
          const keep = prev.filter((c) => ids.includes(c.id));
          if (keep.length !== ids.length) loadFor(ids);
          return keep;
        }
        loadFor(ids);
        return prev;
      });
    };
    window.addEventListener("wishlist-change", onChange);
    return () => window.removeEventListener("wishlist-change", onChange);
  }, [loadFor]);

  if (cards === null) {
    return (
      <div className="flex justify-center py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="card-surface grid place-items-center p-16 text-center">
        <p className="text-lg font-semibold text-white">Your wishlist is empty</p>
        <p className="mt-1 text-sm text-slate-400">Tap the ♥ on any card to add it here and track its price.</p>
        <Link href="/browse" className="btn-primary mt-4">Browse cards</Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
      {cards.map((c) => (
        <CardTile key={c.id} card={c} />
      ))}
    </div>
  );
}
