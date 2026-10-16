// The pull tracker, as pure functions (2026-10-16 growth pass; DECISIONS.md,
// "Growth: meet readers where they are"). Log what a box or pack gave you, see
// what it is worth against what you paid, save it to your binder, share it.
//
// Sharing needs no database: the pulls ride in the link itself, as collector
// numbers ("174*:1,169*:2") within one set, with the price paid and the market.
// A share page reads only the set's public catalogue, so a link can never carry
// or reveal anything private, and every share is a visit for someone new.
import type { Country } from "./country";

/** Sets a pull can come from (Proving Grounds is a box set, not opened from packs). */
export const PULL_SET_SLUGS = ["radiance", "vendetta", "unleashed", "spiritforged", "origins"] as const;
export type PullSetSlug = (typeof PULL_SET_SLUGS)[number];
export const isPullSet = (s: string): s is PullSetSlug => (PULL_SET_SLUGS as readonly string[]).includes(s);

export const MAX_PULL_LINES = 60;
export const MAX_PULL_QTY = 99;

export interface PullLine {
  /** The collector number's numerator as printed: "174*", "065a", "R02". */
  num: string;
  qty: number;
}

/** A collector number without its set total ("174a" from "174a/167"): the key a pull is stored and shared by. */
export function pullKey(collectorNumber: string): string {
  return collectorNumber.split("/")[0].trim();
}

const KEY_RE = /^[0-9A-Za-z*]{1,8}$/;

/** Pulls → "174*:1,169*:2". Merges duplicates, drops bad lines, caps the size. */
export function encodePulls(lines: PullLine[]): string {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!KEY_RE.test(l.num)) continue;
    merged.set(l.num, Math.min(MAX_PULL_QTY, (merged.get(l.num) ?? 0) + Math.max(0, Math.floor(l.qty))));
  }
  return [...merged]
    .filter(([, q]) => q > 0)
    .slice(0, MAX_PULL_LINES)
    .map(([n, q]) => `${n}:${q}`)
    .join(",");
}

/** The inverse, tolerant of anything a link might have picked up on the way. */
export function decodePulls(raw: string | null | undefined): PullLine[] {
  if (!raw) return [];
  const out: PullLine[] = [];
  for (const part of String(raw).slice(0, 1200).split(",")) {
    const [num, q] = part.split(":");
    const qty = Math.floor(Number(q ?? 1));
    if (!num || !KEY_RE.test(num) || !Number.isFinite(qty) || qty < 1) continue;
    out.push({ num, qty: Math.min(MAX_PULL_QTY, qty) });
    if (out.length >= MAX_PULL_LINES) break;
  }
  return out;
}

/** What was paid, in cents, from a share link's "142.30". Bounded; null when absent or nonsense. */
export function parsePaid(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0 || v > 100_000) return null;
  return Math.round(v * 100);
}

export interface PricedPull {
  num: string;
  qty: number;
  /** Each, in the market's currency; null when no store prices it. */
  eachCents: number | null;
}

export interface PullSummary {
  totalCents: number;
  pricedLines: number;
  unpricedLines: number;
  copies: number;
  /** total - paid, when paid is known. */
  diffCents: number | null;
  /** total / paid, when paid is known. */
  ratio: number | null;
  best: PricedPull | null;
}

export function summarisePulls(lines: PricedPull[], paidCents: number | null): PullSummary {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  let copies = 0;
  let best: PricedPull | null = null;
  for (const l of lines) {
    copies += l.qty;
    if (l.eachCents == null) {
      unpriced++;
      continue;
    }
    priced++;
    total += l.eachCents * l.qty;
    if (!best || (best.eachCents ?? 0) < l.eachCents) best = l;
  }
  return {
    totalCents: total,
    pricedLines: priced,
    unpricedLines: unpriced,
    copies,
    diffCents: paidCents ? total - paidCents : null,
    ratio: paidCents ? total / paidCents : null,
    best,
  };
}

/** The share URL's query, so the page, the OG image and the client agree on one format. */
export function shareQuery(lines: PullLine[], paidCents: number | null, country: Country): string {
  const q = new URLSearchParams();
  q.set("p", encodePulls(lines));
  if (paidCents) q.set("paid", (paidCents / 100).toFixed(2));
  q.set("m", country);
  return q.toString();
}

/** A CSV the collection import's printing-aware path reads (lib/collection-csv.ts). */
export function pullsCsv(setCode: string, lines: { num: string; qty: number; name: string }[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["name,set,number,quantity", ...lines.map((l) => `${esc(l.name)},${setCode},${l.num},${l.qty}`)].join("\n");
}

// ── The share link ─────────────────────────────────────────────────────────────
// The query above, base64url-encoded into one path segment
// (/tools/pull-tracker/<set>/s/<code>), so a shared result is an ordinary ISR
// page cached like any other rather than a per-request render.
const COUNTRIES: readonly Country[] = ["AU", "US", "UK", "SG", "CA", "EU"];

function toB64Url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string): string | null {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  } catch {
    return null;
  }
}

export function shareCode(lines: PullLine[], paidCents: number | null, country: Country): string {
  return toB64Url(shareQuery(lines, paidCents, country));
}

export function parseShareCode(code: string): { lines: PullLine[]; paidCents: number | null; country: Country } | null {
  if (!code || code.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  const raw = fromB64Url(code);
  if (raw == null) return null;
  const q = new URLSearchParams(raw);
  const lines = decodePulls(q.get("p"));
  if (!lines.length) return null;
  const m = q.get("m") as Country | null;
  return { lines, paidCents: parsePaid(q.get("paid")), country: m && COUNTRIES.includes(m) ? m : "US" };
}
