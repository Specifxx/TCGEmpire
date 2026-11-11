// Fetch TCG's price of a card in Australia (owner, 2026-11-11; Fetch's partner feed). Read by the card page; the
// answer is a labelled marketplace row, drawn after eBay's and never a store: not counted, never the cheapest, a
// deal, an alert, history or a basket line.
//
// Fetch's terms (Dhanish Semar, 2026-10-28): the feed is for showing Fetch's prices with a link back, and may not be
// passed on. So the 95 MB feed is NEVER committed (data/ is public with the source): scripts/fetch-fetchtcg.ts runs
// first in every build, keeps only this game's cards and writes data/fetch-live/au.json, git-ignored, which this file
// reads. Links are used exactly as Fetch sends them (they already carry our referral tag).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface FetchLiveCard {
  /** set name as Fetch writes it */
  s: string;
  /** collector number, "001/298" */
  no: string;
  /** card name */
  n: string;
  /** "Normal" | "Foil" */
  f: string;
  /** condition the price is for (Near Mint, else the best raw condition) */
  c: string;
  /** AUD cents */
  p: number;
  /** Fetch's own page, tracked, used as sent */
  u: string;
}
export interface FetchLiveFile {
  fetchedAt: string;
  cards: FetchLiveCard[];
}
export interface FetchRow {
  finish: "Normal" | "Foil";
  condition: string;
  priceCents: number;
  url: string;
}
export interface FetchRows {
  rows: FetchRow[];
  /** ISO time the build fetched the feed */
  at: string;
}

export const FETCH_LIVE_FILE = path.join("data", "fetch-live", "au.json");
/** Fetch's prices are shown for a day and a half at most (the page copy is kept a day plus a day by the CDN). */
export const FETCH_MAX_AGE_MS = 3 * 86400e3;

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
/** Fetch writes some sets' numbers "001:221"; the card says "001/221". */
const num = (s: string) => s.toLowerCase().replace(/:/g, "/").replace(/\s+/g, "");
/** Fetch adds the printing in brackets ("Ahri - Alluring (Alternate Art)"); the number already says which printing. */
const nameOf = (s: string) => norm(s.replace(/\s*\([^)]*\)/g, ""));

let cache: { index: Map<string, FetchLiveCard[]>; at: string } | null | undefined;

function load(): typeof cache {
  if (cache !== undefined) return cache;
  cache = null;
  try {
    const file = path.join(process.cwd(), FETCH_LIVE_FILE);
    if (!existsSync(file)) return cache;
    const f = JSON.parse(readFileSync(file, "utf8")) as FetchLiveFile;
    if (!f || !Array.isArray(f.cards) || typeof f.fetchedAt !== "string") return cache;
    if (Date.now() - Date.parse(f.fetchedAt) > FETCH_MAX_AGE_MS) return cache;
    const index = new Map<string, FetchLiveCard[]>();
    for (const c of f.cards) {
      const k = `${norm(c.s)}|${num(c.no)}`;
      const a = index.get(k);
      if (a) a.push(c);
      else index.set(k, [c]);
    }
    cache = { index, at: f.fetchedAt };
  } catch {
    cache = null;
  }
  return cache;
}

/**
 * Fetch's listings of exactly this printing: the same set, the same collector number AND the same name. Anything
 * ambiguous (two Fetch cards on one key with different names) is no match: a wrong price is worse than none.
 */
export function fetchRowsFor(card: { name: string; setName: string; collectorNumber: string; isPromo?: boolean }): FetchRows | null {
  const l = load();
  // A promo printing shares its base card's number; Fetch lists promos in their own sets, so it gets no row.
  if (!l || card.isPromo) return null;
  const hits = l.index.get(`${norm(card.setName)}|${num(card.collectorNumber)}`);
  if (!hits) return null;
  const want = nameOf(card.name);
  const named = hits.filter((h) => nameOf(h.n) === want);
  if (!named.length) return null;
  const rows: FetchRow[] = [];
  for (const finish of ["Normal", "Foil"] as const) {
    const h = named.filter((x) => x.f === finish).sort((a, b) => a.p - b.p)[0];
    if (h && h.p > 0) rows.push({ finish, condition: h.c, priceCents: h.p, url: h.u });
  }
  return rows.length ? { rows, at: l.at } : null;
}

const GRADED = /^(psa|cgc|becketts|tag|pcg)\b/i;

/** Cents from Fetch's AUD price (a number in dollars). */
export const cents = (dollars: number) => Math.round(dollars * 100);

/** Near Mint if listed, else the cheapest raw (not graded, not Damaged) condition. */
export function pickCondition(conds: { condition: string; price: number }[]): { condition: string; price: number } | null {
  const raw = conds.filter((c) => c && typeof c.price === "number" && c.price > 0 && !GRADED.test(c.condition) && !/damaged/i.test(c.condition));
  const nm = raw.filter((c) => /^(near mint|mint)$/i.test(c.condition)).sort((a, b) => a.price - b.price)[0];
  return nm ?? raw.sort((a, b) => a.price - b.price)[0] ?? null;
}

