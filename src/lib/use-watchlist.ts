"use client";

import { useEffect, useState } from "react";
import type { Country } from "./country";

// Shared client-side view of "which cards am I watching?".
//
// MODULE-LEVEL, like use-me.ts, and for the same reason: PriceWatchButton renders
// on every tile of /browse and every set gallery, so a per-component fetch would
// mean one request per card. One shared promise means one request per page load.
//
// Unlike use-me it also keeps a SUBSCRIBER list, because this state changes while
// the page is open: unwatching from a tile's own bell has to make that tile
// disappear from /watchlist immediately, without a refetch or a router refresh.

let watched: Set<string> | null = null; // null = not loaded, or signed out
let inflight: Promise<Set<string> | null> | null = null;
const subscribers = new Set<(s: Set<string> | null) => void>();

function publish() {
  // Hand out a COPY: React bails out of a re-render when the new state is
  // reference-equal to the old, so mutating the shared Set in place would update
  // nothing on screen.
  const snapshot = watched ? new Set(watched) : null;
  for (const fn of subscribers) fn(snapshot);
}

function load(): Promise<Set<string> | null> {
  if (!inflight) {
    inflight = fetch("/api/alerts/watchlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      // A 401 (signed out) resolves to null and is NOT an error state — the
      // button just falls back to the anonymous email flow.
      .then((d: { items?: { cardId: string }[] } | null) =>
        d ? new Set((d.items ?? []).map((i) => i.cardId)) : null,
      )
      .catch(() => null)
      .then((s) => {
        watched = s;
        publish();
        return s;
      });
  }
  return inflight;
}

/** Re-fetch on next use — call beside invalidateMe() on login/logout. */
export function invalidateWatchlist() {
  inflight = null;
  watched = null;
  publish();
}

export interface WatchlistApi {
  /** Watched card ids, or null while loading / when signed out. */
  watched: Set<string> | null;
  loaded: boolean;
  watch(cardId: string, market: Country): Promise<boolean>;
  unwatch(cardId: string): Promise<boolean>;
}

export function useWatchlist(): WatchlistApi {
  const [state, setState] = useState<{ watched: Set<string> | null; loaded: boolean }>({
    watched: watched ? new Set(watched) : null,
    loaded: inflight !== null && watched !== null,
  });

  useEffect(() => {
    const fn = (s: Set<string> | null) => setState({ watched: s, loaded: true });
    subscribers.add(fn);
    void load().then(() => setState({ watched: watched ? new Set(watched) : null, loaded: true }));
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  return {
    watched: state.watched,
    loaded: state.loaded,
    // Await the server, THEN update local state. Deliberately not optimistic:
    // nothing else in this codebase is (MyCollection and MarketplaceOrders both
    // await before mutating), and an optimistic bell that silently reverts is a
    // worse lie than a bell that takes 200ms.
    async watch(cardId, market) {
      const res = await fetch("/api/alerts/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, market }),
      }).catch(() => null);
      if (!res?.ok) return false;
      watched = watched ?? new Set();
      watched.add(cardId);
      publish();
      return true;
    },
    async unwatch(cardId) {
      const res = await fetch(`/api/alerts/watchlist/${encodeURIComponent(cardId)}`, {
        method: "DELETE",
      }).catch(() => null);
      // 404 means it was already gone — treat as success so the UI converges
      // rather than getting stuck showing a watch that no longer exists.
      if (!res || (!res.ok && res.status !== 404)) return false;
      watched?.delete(cardId);
      publish();
      return true;
    },
  };
}
