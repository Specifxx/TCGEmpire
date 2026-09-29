"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "./use-me";
import { trackEvent } from "./analytics";

// Shared client-side view of "which sealed products am I watching?" — the
// sealed twin of use-watchlist.ts, module-level for the same reason: a watch
// button sits on every /sealed tile, so one request per page, not per tile,
// and only for a signed-in PAID viewer (/api/me first; a free account or a
// signed-out visitor makes no request — the button sells Plus instead).
//
// Keys are `${market}|${groupKey}`: a watch is per product per market.

export interface SealedWatchRow {
  id: string;
  market: string;
  groupKey: string;
  targetCents: number | null;
  snoozedUntil: string | null;
}

let rows: SealedWatchRow[] | null = null; // null = not loaded, or not entitled
let inflight: Promise<SealedWatchRow[] | null> | null = null;
const subscribers = new Set<(r: SealedWatchRow[] | null) => void>();

function publish() {
  const snapshot = rows ? [...rows] : null;
  for (const fn of subscribers) fn(snapshot);
}

function load(force = false): Promise<SealedWatchRow[] | null> {
  if (!inflight) {
    inflight = fetchMe()
      .then((me) => (me.user && (me.premium || force) ? fetch("/api/watches/sealed", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)) : null))
      .then((d: { watches?: SealedWatchRow[] } | null) => (d ? d.watches ?? [] : null))
      .catch(() => null)
      .then((r) => {
        rows = r;
        publish();
        return r;
      });
  }
  return inflight;
}

export function invalidateSealedWatches() {
  inflight = null;
  rows = null;
  publish();
}

export const sealedWatchKey = (market: string, groupKey: string) => `${market}|${groupKey}`;

export interface SealedWatchOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

// `force` (the /watching list only): read the account's rows even when it is not
// entitled now, so a lapsed member can see and stop what would resume when they
// resubscribe. The per-tile buttons never pass it, so a free account still makes
// no request from /sealed.
export function useSealedWatches(opts: { force?: boolean } = {}) {
  const force = opts.force === true;
  const [state, setState] = useState<SealedWatchRow[] | null>(rows);
  useEffect(() => {
    subscribers.add(setState);
    void load(force).then(setState);
    return () => {
      subscribers.delete(setState);
    };
  }, [force]);
  const keys = state ? new Set(state.map((r) => sealedWatchKey(r.market, r.groupKey))) : null;
  return {
    rows: state,
    keys,
    loaded: state != null || inflight != null,
    rowFor(market: string, groupKey: string): SealedWatchRow | null {
      return state?.find((r) => r.market === market && r.groupKey === groupKey) ?? null;
    },
    async watch(groupKey: string, targetCents: number | null = null): Promise<SealedWatchOutcome> {
      const res = await fetch("/api/watches/sealed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetCents == null ? { groupKey } : { groupKey, targetCents }),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
      const ok = !!res?.ok;
      if (ok && body?.watch) {
        const w = body.watch as SealedWatchRow;
        rows = [...(rows ?? []).filter((r) => r.id !== w.id), w];
        publish();
        trackEvent("sealed_watch_add", { product: groupKey });
      }
      return { ok, status: res?.status ?? 0, body };
    },
    async unwatch(id: string): Promise<boolean> {
      const res = await fetch(`/api/watches/sealed/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return false;
      rows = (rows ?? []).filter((r) => r.id !== id);
      publish();
      return true;
    },
    async update(id: string, patch: { targetCents?: number | null; snoozeDays?: number }): Promise<SealedWatchOutcome> {
      const res = await fetch(`/api/watches/sealed/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
      if (res?.ok && body?.watch) {
        const w = body.watch as SealedWatchRow;
        rows = (rows ?? []).map((r) => (r.id === w.id ? w : r));
        publish();
      }
      return { ok: !!res?.ok, status: res?.status ?? 0, body };
    },
  };
}
