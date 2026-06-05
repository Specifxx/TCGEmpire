"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardTile, CardTileData } from "./CardTile";

export function BrowseGrid({
  initial,
  total,
  query,
}: {
  initial: CardTileData[];
  total: number;
  query: string; // serialized filters/sort (no page)
}) {
  const [cards, setCards] = useState<CardTileData[]>(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const hasMore = cards.length < total;

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/cards?${query}${query ? "&" : ""}page=${next}`);
      const data = await res.json();
      if (Array.isArray(data.cards) && data.cards.length) {
        setCards((prev) => {
          // Guard against duplicates if a request races.
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...data.cards.filter((c: CardTileData) => !seen.has(c.id))];
        });
        setPage(next);
      }
    } catch {
      /* network hiccup — the observer will retry on next intersection */
    } finally {
      setLoading(false);
    }
  }, [loading, page, query]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" } // prefetch before it's actually visible
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {cards.map((c) => (
          <CardTile key={c.id} card={c} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinel} className="flex justify-center py-8">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
            Loading more…
          </div>
        </div>
      )}
      {!hasMore && cards.length > 0 && (
        <p className="py-8 text-center text-xs text-slate-600">
          You&apos;ve reached the end · {total.toLocaleString()} cards
        </p>
      )}
    </>
  );
}
