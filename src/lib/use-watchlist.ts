"use client";

import { useEffect, useState } from "react";
import type { Country } from "./country";
import { trackEvent } from "./analytics";
import { trackAlertCreated } from "./growth-events";
import { fetchMe } from "./use-me";

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
    // Signed-out is known from /api/me (one shared request per page; see
    // use-me.ts), so an anonymous visitor makes NO watchlist request
    // (2026-09-23). HeaderWatchButton mounts this on every page, and the old
    // unconditional fetch 401'd on every anonymous page view: a red console
    // error on all 69 pages audited, at every device profile (1069 in one
    // crawl). A signed-in visitor's request now waits one /api/me round trip.
    // If /api/me fails, fetchMe resolves signed-out and the button takes the
    // anonymous flow, the same as a 401 did.
    inflight = fetchMe()
      .then((me) =>
        me.user
          ? fetch("/api/alerts/watchlist", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
          : null,
      )
      // null (signed out per /api/me, or a 401 if the session lapsed in
      // between) is NOT an error state: the button falls back to the
      // anonymous email flow.
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
    // OPTIMISTIC (2026-09-16, was await-then-mutate). The bell flips the
    // instant a visitor taps it — mutate + publish() FIRST, fetch second —
    // and rolls back to the pre-click snapshot if the request fails. A bell
    // that flips instantly and rolls back on the rare failure beats 200ms of
    // dead air on every tap, and the rollback means a silent failure is never
    // a silent LIE: the UI always converges on what the server actually has.
    // MyCollection stays await-first, on purpose — it renders money, where a
    // rollback flicker on a number is worse than a moment of latency.
    async watch(cardId, market) {
      const prev = watched ? new Set(watched) : null;
      watched = watched ? new Set(watched) : new Set();
      watched.add(cardId);
      publish();
      trackEvent("watch_add", { card_id: cardId });
      const res = await fetch("/api/alerts/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, market }),
      }).catch(() => null);
      if (!res?.ok) {
        watched = prev;
        publish();
        return false;
      }
      // Every account alert goes through here — the bell, the card page's
      // one-click alert, and the pending watch SignupWelcome completes after
      // an OAuth sign-up — so one event covers all of them.
      trackAlertCreated(true);
      return true;
    },
    async unwatch(cardId) {
      const prev = watched ? new Set(watched) : null;
      watched?.delete(cardId);
      publish();
      trackEvent("watch_remove", { card_id: cardId });
      const res = await fetch(`/api/alerts/watchlist/${encodeURIComponent(cardId)}`, {
        method: "DELETE",
      }).catch(() => null);
      // 404 means it was already gone — treat as success so the UI converges
      // rather than getting stuck showing a watch that no longer exists.
      if (!res || (!res.ok && res.status !== 404)) {
        watched = prev;
        publish();
        return false;
      }
      return true;
    },
  };
}
