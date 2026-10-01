// The kind hubs (/pokemon/booster-boxes, /pokemon/elite-trainer-boxes,
// /pokemon/booster-bundles) and /pokemon/price-per-pack: their config, the
// rows each table shows, and the data sentences and FAQ written from them.
// Pure and client-safe; the pages only read the catalogue and render.
//
// WHY THESE PAGES EXIST: they own the head terms ("pokemon booster box
// prices", "pokemon etb price", "price per pack pokemon") that the hub's chips
// used to send to noindex `?type=` URLs. Each hub links every product of its
// kinds, which is what lets those product pages pass the stage-1 index gate
// (lib/pokemon/index-gate.ts) without being orphans.
//
// THE COPY RULES (tests/pokemon-copy.test.ts, tests/pokemon-home.test.ts):
//   - every number in a sentence comes from the data passed in; a sentence
//     whose fact is missing is left out, never written around a blank;
//   - the explainers are hand-written, hold no digits and name no set, and no
//     two share an 8-word run (the audit reads shared runs as templating);
//   - release dates are "TCGplayer lists {date}"; figures carry "as of {date}";
//   - "lowest price per pack", never a judgement about which box to buy.

import { formatMoney } from "../format";
import { COUNTRIES, type Country } from "../country";
import { formatDay, sourceWord } from "./format";
import { kindInfo, kindOrder, PK_KINDS, type PkKind } from "./kinds";
import { asOfLabel, formatPerPack, median, perPackRanking, RECENT_SETS, recentReleasedSets, typicalPackCount, type TypicalPackCount } from "./value";
import type { PkCatalog, PkTile } from "./types";

export type KindHubSlug = "booster-boxes" | "elite-trainer-boxes" | "booster-bundles";

export interface KindHub {
  slug: KindHubSlug;
  path: `/pokemon/${KindHubSlug}`;
  kinds: readonly PkKind[];
  /** ≤60, no brand; rendered absolute (lib/pokemon/seo.ts). */
  title: string;
  h1: string;
  /** ≤155, no "every", no "today". */
  description: string;
  /** The breadcrumb, quick-link and section label. */
  label: string;
  /** "booster box": the FAQ's noun. */
  noun: string;
  /** "booster boxes": the prose's plural. */
  plural: string;
  /** The SG / empty-table eBay searches. */
  ebayQuery: string;
  /** Hand-written: what the page shows and how per-pack works for this kind. No digits, no set names. */
  explainer: readonly string[];
}

export const KIND_HUBS: readonly KindHub[] = [
  {
    slug: "booster-boxes",
    path: "/pokemon/booster-boxes",
    kinds: ["booster-box"],
    title: "Pokémon Booster Box Prices, Set by Set",
    h1: "Pokémon Booster Box Prices",
    description:
      "Pokémon booster boxes from Sword & Shield on: the cheapest listing we track, packs per box and price per pack. Updated daily.",
    label: "Booster boxes",
    noun: "booster box",
    plural: "booster boxes",
    ebayQuery: "booster box",
    explainer: [
      "This page lists the English booster boxes we price, one row per product, newest set first. A row shows the date TCGplayer lists for the release, the cheapest open listing we hold for your market, how many booster packs the box contains and what that listing comes to per pack. TCGplayer's market price sits in a column of its own as a reference, not a price you can buy at, and outside the United States it is converted with an approximate exchange rate.",
      "Price per pack is plain arithmetic: the cheapest listing divided by the packs inside. The count comes from the box's published contents whenever TCGplayer has them. Without a contents list, a main-expansion box is counted from its name, because most English main-set displays hold the same standard number of packs. A half booster box holds half as many and has a row to itself, and it never stands in for the full box when another page names the cheapest box of a set.",
      "Enhanced booster boxes add promo cards and their pack count varies, so the name alone never counts one; special-set boxes are treated the same way. A box whose count we cannot read shows a dash in the Packs column and stays out of the per-pack figures instead of being guessed. Pre-order boxes keep their listing price and release date, but no pre-order is ranked, since nobody can open one yet.",
    ],
  },
  {
    slug: "elite-trainer-boxes",
    path: "/pokemon/elite-trainer-boxes",
    kinds: ["etb", "pc-etb"],
    title: "Pokémon Elite Trainer Box (ETB) Prices by Set",
    h1: "Pokémon Elite Trainer Box Prices",
    description:
      "Pokémon Elite Trainer Boxes and Pokémon Center ETBs from Sword & Shield on: the cheapest listing we track, packs and price per pack. Updated daily.",
    label: "Elite Trainer Boxes",
    noun: "Elite Trainer Box",
    plural: "Elite Trainer Boxes",
    ebayQuery: "Elite Trainer Box",
    explainer: [
      "Regular Elite Trainer Boxes and the Pokémon Center versions share this table, newest set first. For each product you get the release date as TCGplayer lists it, the lowest open listing in your market that we follow, the number of booster packs inside, and the price per pack at that listing. The TCGplayer market price column is there for reference rather than as an offer; in other markets it is a currency conversion and carries the ≈ mark.",
      "An Elite Trainer Box bundles booster packs with sleeves, energy cards, dice, condition markers and a storage box with dividers. The Pokémon Center Elite Trainer Box is the official store's own edition, usually with extra booster packs and a stamped promo card. That makes them two different products here: Pokémon Center rows wear a chip in the table, and a regular box is never matched to a Pokémon Center one, here or in an eBay search result we track.",
      "Both kinds are counted only from the contents list TCGplayer publishes for the product. The name never supplies an ETB's pack count, so a box without a published list shows a dash under Packs and is not part of the per-pack figures. Per pack divides the item price by the packs and nothing else: the sleeves, dice and promo card are not priced, and a lower figure says nothing about which box you would rather own. Pre-orders show a chip and the date TCGplayer lists, and wait until release before they are ranked.",
    ],
  },
  {
    slug: "booster-bundles",
    path: "/pokemon/booster-bundles",
    kinds: ["booster-bundle"],
    title: "Pokémon Booster Bundle Prices, Set by Set",
    h1: "Pokémon Booster Bundle Prices",
    description:
      "Pokémon booster bundles from Sword & Shield on: the cheapest listing we track, packs per bundle and price per pack. Updated daily.",
    label: "Booster bundles",
    noun: "booster bundle",
    plural: "booster bundles",
    ebayQuery: "booster bundle",
    explainer: [
      "Booster bundles are listed here newest set first, one product to a row. Each row carries the release date TCGplayer gives, the cheapest open listing we have found in your market, the packs in the bundle and the price per pack that listing works out to. TCGplayer's market price follows in a separate column: a published reference, never something on sale, and approximate wherever it has been converted from US dollars.",
      "A booster bundle is a small sealed pack of booster packs with no extras: no sleeves, no dice, no storage box. That makes it the one kind on these pages counted from its name when TCGplayer publishes no contents list, since a bundle is that shape by definition. When a contents list does exist, the list decides the count.",
      "With nothing but packs inside, a bundle's per-pack figure has no promo card or accessory folded into it, so it reads most directly against the price of a loose pack. It is still only the lowest open listing we follow, divided by the packs: item price, postage extra, and to be checked against the listing itself before you buy. Pre-order bundles show their price and the date TCGplayer lists, and join the ranking once they are released.",
    ],
  },
];

export function kindHub(slug: KindHubSlug): KindHub {
  return KIND_HUBS.find((h) => h.slug === slug) as KindHub;
}

/** The hub that lists a kind, or null (UPCs, tins and the rest browse on /pokemon/sealed). */
export function hubForKind(kind: PkKind | string): KindHub | null {
  return KIND_HUBS.find((h) => (h.kinds as readonly string[]).includes(kind)) ?? null;
}

/** Where a kind's own listing lives: its hub, else the filtered grid. */
export function kindHref(kind: PkKind): string {
  return hubForKind(kind)?.path ?? `/pokemon/sealed?type=${kind}`;
}

// ── Kind hub table ────────────────────────────────────────────────────────────

/**
 * Every product of the hub's kinds, ordered by its SET's release date (newest
 * first), then by name; products with no set go last. The product's own date
 * is not the key: a set's tins and blisters trail its boxes by weeks.
 */
export function hubTiles(catalog: Pick<PkCatalog, "tiles" | "sets">, hub: Pick<KindHub, "kinds">): PkTile[] {
  const kinds = new Set<string>(hub.kinds);
  const setDate = new Map(catalog.sets.map((s) => [s.slug, s.releasedOn ?? ""]));
  const key = (t: PkTile) => (t.setSlug ? (setDate.get(t.setSlug) ?? "") : null);
  return catalog.tiles
    .filter((t) => kinds.has(t.kind))
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null || kb === null) return ka === kb ? a.name.localeCompare(b.name) : ka === null ? 1 : -1;
      return kb.localeCompare(ka) || (a.setName ?? "").localeCompare(b.setName ?? "") || a.name.localeCompare(b.name);
    });
}

export interface HubTypical {
  kind: PkKind;
  label: string;
  typical: TypicalPackCount;
}

export interface HubFacts {
  market: Country;
  place: string;
  products: number;
  sets: number;
  setless: number;
  /** Released products with an open listing and a pack count. */
  ranked: number;
  lowest: PkTile | null;
  medianPerPack: number | null;
  noListing: number;
  /** Per kind (an ETB hub reports regular and Pokémon Center boxes apart). Ties are left out. */
  typical: HubTypical[];
  recentSets: number;
  asOf: string | null;
}

export function hubFacts(catalog: PkCatalog, hub: Pick<KindHub, "kinds">, today: string | Date): HubFacts {
  const tiles = hubTiles(catalog, hub);
  const ranked = perPackRanking(tiles, { kinds: hub.kinds });
  const recent = recentReleasedSets(catalog, today).map((s) => s.slug);
  const typical: HubTypical[] = [];
  for (const kind of hub.kinds) {
    const t = typicalPackCount(tiles, [kind], recent);
    if (t) typical.push({ kind, label: proseLabel(kindInfo(kind).plural), typical: t });
  }
  return {
    market: catalog.market,
    place: COUNTRIES[catalog.market].place,
    products: tiles.length,
    sets: new Set(tiles.map((t) => t.setSlug).filter(Boolean)).size,
    setless: tiles.filter((t) => !t.setSlug).length,
    ranked: ranked.length,
    lowest: ranked[0] ?? null,
    medianPerPack: median(ranked.map((t) => t.perPackCents)),
    noListing: tiles.filter((t) => t.lowCents == null).length,
    typical,
    recentSets: Math.min(RECENT_SETS, recent.length),
    asOf: asOfLabel(catalog.pricesAsOf),
  };
}

/**
 * A kind's plural for mid-sentence use: "Booster boxes" → "booster boxes",
 * "Tins" → "tins", while a name with capitals of its own ("Elite Trainer
 * Boxes", "Pokémon Center ETBs", "Build & Battle kits") keeps them.
 */
export const proseLabel = (p: string): string => (/[A-Z]/.test(p.slice(1)) ? p : p.charAt(0).toLowerCase() + p.slice(1));
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function fromWords(from: TypicalPackCount["from"]): string {
  if (from === "contents") return "counted from the published contents";
  if (from === "name") return "counted from the name";
  return "counted from the published contents or the name";
}

/** "all 5" / "4 of the 5". */
const ofCounted = (t: TypicalPackCount) => (t.matching === t.counted ? `all ${t.counted}` : `${t.matching} of the ${t.counted}`);

/** "Mega Evolution Booster Box (Mega Evolution)" without repeating a set the name already says. */
function nameWithSet(t: PkTile): string {
  return t.setName && !t.name.toLowerCase().includes(t.setName.toLowerCase()) ? `${t.name} (${t.setName})` : t.name;
}

/**
 * The hub's data paragraph, sentence by sentence. `currency` is the display
 * currency (a UK visitor may read euros). Each sentence appears only when its
 * fact exists.
 */
export function hubProse(f: HubFacts, hub: Pick<KindHub, "plural" | "noun">, currency: string): string[] {
  const out: string[] = [];
  if (f.products > 0) {
    const sets = f.sets > 0 ? ` from ${plural(f.sets, "set", "sets")}` : "";
    const setless = f.setless > 0 ? `, plus ${f.setless.toLocaleString("en-US")} with no set` : "";
    out.push(`We list ${plural(f.products, hub.noun, hub.plural)}${sets}${setless}.`);
  }
  if (f.lowest && f.lowest.perPackCents != null && f.lowest.lowCents != null) {
    const l = f.lowest;
    out.push(
      `The lowest price per pack among released ${hub.plural} with an open listing in ${f.place} is ${nameWithSet(l)}: ` +
        `${formatMoney(l.lowCents as number, currency)} ${sourceWord(l.lowSource)} for ${l.packCount} packs, ${formatPerPack(l.perPackCents as number, currency)}` +
        `${f.asOf ? `, ${f.asOf}` : ""}.`,
    );
  }
  if (f.medianPerPack != null && f.ranked >= 3) {
    out.push(
      `Across the ${f.ranked.toLocaleString("en-US")} with both an open listing and a known pack count, the median is ${formatPerPack(Math.round(f.medianPerPack), currency)}.`,
    );
  }
  if (f.noListing > 0 && f.products > 0) {
    out.push(
      f.noListing === f.products
        ? `None has a tracked listing in ${f.place}; each row still links to a search of your own eBay site.`
        : `${f.noListing.toLocaleString("en-US")} of the ${f.products.toLocaleString("en-US")} ${f.noListing === 1 ? "has" : "have"} no tracked listing in ${f.place}; ${f.noListing === 1 ? "its row still links" : "their rows still link"} to a search of your own eBay site.`,
    );
  }
  for (const t of f.typical) {
    out.push(
      `In the ${plural(f.recentSets, "most recent released set", "most recent released sets")}, the usual count for ${t.label} is ${t.typical.count} booster packs ` +
        `(${ofCounted(t.typical)} with a known count, ${fromWords(t.typical.from)}).`,
    );
  }
  return out;
}

/** The visible FAQ and its FAQPage JSON-LD, one array. Only questions the data answers. */
export function hubFaq(f: HubFacts, hub: Pick<KindHub, "noun" | "plural">, currency: string): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  if (f.typical.length) {
    const parts = f.typical.map(
      (t) =>
        `${capitalise(t.label)} from the ${plural(f.recentSets, "most recent released set", "most recent released sets")} most often hold ${t.typical.count} booster packs ` +
        `(${ofCounted(t.typical)} with a known count, ${fromWords(t.typical.from)}).`,
    );
    out.push({
      q: `How many packs are in a Pokémon ${hub.noun}?`,
      a: `${parts.join(" ")} Each row in the table shows its own count where we have one.`,
    });
  }
  if (f.lowest && f.lowest.perPackCents != null && f.lowest.lowCents != null) {
    const l = f.lowest;
    out.push({
      q: `Which ${hub.noun} has the lowest price per pack we track?`,
      a:
        `${nameWithSet(l)}, at ${formatPerPack(l.perPackCents as number, currency)}: its cheapest listing in ${f.place} is ` +
        `${formatMoney(l.lowCents as number, currency)} ${sourceWord(l.lowSource)} for ${l.packCount} packs${f.asOf ? `, ${f.asOf}` : ""}. ` +
        `That is the item price, postage extra, and only released products with an open listing are compared.`,
    });
  }
  return out;
}

// ── /pokemon/price-per-pack ───────────────────────────────────────────────────

export const PER_PACK_TOP = 20;
export const PER_PACK_SECTION = 25;
/** A kind needs this many ranked products for a section of its own. */
export const PER_PACK_MIN_SECTION = 3;

export interface PerPackSection {
  kind: PkKind;
  label: string;
  /** The kind's hub, where one exists. */
  hub: KindHub | null;
  tiles: PkTile[];
  /** Ranked products of this kind before the cut. */
  total: number;
}

export interface PerPackPage {
  top: PkTile[];
  sections: PerPackSection[];
  /** Released products with an open listing and a known pack count in this market. */
  coverage: number;
}

/** Overall top PER_PACK_TOP and one section per kind with enough ranked products, in the site's kind order. */
export function perPackPage(catalog: Pick<PkCatalog, "tiles">): PerPackPage {
  const ranked = perPackRanking(catalog.tiles);
  const sections: PerPackSection[] = PK_KINDS.map((k) => {
    const list = ranked.filter((t) => t.kind === k.id);
    return { kind: k.id, label: k.plural, hub: hubForKind(k.id), tiles: list.slice(0, PER_PACK_SECTION), total: list.length };
  })
    .filter((s) => s.total >= PER_PACK_MIN_SECTION)
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
  return { top: ranked.slice(0, PER_PACK_TOP), sections, coverage: ranked.length };
}

/** Hand-written method text for /pokemon/price-per-pack. No digits, no set names. */
export const PER_PACK_METHOD: readonly string[] = [
  "A price per pack is the cheapest open listing we track for a product in your market, divided by the booster packs it holds. Nothing else goes into it: no postage, no promo cards, no sleeves or dice, and no guess about what an accessory might fetch on its own. TCGplayer's market price is a reference and never enters the ranking, because it is not a price anyone is offering.",
  "Pack counts come from the contents list TCGplayer publishes for each product. Only a few shapes are counted from the name when that list is missing: a single booster pack, a blister whose name states its packs, a booster bundle, and a main-expansion booster box or half box. A product holding packs that are not standard boosters, such as small packs of a few cards, gets no count at all, since dividing by them would compare unlike things.",
  "Pre-orders are left out until release, and so is anything without an open listing in your market, which is why a product can appear on its set page but not here. The ranking is a sort, not a recommendation: two products at the same figure per pack can differ widely in what else comes in the box, so open the product before you decide.",
];

/** "Released 16 Sep 2026" / "Pre-order" detail for a row, or null. */
export function releaseLine(t: Pick<PkTile, "releasedOn">): string | null {
  const d = formatDay(t.releasedOn);
  return d ? `TCGplayer lists ${d}` : null;
}
