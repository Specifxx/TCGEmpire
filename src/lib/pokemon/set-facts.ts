// A set page's own facts and the paragraphs written from them. Pure: one
// market's catalogue (the page's getPokemonCatalog read, already in the
// visitor's display currency) and the day; no reads, no clock.
//
// WHY: the set pages are already indexed, and their old copy repeated each
// kind's `about` line verbatim on all of them. What makes forty-odd set pages
// forty-odd pages is what only that set has: its product mix, which of its
// kinds is lowest per pack, how its booster box compares with the sets either
// side, and whether its pre-orders are open. Each paragraph appears only when
// its fact exists, so a small set gets a short page rather than a padded one.
//
// Release dates are always what TCGplayer lists (tests/pokemon-copy.test.ts).

import { COUNTRIES } from "../country";
import { formatDay, kindNoun, listJoin, possessive } from "./format";
import { PK_KINDS, kindInfo, type PkKind } from "./kinds";
import { PER_PACK_KINDS, asOfLabel, cheapestByKind, formatPerPack } from "./value";
import type { PkCatalog, PkSetSummary, PkTile } from "./types";

export interface SetKindCheapest {
  kind: PkKind;
  slug: string;
  name: string;
  cents: number;
  perPackCents: number | null;
}

export interface SetNeighbour {
  slug: string;
  name: string;
  boxPerPackCents: number;
}

export interface SetFacts {
  slug: string;
  name: string;
  series: string;
  code: string | null;
  releasedOn: string | null;
  /** TCGplayer lists the set for a day after `today`. */
  upcoming: boolean;
  productCount: number;
  market: PkCatalog["market"];
  currency: string;
  place: string;
  asOf: string | null;
  /** Products per kind, in the taxonomy's display order. */
  mix: { kind: PkKind; count: number }[];
  /** Each per-pack kind's cheapest product by listing: released ones, or the pre-orders of a set not out yet. */
  cheapest: SetKindCheapest[];
  /**
   * The set has a box, ETB or bundle with a known pack count. A durable fact,
   * unlike a per-pack figure (which needs a listing in the visitor's market),
   * so the title that promises "Price per Pack" is the same in every market.
   */
  countable: boolean;
  /** Pre-order products and the dates TCGplayer lists for them, earliest first. */
  preorders: { count: number; first: string | null; last: string | null };
  /** The booster box per pack here and in the nearest sets either side that have one. */
  boxes: { here: number; earlier: SetNeighbour | null; later: SetNeighbour | null } | null;
  /** The sets either side by TCGplayer's listed date, for the page's own navigation. */
  nav: { older: PkSetSummary | null; newer: PkSetSummary | null };
}

/** A paragraph as text runs and links, so a sentence can link the sets it names. */
export type ProsePart = string | { text: string; href: string };
export interface SetProseBlock {
  id: "mix" | "per-pack" | "neighbours" | "preorders";
  parts: ProsePart[];
}

export const proseText = (parts: readonly ProsePart[]): string => parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

const dayOf = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function boxPerPack(tiles: readonly PkTile[]): number | null {
  return cheapestByKind(tiles)["booster-box"]?.perPackCents ?? null;
}

export function setFacts(catalog: PkCatalog, slug: string, today: string | Date): SetFacts | null {
  const idx = catalog.sets.findIndex((s) => s.slug === slug);
  if (idx < 0) return null;
  const set = catalog.sets[idx];
  const t = dayOf(today);
  const bySet = new Map<string, PkTile[]>();
  for (const tile of catalog.tiles) if (tile.setSlug) bySet.set(tile.setSlug, [...(bySet.get(tile.setSlug) ?? []), tile]);
  const tiles = bySet.get(slug) ?? [];

  const counts = new Map<PkKind, number>();
  for (const tile of tiles) counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
  const mix = PK_KINDS.filter((k) => counts.has(k.id)).map((k) => ({ kind: k.id, count: counts.get(k.id) as number }));

  const released = tiles.filter((x) => !x.presale);
  const pool = released.length ? released : tiles;
  const cheap = cheapestByKind(pool, { includePresale: !released.length });
  const cheapest: SetKindCheapest[] = PER_PACK_KINDS.flatMap((k) => {
    const c = cheap[k];
    return c && c.lowCents != null ? [{ kind: k, slug: c.slug, name: c.name, cents: c.lowCents, perPackCents: c.perPackCents }] : [];
  });

  const pre = tiles.filter((x) => x.presale);
  const preDays = pre.map((x) => x.releasedOn).filter((d): d is string => Boolean(d)).sort();

  // Neighbours by TCGplayer's listed date: the nearest earlier and later sets
  // whose booster box has a released, listed, counted figure. A special set
  // with no box (a collection-only release) is skipped rather than compared.
  let boxes: SetFacts["boxes"] = null;
  const here = boxPerPack(released);
  if (here != null && set.releasedOn) {
    const dated = catalog.sets.filter((s) => s.releasedOn && s.slug !== slug);
    const withBox = (s: PkSetSummary): SetNeighbour | null => {
      const v = boxPerPack((bySet.get(s.slug) ?? []).filter((x) => !x.presale));
      return v != null ? { slug: s.slug, name: s.name, boxPerPackCents: v } : null;
    };
    const earlierSets = dated.filter((s) => (s.releasedOn as string) < (set.releasedOn as string)).sort((a, b) => (b.releasedOn as string).localeCompare(a.releasedOn as string));
    const laterSets = dated.filter((s) => (s.releasedOn as string) > (set.releasedOn as string)).sort((a, b) => (a.releasedOn as string).localeCompare(b.releasedOn as string));
    const earlier = earlierSets.map(withBox).find(Boolean) ?? null;
    const later = laterSets.map(withBox).find(Boolean) ?? null;
    if (earlier || later) boxes = { here, earlier, later };
  }

  return {
    slug: set.slug,
    name: set.name,
    series: set.series,
    code: set.code,
    releasedOn: set.releasedOn,
    upcoming: set.releasedOn != null && set.releasedOn > t,
    productCount: set.productCount,
    market: catalog.market,
    currency: catalog.currency,
    place: COUNTRIES[catalog.market].place,
    asOf: asOfLabel(catalog.pricesAsOf),
    mix,
    cheapest,
    countable: tiles.some((x) => (PER_PACK_KINDS as readonly string[]).includes(x.kind) && x.packCount != null),
    preorders: { count: pre.length, first: preDays[0] ?? null, last: preDays[preDays.length - 1] ?? null },
    boxes,
    // catalog.sets is newest first.
    nav: { newer: catalog.sets[idx - 1] ?? null, older: catalog.sets[idx + 1] ?? null },
  };
}

export function setProse(f: SetFacts): SetProseBlock[] {
  const out: SetProseBlock[] = [];
  const href = (slug: string) => `/pokemon/sets/${slug}`;

  if (f.mix.length) {
    const items = f.mix.map((m) => `${m.count} ${kindNoun(kindInfo(m.kind), m.count)}`);
    out.push({
      id: "mix",
      parts: [`We price ${f.productCount} sealed ${f.productCount === 1 ? "product" : "products"} from ${f.name}: ${listJoin(items)}.`],
    });
  }

  const counted = f.cheapest.filter((c): c is SetKindCheapest & { perPackCents: number } => c.perPackCents != null).sort((a, b) => a.perPackCents - b.perPackCents);
  const listingWord = f.upcoming ? "pre-order listing" : "listing";
  if (counted.length === 1) {
    const [c] = counted;
    out.push({
      id: "per-pack",
      parts: [
        `Only the ${kindNoun(kindInfo(c.kind))} has both a known pack count and a ${listingWord} we track in ${f.place}: `,
        { text: c.name, href: `/pokemon/sealed/${c.slug}` },
        ` comes to ${formatPerPack(c.perPackCents, f.currency)}${f.asOf ? `, ${f.asOf}` : ""}.`,
      ],
    });
  } else if (counted.length > 1) {
    const [low, ...rest] = counted;
    const gap = rest[rest.length - 1].perPackCents - low.perPackCents;
    out.push({
      id: "per-pack",
      parts: [
        `At the cheapest ${listingWord} we track in ${f.place}${f.asOf ? ` ${f.asOf}` : ""}, the lowest price per pack in ${f.name} is the ${kindNoun(kindInfo(low.kind))}: `,
        { text: low.name, href: `/pokemon/sealed/${low.slug}` },
        ` at ${formatPerPack(low.perPackCents, f.currency)}, against ${listJoin(rest.map((r) => `${formatPerPack(r.perPackCents, f.currency)} for the ${kindNoun(kindInfo(r.kind))}`))}` +
          (gap > 0 && rest.length > 1 ? `. The gap between the lowest and the highest is ${formatPerPack(gap, f.currency)}.` : "."),
      ],
    });
  }

  if (f.boxes) {
    const { here, earlier, later } = f.boxes;
    const parts: ProsePart[] = [`${possessive(f.name)} booster box comes to ${formatPerPack(here, f.currency)} at its cheapest listing in ${f.place}. `];
    if (earlier) {
      parts.push(`The nearest earlier set with one, `, { text: earlier.name, href: href(earlier.slug) }, `, is at ${formatPerPack(earlier.boxPerPackCents, f.currency)}`);
      parts.push(later ? "; the nearest later, " : ".");
    } else if (later) {
      parts.push("The nearest later set with one, ");
    }
    if (later) parts.push({ text: later.name, href: href(later.slug) }, `, is at ${formatPerPack(later.boxPerPackCents, f.currency)}.`);
    out.push({ id: "neighbours", parts });
  }

  if (f.preorders.count) {
    const day = formatDay(f.upcoming ? f.releasedOn : f.preorders.first);
    const last = formatDay(f.preorders.last);
    out.push({
      id: "preorders",
      parts: [
        f.upcoming
          ? `Pre-orders open${day ? `; TCGplayer lists ${day} for the set` : ""}. Pre-order prices are listings for stock that has not shipped yet.`
          : `${f.preorders.count} of its products ${f.preorders.count === 1 ? "is a pre-order" : "are pre-orders"}` +
            (day ? (last && last !== day ? `; TCGplayer lists them from ${day} to ${last}` : `; TCGplayer lists ${day}`) : "") +
            ".",
      ],
    });
  }
  return out;
}
