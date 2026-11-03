// Word of mouth (owner, 2026-11-02): shared links and the share message. Pure,
// so the button, the quick view and the tests agree. Every shared link carries
// utm_source=share&utm_medium=<what>; the button sends a Vercel "share" event,
// ShareArrival a "share_visit" when a shared link brings someone, and the
// growth report (lib/earnings/growth-report.ts) counts both for every site.
// DECISIONS.md, "Share buttons and shared lists".

export type ShareMedium = "card" | "sealed" | "deck" | "list" | "page" | "daily" | "pulls" | "binder";

/** `path` (an existing query string is kept) on `origin`, with the share tags. */
export function shareUrl(origin: string, path: string, medium: ShareMedium): string {
  const u = new URL(path, origin);
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

export interface GapRow {
  priceCents: number;
  retailerName: string;
}

export interface PriceGap {
  low: GapRow;
  high: GapRow;
  pct: number;
  sellers: number;
}

/**
 * One market's real spread: cheapest and dearest in-stock item price from two
 * different sellers, in that market's own currency (the caller passes one
 * market's rows). Null when there is no spread to show.
 */
export function priceGap(rows: readonly GapRow[]): PriceGap | null {
  const live = rows.filter((r) => r.priceCents > 0).slice().sort((a, b) => a.priceCents - b.priceCents);
  if (live.length < 2) return null;
  const low = live[0];
  const high = live[live.length - 1];
  const sellers = new Set(live.map((r) => r.retailerName)).size;
  if (sellers < 2 || high.priceCents <= low.priceCents) return null;
  return { low, high, pct: Math.round(((high.priceCents - low.priceCents) / high.priceCents) * 100), sellers };
}

export function shareText(name: string, gap: PriceGap | null, fmt: (cents: number) => string, site = "RiftCompare"): string {
  if (!gap) return `${name}: every store's price on ${site}`;
  return `${name}: ${fmt(gap.low.priceCents)} at ${gap.low.retailerName}, up to ${fmt(gap.high.priceCents)} elsewhere (${gap.pct}% less). Compared on ${site}`;
}
