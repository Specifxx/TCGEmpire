// The Pokémon blog's computed blocks: every number a post shows comes from
// here, read off the US catalogue when the page renders, so no figure is ever
// typed into a post. A post body places a block with a line that is exactly
// [[pk:<id>]]; each block returns its markdown and the facts the post's
// {{fact}} tokens may quote (render.ts fills them).
//
// Pure: (ctx) → { markdown, facts }, no I/O. Every figure goes through the
// shared helpers in lib/pokemon/value.ts, so a post can never disagree with
// the hub, kind hubs, set or product pages about which box is cheapest or
// which sets are recent. Wording follows the section's copy rules
// (tests/pokemon-copy.test.ts): listings, never sales; "lowest price per
// pack", never value; "as of {date}", never "today"; release order is the
// order TCGplayer lists.
//
// A block must render against an empty catalogue too (no import yet): it then
// says so in words and sets no facts, and every token that needed one drops
// its line.

import { COUNTRIES, COUNTRY_LIST, type Country } from "../../country";
import { formatMoney } from "../../format";
import { OFFER_STALE_H } from "../../sealed-offers";
import { SCOPE_START, seriesForDate } from "../catalog";
// By alias: "../ebay" from this folder is the Pokémon module, but the
// isolation test reads that spelling as Riftbound's lib/ebay (the importer on
// refresh-prices.yml's push paths), which no Pokémon file may load.
import { POKEMON_EBAY_MARKETS } from "@/lib/pokemon/ebay";
import { formatDay } from "../format";
import { PK_KINDS, type PkKind } from "../kinds";
import type { PkCatalog, PkSetSummary, PkSource, PkTile } from "../types";
import {
  PER_PACK_KINDS,
  asOfLabel,
  cheapestByKind,
  formatPerPack,
  isHalfBox,
  median,
  recentReleasedSets,
  typicalPackCount,
} from "../value";

export interface BlockCtx {
  /** The US catalogue: posts are ISR and read no cookie, so their tables are US prices. */
  catalog: PkCatalog;
  /** ISO day the page renders, for the recent-set window. */
  today: string;
}

export interface BlockOut {
  markdown: string;
  facts: Record<string, string>;
}

export const BLOCK_IDS = ["per-pack-by-set", "pack-counts", "etb-vs-pc-etb", "coverage", "method-constants"] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

export function isBlockId(id: string): id is BlockId {
  return (BLOCK_IDS as readonly string[]).includes(id);
}

// ── Shared wording ────────────────────────────────────────────────────────────

/** Column and sentence names for the four per-pack kinds. */
const KIND_NAME: Record<string, { col: string; one: string }> = {
  "booster-box": { col: "Booster box", one: "the booster box" },
  etb: { col: "ETB", one: "the Elite Trainer Box" },
  "pc-etb": { col: "PC ETB", one: "the Pokémon Center ETB" },
  "booster-bundle": { col: "Bundle", one: "the booster bundle" },
};

/** "a booster box", "an Elite Trainer Box". */
function aKind(k: string): string {
  const bare = KIND_NAME[k].one.replace(/^the /, "");
  return `${/^[AEIOU]/i.test(bare) ? "an" : "a"} ${bare}`;
}

/** "Of the 4 recent sets" / "In the one recent set". */
function ofRecentSets(n: number): string {
  return n === 1 ? "In the one recent set" : `Of the ${n} recent sets`;
}

/** "all 4" / "it", for a count that covers every compared set. */
function allOf(n: number): string {
  return n === 1 ? "it" : `all ${n}`;
}

/** Text safe inside a markdown table cell or link label. */
function cell(s: string): string {
  return s.replace(/\|/g, "/").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\*/g, "\\*").replace(/`/g, "'");
}

/** "a, b and c". */
function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "1,020": a count as a reader expects it. */
const num = (n: number) => n.toLocaleString("en-US");

function money(cents: number, catalog: PkCatalog): string {
  return formatMoney(cents, catalog.currency);
}

/** The caption under every price table: what the figures are, where and when. */
function usCaption(catalog: PkCatalog, extra = ""): string {
  const asOf = asOfLabel(catalog.pricesAsOf);
  const place = COUNTRIES[catalog.market].place;
  return `*${catalog.market} prices${asOf ? ` ${asOf}` : ""}: the cheapest open listing we track in ${place}, item price, postage extra.${extra}*`;
}

function setLink(s: { slug: string; name: string }): string {
  return `[${cell(s.name)}](/pokemon/sets/${s.slug})`;
}

/** The variant TCGplayer puts in brackets ("[Mega Lucario]"), for naming which ETB was cheapest. */
function variantOf(name: string): string | null {
  const m = /\[([^\]]+)\]/.exec(name);
  return m ? m[1].trim() : null;
}

const tilesOfSet = (catalog: PkCatalog, slug: string) => catalog.tiles.filter((t) => t.setSlug === slug);

/** The pack count shared by every product of a kind in a set, else null (two counts, or none known). */
function sharedPackCount(tiles: readonly PkTile[]): number | null {
  const counts = new Set(tiles.map((t) => t.packCount).filter((n): n is number => n != null));
  return counts.size === 1 ? [...counts][0] : null;
}

// ── per-pack-by-set ───────────────────────────────────────────────────────────
// For each recent released set: the cheapest open US listing of each of the
// four kinds (cheapestByKind, so half boxes never stand for a box and
// pre-orders are out) divided by its packs. The lowest in a row is bold.

function perPackBySet(ctx: BlockCtx): BlockOut {
  const { catalog } = ctx;
  const recent = recentReleasedSets(catalog, ctx.today);
  const rows: { set: PkSetSummary; cells: Partial<Record<PkKind, PkTile>> }[] = [];
  const skipped: PkSetSummary[] = [];
  for (const s of recent) {
    const tiles = tilesOfSet(catalog, s.slug);
    if (!tiles.some((t) => PER_PACK_KINDS.includes(t.kind))) {
      skipped.push(s);
      continue;
    }
    const cheapest = cheapestByKind(tiles);
    const cells: Partial<Record<PkKind, PkTile>> = {};
    for (const k of PER_PACK_KINDS) {
      const t = cheapest[k];
      if (t && t.perPackCents != null) cells[k] = t;
    }
    rows.push({ set: s, cells });
  }
  if (!rows.length) {
    return {
      markdown:
        "No recent set has a booster box, Elite Trainer Box or booster bundle with a tracked US listing yet, so there is no per-pack table to show.",
      facts: {},
    };
  }

  const wins = new Map<string, number>();
  let compared = 0;
  let lowest: { tile: PkTile; set: PkSetSummary } | null = null;
  const lines = [
    `| Set | ${PER_PACK_KINDS.map((k) => KIND_NAME[k].col).join(" | ")} |`,
    `|---|${PER_PACK_KINDS.map(() => "---").join("|")}|`,
  ];
  for (const r of rows) {
    const priced = PER_PACK_KINDS.filter((k) => r.cells[k]);
    const min = priced.length ? Math.min(...priced.map((k) => r.cells[k]?.perPackCents as number)) : null;
    if (priced.length >= 2 && min != null) {
      compared++;
      for (const k of priced) if (r.cells[k]?.perPackCents === min) wins.set(k, (wins.get(k) ?? 0) + 1);
    }
    for (const k of priced) {
      const t = r.cells[k] as PkTile;
      if (!lowest || (t.perPackCents as number) < (lowest.tile.perPackCents as number)) lowest = { tile: t, set: r.set };
    }
    const cells = PER_PACK_KINDS.map((k) => {
      const t = r.cells[k];
      if (!t) return "—";
      const fig = money(t.perPackCents as number, catalog);
      return priced.length >= 2 && t.perPackCents === min ? `**${fig}**` : fig;
    });
    lines.push(`| ${setLink(r.set)} | ${cells.join(" | ")} |`);
  }

  const facts: Record<string, string> = { perPackSets: String(rows.length) };
  const notes: string[] = [];
  if (compared > 0) {
    const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1] || PER_PACK_KINDS.indexOf(a[0] as PkKind) - PER_PACK_KINDS.indexOf(b[0] as PkKind));
    const sweep = ranked.length === 1;
    const parts = ranked.map(([k, n], i) =>
      i === 0 ? `${KIND_NAME[k].one} had the lowest price per pack in ${sweep ? allOf(compared) : n}` : `${KIND_NAME[k].one} in ${n}`,
    );
    const tied = ranked.reduce((n, [, w]) => n + w, 0) > compared;
    const line = `${ofRecentSets(compared)} where at least two of these products have a tracked listing and a pack count, ${listJoin(parts)}${tied ? " (a tie counts for each)" : ""}.`;
    facts.perPackCompared = String(compared);
    facts.perPackLine = line;
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) {
      facts.perPackLeader = KIND_NAME[ranked[0][0]].one;
      facts.perPackLeaderWins = `${ranked[0][1]} of ${compared}`;
    }
    notes.push(line);
  }
  if (lowest) {
    const k = KIND_NAME[lowest.tile.kind].one.replace(/^the /, "");
    facts.perPackLowest = `${formatPerPack(lowest.tile.perPackCents as number, catalog.currency)}, for the ${lowest.set.name} ${k}`;
    notes.push(`The lowest figure in the table is ${facts.perPackLowest}.`);
  }
  if (skipped.length) {
    notes.push(`${listJoin(skipped.map((s) => s.name))} ${skipped.length === 1 ? "has" : "have"} none of these four products, so ${skipped.length === 1 ? "it has" : "they have"} no row.`);
  }

  const markdown = [
    ...lines,
    "",
    usCaption(
      catalog,
      " Each cell is the cheapest product of its kind in that set divided by the booster packs inside; a dash means no open listing or no known pack count. Half boxes never stand for a booster box, and pre-orders are left out. Sets are the most recent released ones by the dates TCGplayer lists.",
    ),
    "",
    notes.join(" "),
  ].join("\n");
  return { markdown: markdown.trim(), facts };
}

// ── pack-counts ───────────────────────────────────────────────────────────────
// The typical (most common) pack count of each kind across the recent sets,
// with where it was read. A tie has no typical value and shows a dash.

const FROM_WORDS = { contents: "Contents list", name: "Product name", both: "Contents list and name" } as const;

function packCounts(ctx: BlockCtx): BlockOut {
  const { catalog } = ctx;
  const recent = recentReleasedSets(catalog, ctx.today);
  const slugs = recent.map((s) => s.slug);
  // Half boxes are out here too, as typicalPackCount leaves them out: a set's
  // half box would otherwise count as a box with "no typical count".
  const kindTiles = (k: PkKind) =>
    catalog.tiles.filter((t) => t.kind === k && !isHalfBox(t) && t.setSlug != null && slugs.includes(t.setSlug));
  const rows = PER_PACK_KINDS.map((k) => ({ kind: k, typical: typicalPackCount(catalog.tiles, [k], slugs), all: kindTiles(k) }));
  if (!rows.some((r) => r.typical || r.all.length)) {
    return { markdown: "No recent set has a booster box, Elite Trainer Box or booster bundle in the catalogue yet, so there are no pack counts to show.", facts: {} };
  }

  const lines = ["| Kind | Typical packs | Products counted | Counted from |", "|---|---|---|---|"];
  for (const r of rows) {
    const label = PK_KINDS.find((x) => x.id === r.kind)?.label ?? r.kind;
    const t = r.typical;
    const counted = t ? `${t.counted}${t.matching < t.counted ? ` (${t.matching} hold the typical count)` : ""}` : String(r.all.filter((x) => x.packCount != null).length);
    lines.push(`| ${label} | ${t ? t.count : "—"} | ${counted} | ${t ? FROM_WORDS[t.from] : "—"} |`);
  }

  const facts: Record<string, string> = { packCountSets: String(recent.length) };
  const key: Record<string, string> = { "booster-box": "boxPacks", etb: "etbPacks", "pc-etb": "pcEtbPacks", "booster-bundle": "bundlePacks" };
  for (const r of rows) if (r.typical) facts[key[r.kind]] = String(r.typical.count);

  const known = rows.filter((r) => r.typical);
  if (known.length) {
    const parts = known.map((r, i) => `${aKind(r.kind)} ${i === 0 ? "holds " : ""}${r.typical?.count}${i === 0 ? " booster packs" : ""}`);
    facts.packCountsLine = `The most common counts in the ${recent.length} most recent released sets: ${listJoin(parts)}.`;
  }
  const etb = rows.find((r) => r.kind === "etb")?.typical;
  const pc = rows.find((r) => r.kind === "pc-etb")?.typical;
  if (etb && pc) {
    facts.etbPcPacksLine = `In the ${recent.length} most recent released sets, a Pokémon Center ETB most often holds ${pc.count} booster packs and a regular Elite Trainer Box ${etb.count}.`;
    if (pc.count > etb.count) facts.pcEtbExtraPacks = String(pc.count - etb.count);
  }

  const uncounted = rows.reduce((n, r) => n + r.all.filter((t) => t.packCount == null).length, 0);
  const note = [
    `*Products of each kind in the ${recent.length} most recent released sets (by the dates TCGplayer lists). Half boxes are left out of the box count.*`,
    uncounted > 0
      ? `${uncounted} of these products ${uncounted === 1 ? "has" : "have"} no pack count we can read, so ${uncounted === 1 ? "it is" : "they are"} left out rather than guessed.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { markdown: [...lines, "", note].join("\n"), facts };
}

// ── etb-vs-pc-etb ─────────────────────────────────────────────────────────────
// For each recent set with both an ETB and a Pokémon Center ETB: the packs in
// each, the cheapest listing of each (cheapestByKind) and its price per pack.

interface EtbSide {
  packs: number | null;
  tile: PkTile | undefined;
}

function etbSide(tiles: readonly PkTile[], kind: PkKind): EtbSide {
  const ofKind = tiles.filter((t) => t.kind === kind && !t.presale);
  const tile = cheapestByKind(ofKind)[kind];
  return { packs: tile?.packCount ?? sharedPackCount(ofKind), tile };
}

function etbVsPcEtb(ctx: BlockCtx): BlockOut {
  const { catalog } = ctx;
  const rows: { set: PkSetSummary; etb: EtbSide; pc: EtbSide }[] = [];
  for (const s of recentReleasedSets(catalog, ctx.today)) {
    const tiles = tilesOfSet(catalog, s.slug);
    const released = (k: PkKind) => tiles.some((t) => t.kind === k && !t.presale);
    if (!released("etb") || !released("pc-etb")) continue;
    rows.push({ set: s, etb: etbSide(tiles, "etb"), pc: etbSide(tiles, "pc-etb") });
  }
  if (!rows.length) {
    return {
      markdown: "None of the recent released sets has both an Elite Trainer Box and a Pokémon Center ETB in the catalogue yet, so there is nothing to set side by side.",
      facts: {},
    };
  }

  const priceCell = (s: EtbSide) => {
    if (!s.tile) return "No tracked listing";
    const v = variantOf(s.tile.name);
    return `${money(s.tile.lowCents as number, catalog)}${v ? ` (${cell(v)})` : ""}`;
  };
  const lines = [
    "| Set | ETB packs | Cheapest ETB | ETB per pack | PC ETB packs | Cheapest PC ETB | PC ETB per pack |",
    "|---|---|---|---|---|---|---|",
  ];
  let pcLower = 0;
  let etbLower = 0;
  let same = 0;
  const gaps: number[] = [];
  const extras: number[] = [];
  for (const r of rows) {
    const e = r.etb.tile?.perPackCents ?? null;
    const p = r.pc.tile?.perPackCents ?? null;
    const both = e != null && p != null;
    if (both) {
      if (p < e) pcLower++;
      else if (e < p) etbLower++;
      else same++;
    }
    if (r.etb.tile && r.pc.tile) gaps.push((r.pc.tile.lowCents as number) - (r.etb.tile.lowCents as number));
    if (r.etb.packs != null && r.pc.packs != null) extras.push(r.pc.packs - r.etb.packs);
    const per = (v: number | null, other: number | null) => {
      if (v == null) return "—";
      const fig = money(v, catalog);
      return other != null && v < other ? `**${fig}**` : fig;
    };
    lines.push(
      `| ${setLink(r.set)} | ${r.etb.packs ?? "—"} | ${priceCell(r.etb)} | ${per(e, p)} | ${r.pc.packs ?? "—"} | ${priceCell(r.pc)} | ${per(p, e)} |`,
    );
  }

  const facts: Record<string, string> = { etbVsPcSets: String(rows.length) };
  const notes: string[] = [];
  const compared = pcLower + etbLower + same;
  if (compared > 0) {
    const pcName = "the Pokémon Center ETB";
    const etbName = "the regular Elite Trainer Box";
    const outcome =
      same === compared
        ? `the two had the same price per pack in ${allOf(compared)}`
        : etbLower === 0 && same === 0
          ? `${pcName} had the lower price per pack in ${allOf(compared)}`
          : pcLower === 0 && same === 0
            ? `${etbName} had the lower price per pack in ${allOf(compared)}`
            : `${pcName} had the lower price per pack in ${pcLower} and ${etbName} in ${etbLower}${same ? `, and the two were level in ${same}` : ""}`;
    facts.etbVsPcLine = `${ofRecentSets(compared)} where both have a tracked listing and a pack count, ${outcome}.`;
    notes.push(facts.etbVsPcLine);
  }
  if (extras.length) {
    const distinct = [...new Set(extras)];
    const setWord = extras.length === 1 ? "set" : "sets";
    if (distinct.length === 1 && distinct[0] > 0) {
      facts.pcEtbExtraPacksLine = `The Pokémon Center ETB held ${distinct[0]} more booster packs than the regular one in each of the ${extras.length} ${setWord} where both counts are known.`;
    } else if (distinct.length > 1) {
      facts.pcEtbExtraPacksLine = `Where both counts are known (${extras.length} ${setWord}), the Pokémon Center ETB held between ${Math.min(...extras)} and ${Math.max(...extras)} more booster packs than the regular one.`;
    }
    if (facts.pcEtbExtraPacksLine) notes.push(facts.pcEtbExtraPacksLine);
  }
  const gap = median(gaps);
  if (gap != null) {
    const g = Math.round(gap);
    const setWord = gaps.length === 1 ? "set" : "sets";
    facts.pcEtbGapLine =
      g === 0
        ? `Across the ${gaps.length} ${setWord} with a listing for both, the two cheapest listings were level at the median.`
        : `Across the ${gaps.length} ${setWord} with a listing for both, the cheapest Pokémon Center ETB listing was a median ${money(Math.abs(g), catalog)} ${g > 0 ? "above" : "below"} the cheapest regular ETB listing.`;
    notes.push(facts.pcEtbGapLine);
  }

  const markdown = [
    ...lines,
    "",
    usCaption(
      catalog,
      " Packs are counted from each product's published contents list; a bracketed name is the variant that was cheapest. The lower per-pack figure in each row is bold.",
    ),
    "",
    notes.join(" "),
  ].join("\n");
  return { markdown: markdown.trim(), facts };
}

// ── coverage ──────────────────────────────────────────────────────────────────
// What the catalogue holds: products, sets, pack counts, US listings, and the
// sources with rows at all (catalog.sources). Cardmarket is named only when it
// has rows; eBay only when it has rows, else the search that always exists.

function sourcesSentence(sources: readonly PkSource[], asOf: string | null): string {
  const has = (s: PkSource) => sources.includes(s);
  const parts: string[] = [];
  if (has("tcgplayer") || has("tcgplayer_market")) parts.push("TCGplayer (its cheapest US listing and its market price)");
  if (has("cardmarket") || has("cardmarket_trend")) parts.push("Cardmarket (the lowest EU listing in any language, and its trend price)");
  if (has("ebay")) parts.push("eBay (the cheapest matching listing in each market we track there)");
  if (!parts.length) return "No source holds any rows yet.";
  const ebay = has("ebay") ? "" : ` No tracked eBay listing is in the data${asOf ? ` ${asOf}` : ""}; every product still links to a search of the visitor's own eBay.`;
  return `The sources with rows in the data: ${listJoin(parts)}.${ebay}`;
}

function coverage(ctx: BlockCtx): BlockOut {
  const { catalog } = ctx;
  const tiles = catalog.tiles;
  const asOf = asOfLabel(catalog.pricesAsOf);
  if (!tiles.length) {
    return { markdown: `No products have been imported yet. ${sourcesSentence(catalog.sources, asOf)}`, facts: {} };
  }
  const counted = tiles.filter((t) => t.packCount != null).length;
  const listed = tiles.filter((t) => t.lowCents != null).length;
  const presale = tiles.filter((t) => t.presale).length;
  const setless = tiles.filter((t) => !t.setSlug).length;

  const lines = ["| Kind | Products | With a pack count | With an open US listing |", "|---|---|---|---|"];
  for (const k of PK_KINDS) {
    const of = tiles.filter((t) => t.kind === k.id);
    if (!of.length) continue;
    lines.push(`| ${k.plural} | ${num(of.length)} | ${num(of.filter((t) => t.packCount != null).length)} | ${num(of.filter((t) => t.lowCents != null).length)} |`);
  }
  lines.push(`| **All** | **${num(tiles.length)}** | **${num(counted)}** | **${num(listed)}** |`);

  const setWord = catalog.sets.length === 1 ? "set" : "sets";
  const coverageLine =
    `The catalogue holds ${num(tiles.length)} sealed products` +
    (setless ? `: ${num(tiles.length - setless)} in ${num(catalog.sets.length)} ${setWord} and ${num(setless)} outside any set` : ` across ${num(catalog.sets.length)} ${setWord}`) +
    `. ${num(counted)} have a pack count we can read, and ${num(listed)} have an open US listing${asOf ? ` ${asOf}` : ""}` +
    (presale ? `; ${num(presale)} are pre-orders` : "") +
    ".";
  const sourcesLine = sourcesSentence(catalog.sources, asOf);
  const facts: Record<string, string> = {
    productCount: num(tiles.length),
    setCount: num(catalog.sets.length),
    packCountCount: num(counted),
    usListedCount: num(listed),
    coverageLine,
    sourcesLine,
  };
  const markdown = [...lines, "", `*Every active product in the catalogue, by kind. An open listing is one we checked in the last ${OFFER_STALE_H} hours and found in stock.*`, "", coverageLine, "", sourcesLine].join("\n");
  return { markdown, facts };
}

// ── method-constants ──────────────────────────────────────────────────────────
// The rules the code runs on, quoted from the code itself: the catalogue's
// scope start (catalog.ts), the stale-row threshold (lib/sealed-offers.ts) and
// the markets the importer searches eBay in (ebay.ts), named through
// COUNTRIES. Numbers that live only in the importer's budget stay out.

function names(codes: readonly string[]): string {
  return listJoin(codes.filter((c): c is Country => c in COUNTRIES).map((c) => COUNTRIES[c as Country].place));
}

export function methodFacts(): Record<string, string> {
  const searchOnly = COUNTRY_LIST.map((c) => c.code).filter((c) => !POKEMON_EBAY_MARKETS.includes(c));
  const series = seriesForDate(SCOPE_START);
  return {
    scopeStart: formatDay(SCOPE_START) ?? SCOPE_START,
    ...(series ? { scopeSeries: series } : {}),
    offerStaleHours: String(OFFER_STALE_H),
    ebayMarkets: names(POKEMON_EBAY_MARKETS),
    ...(searchOnly.length ? { ebaySearchOnly: names(searchOnly) } : {}),
  };
}

function methodConstants(): BlockOut {
  const f = methodFacts();
  const markdown = [
    `- **Scope:** English-language sealed products released from ${f.scopeSeries ? `${f.scopeSeries} (${f.scopeStart})` : f.scopeStart} onward, pre-orders included.`,
    `- **Stale listings:** a listing we have not re-checked within ${f.offerStaleHours} hours shows as unknown, never as in stock.`,
    `- **eBay markets we search for matching listings:** ${f.ebayMarkets}.`,
    ...(f.ebaySearchOnly ? [`- **eBay search link only:** ${f.ebaySearchOnly}, where we search for no listing of our own.`] : []),
  ].join("\n");
  return { markdown, facts: f };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const BLOCKS: Record<BlockId, (ctx: BlockCtx) => BlockOut> = {
  "per-pack-by-set": perPackBySet,
  "pack-counts": packCounts,
  "etb-vs-pc-etb": etbVsPcEtb,
  coverage,
  "method-constants": methodConstants,
};

/**
 * Every fact each block can set. A post's {{fact}} must be one its own blocks
 * declare here (tests/pokemon-blog.test.ts), so a token can never point at a
 * figure the page does not compute.
 */
export const BLOCK_FACTS: Record<BlockId, readonly string[]> = {
  "per-pack-by-set": ["perPackSets", "perPackCompared", "perPackLine", "perPackLeader", "perPackLeaderWins", "perPackLowest"],
  "pack-counts": ["packCountSets", "boxPacks", "etbPacks", "pcEtbPacks", "bundlePacks", "packCountsLine", "etbPcPacksLine", "pcEtbExtraPacks"],
  "etb-vs-pc-etb": ["etbVsPcSets", "etbVsPcLine", "pcEtbExtraPacksLine", "pcEtbGapLine"],
  coverage: ["productCount", "setCount", "packCountCount", "usListedCount", "coverageLine", "sourcesLine"],
  "method-constants": ["scopeStart", "scopeSeries", "offerStaleHours", "ebayMarkets", "ebaySearchOnly"],
};
