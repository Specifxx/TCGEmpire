// STORE THUMBS UP / DOWN, SHARED BY EVERY SITE (owner, 2026-11-06: "a very tiny
// area where you can just rate the store thumbs up … or thumbs down … public
// data … across all the sites you can now see that these stores are trusted";
// the point is buyer confidence, above all on KaeYoung where fakes worry
// people). DECISIONS.md, "Store thumbs up and down, one tally for every site".
//
// A store is its listing host without "www." (lib: storeKey), so the same shop
// listed on RiftCompare, OP Compare and DexCompare shares one tally. Every
// site's price rows send votes to /api/store-votes here and read the one
// public tally back (CDN six hours). Pure, so tests/store-votes.test.ts pins it.

export const MAX_KEY = 80;
/** Networks and references are not one store: no thumbs for them (TCGplayer, Cardmarket, affiliate hosts…).
 *  eBay and Amazon rows get thumbs like a store row (owner, 2026-11-06), one tally per eBay / Amazon domain (marketKey). */
export const NOT_A_STORE = /(?:^|\.)(?:tcgplayer|cardmarket|etsy|aliexpress|walmart|awin1|anrdoezrs|dpbolvw|jdoqocy|kqzyfj|tkqlhce|linksynergy|shareasale|rakuten)\.com$|(?:^|\.)(?:sjv|pxf)\.io$/;
/** A store's host: letters, digits, dots and hyphens, at least one dot. */
const HOST = /^(?=.{3,80}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
/** The browser's random id (localStorage), never a person's name or address. */
const VID = /^[A-Za-z0-9_-]{16,64}$/;

/** How many different browsers on one network may vote on one store. */
export const MAX_VOTERS_PER_IP_PER_STORE = 3;
/** Votes (and changes) one network may send an hour, every store together. */
export const VOTES_PER_IP_PER_HOUR = 40;
/** "Trusted" once this many thumbs up and at least TRUSTED_SHARE of the votes. */
export const TRUSTED_MIN_UP = 3;
export const TRUSTED_SHARE = 0.8;
/** The public tally never grows past this many stores (most voted first). */
export const MAX_TALLY_STORES = 5000;

/** "https://www.Example.com/products/x" → "example.com"; null for anything that is not an http(s) host. */
/** rover.ebay.com, m.ebay.co.uk, smile.amazon.com… → ebay.com, ebay.co.uk, amazon.com: one tally per domain. */
export function marketKey(host: string): string {
  return host.replace(/^(?:[a-z0-9-]+\.)+((?:ebay|amazon)\.[a-z.]+)$/, "$1");
}

export function storeKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  host = marketKey(host.replace(/^www\./, "").replace(/\.$/, ""));
  return HOST.test(host) && !NOT_A_STORE.test(host) ? host : null;
}

export type ParsedStoreVote = { kind: "ok"; store: string; vote: 1 | -1 | 0; vid: string } | { kind: "error"; error: string };

export function parseStoreVote(body: unknown): ParsedStoreVote {
  if (!body || typeof body !== "object") return { kind: "error", error: "Nothing to send." };
  const b = body as Record<string, unknown>;
  const store = typeof b.store === "string" && b.store.length <= MAX_KEY && HOST.test(b.store) && !NOT_A_STORE.test(b.store) && marketKey(b.store) === b.store ? b.store : null;
  if (!store) return { kind: "error", error: "Unknown store." };
  const vote = b.vote === 1 || b.vote === -1 || b.vote === 0 ? b.vote : null;
  if (vote === null) return { kind: "error", error: "A vote is 1, -1 or 0." };
  const vid = typeof b.vid === "string" && VID.test(b.vid) ? b.vid : null;
  if (!vid) return { kind: "error", error: "Missing browser id." };
  return { kind: "ok", store, vote, vid };
}

/** store → [thumbs up, thumbs down] */
export type StoreTally = Record<string, [number, number]>;

export interface StoreTallyPayload {
  /** when the tally was read (ISO) */
  at: string;
  stores: StoreTally;
}

/** Pure: the grouped rows → the public tally, most voted first, capped. */
export function shapeTally(rows: { store: string; vote: number; count: number }[], at: Date, cap = MAX_TALLY_STORES): StoreTallyPayload {
  const m = new Map<string, [number, number]>();
  for (const r of rows) {
    if (!HOST.test(r.store) || r.count <= 0) continue;
    const t = m.get(r.store) ?? [0, 0];
    if (r.vote > 0) t[0] += r.count;
    else if (r.vote < 0) t[1] += r.count;
    else continue;
    m.set(r.store, t);
  }
  const sorted = [...m.entries()].sort((a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1]) || a[0].localeCompare(b[0])).slice(0, cap);
  return { at: at.toISOString(), stores: Object.fromEntries(sorted) };
}

export function isTrusted(t: [number, number] | null | undefined): boolean {
  if (!t) return false;
  const [up, down] = t;
  return up >= TRUSTED_MIN_UP && up / (up + down) >= TRUSTED_SHARE;
}
