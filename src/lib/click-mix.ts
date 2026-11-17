import { prisma } from "./db";
import { clickGroup, sydneyDay, type ClickGroup } from "./click-counter";

// The click mix (2026-11-17, "Click mix by market" in DECISIONS.md). The daily
// counts in click-counter.ts say how many outbound clicks a network got, not
// WHAT KIND of click it was. The growth report's revenue-per-visitor question
// ("do AU visitors click paid rows less than US or EU visitors?") needs the
// market, whether the link pays, where in the list it sat and how far above the
// cheapest item price it was.
//
// Private data, and no new egress: still ONE Counter upsert per click and no
// read on the request path, never a ClickEvent row per click (those were
// switched off for Neon transfer, 2026-10-27). The dimensions are closed sets
// and buckets, so a forged beacon can only mint rows from a small fixed grid
// (7 markets x 4 networks x 2 x 16 pages x 5 positions x 5 gaps, in practice a
// few hundred a day), and nothing is ever taken from the request verbatim.
// Counts are a trend line, never a payout; the networks' own reports are.
//
// Position and gap are by ITEM price: no site-wide postage data ranks a row by
// landed cost, and rows are never re-sorted (owner rules). "gap" is the percent
// the clicked row's item price sits above the cheapest in-stock row of the same
// list, when the call site knows it.

export const CLICK_MIX_PREFIX = "clickmix:";
export const MIX_COUNTRIES = ["AU", "NZ", "US", "UK", "SG", "CA", "EU"] as const;
export const MIX_PAGES = ["card_detail", "quickview", "sealed", "sealed_page", "homepage", "deals", "price_guide", "article", "preorders", "set_hub", "search", "browse", "deck", "movers", "pokemon", "other"] as const;
export const MIX_POSITIONS = ["1", "2", "3", "4+", "na"] as const;
export const MIX_GAPS = ["na", "0", "1-8", "9-20", "21+"] as const;

export interface ClickMixInput {
  retailer: string;
  country?: string | null;
  /** "1" when the link itself is monetised (isPaidLink on the client). */
  paid?: string | null;
  page?: string | null;
  position?: string | null;
  /** Percent above the cheapest in-stock item price in the same list. */
  gap?: string | null;
}

export interface ClickMixDims {
  country: string;
  group: ClickGroup;
  paid: boolean;
  page: string;
  pos: string;
  gap: string;
}

const pick = (set: readonly string[], v: string | null | undefined, fallback: string): string => (set.includes(v ?? "") ? (v as string) : fallback);

export function positionBucket(v: string | null | undefined): string {
  const n = Number(v);
  if (!v || !Number.isInteger(n) || n < 1) return "na";
  return n >= 4 ? "4+" : String(n);
}

export function gapBucket(v: string | null | undefined): string {
  if (v == null || v === "") return "na";
  const n = Number(v);
  if (!Number.isFinite(n)) return "na";
  if (n <= 0) return "0";
  if (n <= 8) return "1-8";
  if (n <= 20) return "9-20";
  return "21+";
}

/** Closed-set dimensions for one click; null when the retailer is not a usable key. */
export function clickMixDims(i: ClickMixInput): ClickMixDims | null {
  const group = clickGroup(i.retailer);
  if (!group) return null;
  return {
    country: pick(MIX_COUNTRIES, (i.country ?? "").toUpperCase(), "other"),
    group,
    // eBay and TCGplayer links always carry the network's tag; a store link pays
    // only when the page said so.
    paid: group !== "store" || i.paid === "1",
    page: pick(MIX_PAGES, (i.page ?? "").startsWith("pokemon_") ? "pokemon" : i.page, "other"),
    pos: positionBucket(i.position),
    gap: gapBucket(i.gap),
  };
}

export const clickMixKey = (day: string, d: ClickMixDims) =>
  `${CLICK_MIX_PREFIX}${day}:${d.country}:${d.group}:${d.paid ? "p" : "u"}:${d.page}:${d.pos}:${d.gap}`;

export async function countClickMix(i: ClickMixInput, now = Date.now()): Promise<void> {
  const d = clickMixDims(i);
  if (!d || d.group === "checkout") return;
  const key = clickMixKey(sydneyDay(now), d);
  await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
}

export interface MixRow extends ClickMixDims {
  day: string;
  n: number;
}

export function parseMixKey(key: string, value: number): MixRow | null {
  if (!key.startsWith(CLICK_MIX_PREFIX)) return null;
  const [day, country, group, paid, page, pos, gap] = key.slice(CLICK_MIX_PREFIX.length).split(":");
  if (!day || !country || !group || !paid || !page || !pos || !gap) return null;
  return { day, country, group: group as ClickGroup, paid: paid === "p", page, pos, gap, n: value };
}

/** Rows from `sinceDay` on. Bounded: closed-set keys, tiny rows, admin only. */
export async function readClickMix(sinceDay: string): Promise<MixRow[]> {
  const rows = await prisma.counter.findMany({
    where: { key: { gte: `${CLICK_MIX_PREFIX}${sinceDay}`, lt: `${CLICK_MIX_PREFIX}9` } },
    select: { key: true, value: true },
    take: 5000,
  });
  return rows.map((r) => parseMixKey(r.key, r.value)).filter((r): r is MixRow => r != null);
}

export interface CountryMix {
  country: string;
  clicks: number;
  paid: number;
  /** paid / clicks, 0 to 1; null with no clicks. */
  paidShare: number | null;
  ebay: number;
  tcgplayer: number;
  paidStore: number;
  unpaidStore: number;
  /** Paid clicks on a row 1 to 8% above the list's cheapest item price. */
  paidWithin8: number;
  /** Share of clicks on the first row of the list, by item price. */
  firstRowShare: number | null;
}

/** Per-market summary, biggest first. Pure, so it is tested without a database. */
export function summariseMix(rows: MixRow[]): CountryMix[] {
  const by = new Map<string, CountryMix & { first: number; known: number }>();
  for (const r of rows) {
    if (r.group === "checkout") continue;
    const m =
      by.get(r.country) ??
      { country: r.country, clicks: 0, paid: 0, paidShare: null, ebay: 0, tcgplayer: 0, paidStore: 0, unpaidStore: 0, paidWithin8: 0, firstRowShare: null, first: 0, known: 0 };
    m.clicks += r.n;
    if (r.paid) m.paid += r.n;
    if (r.group === "ebay") m.ebay += r.n;
    else if (r.group === "tcgplayer") m.tcgplayer += r.n;
    else if (r.paid) m.paidStore += r.n;
    else m.unpaidStore += r.n;
    if (r.paid && r.gap === "1-8") m.paidWithin8 += r.n;
    if (r.pos !== "na") {
      m.known += r.n;
      if (r.pos === "1") m.first += r.n;
    }
    by.set(r.country, m);
  }
  return [...by.values()]
    .map(({ first, known, ...m }) => ({
      ...m,
      paidShare: m.clicks ? m.paid / m.clicks : null,
      firstRowShare: known ? first / known : null,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}
