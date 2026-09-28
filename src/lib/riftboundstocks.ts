// Links to RiftboundStocks.com, our sister site (same owner): daily TCGplayer
// price history, foil prices and movers for the same cards. /about already
// points the asset-tracking use case there (2026-09-12, "Never overpay"); this
// is the per-page version — each card, champion and set page links to its own
// counterpart instead of the homepage.
//
// RiftboundStocks names printings differently (Legends without the champion,
// no "-promo" suffix, its own slugs), so it publishes the join itself:
// /api/riftcompare-links maps OUR slugs → ITS pages, built from its port of
// cardSlug() (lib/card-url.ts) and checked there against our card sitemap.
// Nothing here re-derives their slugs.
//
// Egress: one fetch of a ~200 KB static JSON file a day, from RiftboundStocks'
// CDN — no database query, no unstable_cache (it's fetch's own Data Cache).
// On ANY failure the map is null and every link simply isn't rendered.

import * as React from "react";

export const RIFTBOUNDSTOCKS_URL = "https://riftboundstocks.com";
const MAP_URL = process.env.RIFTBOUNDSTOCKS_LINKS_URL || `${RIFTBOUNDSTOCKS_URL}/api/riftcompare-links`;

export interface RiftboundStocksLinkMap {
  /** Our card slug → their card slug. */
  cards: Record<string, string>;
  /** Our champion slug ("kai-sa") → theirs ("kaisa"). */
  champions: Record<string, string>;
  /** Set code ("OGN") → their set slug. */
  sets: Record<string, string>;
}

// React's server `cache` exists only under Next's module resolution; tests
// import this file outside Next, so fall back to a passthrough there.
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof (React as { cache?: unknown }).cache === "function" ? (React as unknown as { cache: typeof cache }).cache : (fn) => fn;

export const getRiftboundStocksLinks = cache(async (): Promise<RiftboundStocksLinkMap | null> => {
  try {
    const res = await fetch(MAP_URL, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<RiftboundStocksLinkMap>;
    if (!d || typeof d.cards !== "object") return null;
    return { cards: d.cards ?? {}, champions: d.champions ?? {}, sets: d.sets ?? {} };
  } catch {
    return null;
  }
});

// Slugs are validated before they go into a URL: the map is another site's
// output, so only plain slug characters are accepted.
const SAFE = /^[a-z0-9-]+$/;
const link = (path: string, slug: string | undefined) => (slug && SAFE.test(slug) ? `${RIFTBOUNDSTOCKS_URL}/${path}/${slug}` : null);

export function rbsCardUrl(map: RiftboundStocksLinkMap | null, cardSlug: string | null | undefined): string | null {
  return map && cardSlug ? link("card", map.cards[cardSlug]) : null;
}

export function rbsChampionUrl(map: RiftboundStocksLinkMap | null, championSlug: string): string | null {
  return map ? link("champions", map.champions[championSlug]) : null;
}

export function rbsSetUrl(map: RiftboundStocksLinkMap | null, setCode: string): string | null {
  return map ? link("sets", map.sets[setCode]) : null;
}
