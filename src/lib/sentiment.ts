import { createHmac } from "node:crypto";
import { authSecret } from "./auth-secret";

// COLLECTOR PULSE (2026-11-26, community plan move 1; DECISIONS.md "Collector pulse"): under a sister site's price table,
// one tap says what this visitor is doing with the product today: buying, holding or skipping. The site shows the split
// once enough people answered, and the weekly market posts quote it ("62% of collectors are holding Foundations boxes").
//   • No sign-in. One answer per product per visitor, where a visitor is an HMAC of IP + user agent under a key derived from
//     AUTH_SECRET (its own label, so a pulse voter id never equals a deal-vote voter id): the address is never stored.
//   • A pulse never orders prices, never changes a store row, a deal, an alert or a ranking: it is shown beside the table only.
//   • Nothing is published for a product until MIN_PUBLIC answers: below that the GET says only how many answered, so one
//     person's tap can never be read off the page as "100% buying".
//   • Reads are one bounded, select-limited groupBy over at most MAX_IDS products; the GET is CDN-cached six hours.

export const PULSE_SITES = ["mtg", "tcgprices", "dex"] as const;
export type PulseSite = (typeof PULSE_SITES)[number];
export const PULSE_CHOICES = ["buy", "hold", "skip"] as const;
export type PulseChoice = (typeof PULSE_CHOICES)[number];
export const MAX_IDS = 40;
export const MIN_PUBLIC = 10;
/** A sister site's product id: cuids, slugs and TCGplayer numbers all fit. */
export const PRODUCT_ID = /^[A-Za-z0-9_-]{3,80}$/;

export type Pulse = { n: number; buy: number; hold: number; skip: number } | { n: number };

let derived: Buffer | null = null;
function key(): Buffer {
  if (!derived) derived = createHmac("sha256", Buffer.from(authSecret())).update("collector-pulse:v1").digest();
  return derived;
}

/** The stored voter id: never the address itself. */
export function pulseVoter(ip: string, ua: string): string {
  return createHmac("sha256", key()).update(`${ip}\n${ua.slice(0, 300)}`).digest("base64url").slice(0, 22);
}

/** Rows grouped by (productId, choice) → one public pulse per product, split shown only from MIN_PUBLIC answers. */
export function pulses(rows: readonly { productId: string; choice: string; n: number }[]): Record<string, Pulse> {
  const raw: Record<string, { buy: number; hold: number; skip: number }> = {};
  for (const r of rows) {
    if (!(PULSE_CHOICES as readonly string[]).includes(r.choice)) continue;
    const t = (raw[r.productId] ??= { buy: 0, hold: 0, skip: 0 });
    t[r.choice as PulseChoice] += r.n;
  }
  const out: Record<string, Pulse> = {};
  for (const [id, t] of Object.entries(raw)) {
    const n = t.buy + t.hold + t.skip;
    out[id] = n >= MIN_PUBLIC ? { n, ...t } : { n };
  }
  return out;
}

/** Parse the ids query: unique, valid, at most MAX_IDS. */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => PRODUCT_ID.test(s)))].slice(0, MAX_IDS);
}
