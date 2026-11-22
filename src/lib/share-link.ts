// Word of mouth (owner, 2026-11-02): shared links and the share message. Pure,
// so the button, the quick view and the tests agree. Every shared link carries
// utm_source=share&utm_medium=<what>; the button sends a Vercel "share" event,
// ShareArrival a "share_visit" when a shared link brings someone, and the
// growth report (lib/earnings/growth-report.ts) counts both for every site.
// DECISIONS.md, "Share buttons and shared lists".

export type ShareMedium = "card" | "sealed" | "deck" | "list" | "page" | "daily" | "pulls" | "binder" | "guide" | "set" | "movers" | "drop";

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

// "Share this deal with your group chat" (owner, 2026-11-23; ported from DexCompare, components/DropShare.tsx): the cheapest open
// STORE listing's real price and name in the visitor's market (never eBay, TCGplayer or Amazon, never converted). People paste drops
// into restock chats anyway; this makes the link they paste ours.
export function dropText(name: string, best: { priceCents: number; retailerName: string } | null, place: string, fmt: (cents: number) => string, preorder = false, site = "RiftCompare"): string | null {
  if (!best) return null;
  return `${preorder ? "Pre-order: " : ""}${name} for ${fmt(best.priceCents)} at ${best.retailerName}, the cheapest store price we found in ${place}. Every store compared on ${site}:`;
}

/** Store rows only: never eBay, TCGplayer or Amazon (dropText). */
export const isStoreRetailer = (retailer: string) => retailer !== "ebay" && !retailer.startsWith("tcgplayer") && !retailer.startsWith("amazon");

// Share-for-a-deal test (owner, 2026-11-18: "if you share … you can open Deal
// Finder"). Half of browsers (kept in localStorage) see "Share · get a deal" and,
// after a share completes, a small card under the button pointing to Deal
// Finder's free views; the other half is the control. Nothing it shows is
// gated: Deal Finder's free rows stay free for everyone, Premium stays as is.
export type ShareArm = "reward" | "plain";
export const SHARE_ARM_KEY = "share_arm";
export function pickShareArm(saved: string | null | undefined, roll: number): ShareArm {
  if (saved === "reward" || saved === "plain") return saved;
  return roll < 0.5 ? "reward" : "plain";
}

// Invite links (owner, 2026-11-18: "people … share stuff with their friends"): a
// signed-in member's share carries their referral code after the #, so every share
// is also an invite. The # part never reaches the server: no new CDN copy of the
// page and no database read until the friend signs up (lib/referral.ts, which
// credits the referrer once per new account). ReferralCapture reads it back.
const INVITE_CODE = /^[a-z0-9]{6,40}$/i;

/** `url` with `#r=<code>` when `code` is a valid referral code, else `url` unchanged. */
export function withInvite(url: string, code: string | null | undefined): string {
  if (!code || !INVITE_CODE.test(code)) return url;
  const u = new URL(url);
  u.hash = `r=${code}`;
  return u.toString();
}

/** The referral code a landing carries: `?ref=` (the profile's invite link) or `#r=` (a member's share). */
export function inviteCodeFrom(search: string, hash: string): string | null {
  const q = new URLSearchParams(search).get("ref");
  if (q && INVITE_CODE.test(q)) return q;
  const h = new URLSearchParams(hash.replace(/^#/, "")).get("r");
  return h && INVITE_CODE.test(h) ? h : null;
}
