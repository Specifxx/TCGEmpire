// Shared figures derived from one market's catalogue: price per pack rankings,
// the cheapest product of each kind, the recent-set window, typical pack counts.
// Pure and client-safe. Every Pokémon surface that ranks, compares or quotes
// these (the homepage, kind hubs, price-per-pack, product and set pages, blog
// blocks, share cards, copy buttons) imports them from here, so two pages
// can never disagree about which set is "recent" or which box is cheapest.
//
// Wording these feed: "lowest price per pack", never "best value" or "deal"
// (tests/pokemon-copy.test.ts). A per-pack figure is the cheapest open listing
// divided by the packs inside (lib/pokemon/packs.ts), nothing more.

import { formatMoney } from "../format";
import { SITE_URL } from "../site";
import { formatDay } from "./format";
import { foldName, type PkKind } from "./kinds";
import type { PkCatalog, PkSetSummary, PkTile } from "./types";

/** The kinds a per-pack comparison is about: each has a kind hub or a place on price-per-pack. */
export const PER_PACK_KINDS: readonly PkKind[] = ["booster-box", "etb", "pc-etb", "booster-bundle"];

/** How many released sets count as "recent" everywhere a recent-set window appears. */
export const RECENT_SETS = 6;

/** An 18-pack half booster box. It never stands for "the booster box" of a set. */
export function isHalfBox(t: { kind: PkKind | string; name: string }): boolean {
  return t.kind === "booster-box" && /\bhalf\b/.test(foldName(t.name));
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Released products with an open listing and a known pack count, lowest price
 * per pack first (ties by name). Pre-orders are left out: a pre-order price is
 * not something a buyer can open today. `kinds` narrows it; omitted, every kind
 * with a count takes part.
 */
export function perPackRanking(tiles: readonly PkTile[], opts: { kinds?: readonly PkKind[]; limit?: number } = {}): PkTile[] {
  const kinds = opts.kinds ? new Set<string>(opts.kinds) : null;
  const ranked = tiles
    .filter((t) => !t.presale && t.lowCents != null && t.perPackCents != null && (!kinds || kinds.has(t.kind)))
    .sort((a, b) => (a.perPackCents as number) - (b.perPackCents as number) || byName(a, b));
  return opts.limit != null ? ranked.slice(0, Math.max(0, opts.limit)) : ranked;
}

/**
 * The cheapest product of each kind by its cheapest open listing (ties by
 * name). Half boxes never stand for a booster box. Pre-orders count only when
 * `includePresale` is set, and are then still marked by their own `presale`.
 */
export function cheapestByKind(tiles: readonly PkTile[], opts: { includePresale?: boolean } = {}): Partial<Record<PkKind, PkTile>> {
  const out: Partial<Record<PkKind, PkTile>> = {};
  for (const t of tiles) {
    if (t.lowCents == null) continue;
    if (t.presale && !opts.includePresale) continue;
    if (isHalfBox(t)) continue;
    const cur = out[t.kind];
    if (!cur || t.lowCents < (cur.lowCents as number) || (t.lowCents === cur.lowCents && byName(t, cur) < 0)) out[t.kind] = t;
  }
  return out;
}

const dayOf = (d: string | Date): string => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/**
 * The `n` newest sets whose release date (as TCGplayer lists it) is on or
 * before `today`, newest first. A set with no listed date is never "recent".
 */
export function recentReleasedSets(catalog: Pick<PkCatalog, "sets">, today: string | Date, n: number = RECENT_SETS): PkSetSummary[] {
  const t = dayOf(today);
  return catalog.sets
    .filter((s) => s.releasedOn != null && s.releasedOn <= t)
    .sort((a, b) => (b.releasedOn as string).localeCompare(a.releasedOn as string) || byName(a, b))
    .slice(0, Math.max(0, n));
}

export interface TypicalPackCount {
  /** The most common pack count. */
  count: number;
  /** Where the products holding that count got it; "both" when they differ. */
  from: "contents" | "name" | "both";
  /** Products holding the typical count. */
  matching: number;
  /** Products of these kinds and sets with any known count. */
  counted: number;
}

/**
 * The most common pack count among products of `kinds` in `setSlugs` (all sets
 * when null). Half boxes are left out, as everywhere: a set's half box would
 * otherwise tie its full box. A tie between two counts has no typical value:
 * null, and the sentence that would quote it is left out.
 */
export function typicalPackCount(
  tiles: readonly PkTile[],
  kinds: readonly PkKind[],
  setSlugs: readonly string[] | null,
): TypicalPackCount | null {
  const kindSet = new Set<string>(kinds);
  const setSet = setSlugs ? new Set(setSlugs) : null;
  const pool = tiles.filter(
    (t) =>
      kindSet.has(t.kind) && t.packCount != null && !isHalfBox(t) && (!setSet || (t.setSlug != null && setSet.has(t.setSlug))),
  );
  if (!pool.length) return null;
  const freq = new Map<number, PkTile[]>();
  for (const t of pool) freq.set(t.packCount as number, [...(freq.get(t.packCount as number) ?? []), t]);
  const ranked = [...freq.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  if (ranked.length > 1 && ranked[0][1].length === ranked[1][1].length) return null;
  const [count, holders] = ranked[0];
  const froms = new Set(holders.map((t) => t.packCountFrom ?? "contents"));
  return { count, from: froms.size > 1 ? "both" : ([...froms][0] as "contents" | "name"), matching: holders.length, counted: pool.length };
}

/** The median of the finite values, null when there are none. Not rounded. */
export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * "as of 1 Oct 2026" from the catalogue's pricesAsOf, null when unknown. Every
 * figure that could be a day or more old says so: the import can stall, so
 * Pokémon copy never says "today".
 */
export function asOfLabel(pricesAsOf: string | null | undefined): string | null {
  const d = formatDay(pricesAsOf ? pricesAsOf.slice(0, 10) : null);
  return d ? `as of ${d}` : null;
}

/**
 * The moment to quote for a set of figures shown together: the OLDEST listing
 * among them, so every listing quoted is at least that fresh (eBay rows are
 * checked in rotation, days apart, while TCGplayer's are rewritten daily, and
 * dating an eBay figure by TCGplayer's import would make it look newer than it
 * is). With no listing, the newest reference. ISO in, ISO out.
 */
export function figuresAsOf(listingChecks: readonly string[], referenceChecks: readonly string[] = []): string | null {
  if (listingChecks.length) return listingChecks.reduce((a, b) => (b < a ? b : a));
  if (referenceChecks.length) return referenceChecks.reduce((a, b) => (b > a ? b : a));
  return null;
}

/** "US$4.10 a pack". */
export function formatPerPack(cents: number, currency: string): string {
  return `${formatMoney(cents, currency)} a pack`;
}

/**
 * An absolute link to one of our pages, tagged for analytics' entry buckets
 * (`utm_source`, `utm_medium`, `utm_campaign`). The query goes before any
 * #anchor. Campaigns are always `pkmn-…` so Pokémon arrivals are separable.
 */
export function pokemonUtm(
  path: string,
  utm: { source: string; medium: string; campaign: `pkmn-${string}` },
): string {
  const abs = /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const hashAt = abs.indexOf("#");
  const base = hashAt >= 0 ? abs.slice(0, hashAt) : abs;
  const hash = hashAt >= 0 ? abs.slice(hashAt) : "";
  const q = new URLSearchParams({ utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign }).toString();
  return `${base}${base.includes("?") ? "&" : "?"}${q}${hash}`;
}
