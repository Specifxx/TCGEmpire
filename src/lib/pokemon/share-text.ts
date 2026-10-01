// "Copy for Reddit" / "Copy for Discord": the cheapest listings as text a
// collector can paste where links are banned (components/pokemon/CopyPrices.tsx).
// Pure and client-safe: the product page is ISR and builds its text in the
// browser for the visitor's market; the set and price-per-pack pages build it
// on the server and hand the finished strings down.
//
// What the text may carry:
//   - figures with their source named, cheapest first, item price, postage
//     extra, and the "as of" date, because a pasted table outlives the import;
//   - no URL and no brand unless the person ticks "Include source link", and
//     then exactly one link, to our page, tagged utm_source=reddit|discord,
//     utm_medium=copy, utm_campaign=pkmn-copy so pasted arrivals are measurable;
//   - never an affiliate or marketplace URL.
// Reddit gets a pipe table (it renders in Markdown mode); Discord has no tables,
// so it gets bullets, capped to fit one message.
//
// The figures are the ones on the page copied from. A UK visitor who asked for
// euros sees the market's pound figures converted (PokemonBoardView, browse.ts
// toDisplay), so `eur` converts them here too, and the text says they were.

import { COUNTRIES, type Country } from "../country";
import { formatMoney } from "../format";
import { gbpCentsToEur } from "../fx";
import { offerStock } from "../sealed-offers";
import { listingLabel } from "./board";
import { kindInfo, kindOrder, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import { asOfLabel, cheapestByKind, perPackRanking, pokemonUtm } from "./value";
import type { PkBoard, PkCatalog, PkListing, PkTile } from "./types";

export type ShareFormat = "reddit" | "discord";

export interface ShareOpts {
  format: ShareFormat;
  withLink: boolean;
  now?: number;
  /** The UK euro display (useCountry().isEurDisplay, or the page's showEur): pound figures shown in euros. */
  eur?: boolean;
}

/** A figure as the page shows it: pounds in euros when the visitor asked for that. */
type Money = (cents: number, currency: string) => string;

function moneyFor(opts: ShareOpts): Money {
  return (cents, currency) => (opts.eur && currency === "GBP" ? formatMoney(gbpCentsToEur(cents), "EUR") : formatMoney(cents, currency));
}

/**
 * Said under the rows whenever moneyFor converted a listing: a converted
 * reference already carries its ≈, a listing row carries no mark of its own.
 */
const EUR_NOTE = "Shown in euros, converted from the pound prices of UK listings.";

/** All four texts a CopyPrices button set can put on the clipboard. */
export interface CopyTexts {
  reddit: { plain: string; linked: string };
  discord: { plain: string; linked: string };
}

/** Builds the four texts on the server, for a page that hands CopyPrices finished strings. */
export function shareTexts(build: (opts: ShareOpts) => string): CopyTexts {
  return {
    reddit: { plain: build({ format: "reddit", withLink: false }), linked: build({ format: "reddit", withLink: true }) },
    discord: { plain: build({ format: "discord", withLink: false }), linked: build({ format: "discord", withLink: true }) },
  };
}

/** One Discord message. */
export const DISCORD_MAX = 2000;
/** Rows a Discord paste lists at most, whatever the page shows. */
export const DISCORD_ROWS = 10;

/** The newest check among a product's stored rows: its "as of". */
export function offersAsOf(offers: readonly { checkedAt: string }[]): string | null {
  return offers.length ? offers.reduce((a, o) => (o.checkedAt > a ? o.checkedAt : a), offers[0].checkedAt) : null;
}

function closing(asOf: string | null): string {
  const label = asOfLabel(asOf);
  return `Cheapest listings, item price, postage extra.${label ? ` As of ${label.replace(/^as of /, "")}.` : ""}`;
}

function sourceLine(path: string, format: ShareFormat): string {
  return `Source: ${pokemonUtm(path, { source: format, medium: "copy", campaign: "pkmn-copy" })}`;
}

/** A table cell: no pipes or line breaks from a product name can break the row. */
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

interface Shape {
  heading: string;
  /** Column headers, the first left-aligned and the rest right-aligned unless listed in `left`. */
  columns: string[];
  left?: number[];
  rows: string[][];
  /** A row's Discord bullet. */
  bullet: (row: string[]) => string;
  /** Said instead of the table when there are no rows. */
  empty: string;
  notes: string[];
  path: string;
  asOf: string | null;
}

function render(shape: Shape, opts: ShareOpts): string {
  const tail = [...(opts.withLink ? [sourceLine(shape.path, opts.format)] : []), closing(shape.asOf)];
  if (opts.format === "reddit") {
    const out = [shape.heading, ""];
    if (shape.rows.length) {
      const left = new Set([0, ...(shape.left ?? [])]);
      out.push(`| ${shape.columns.map(cell).join(" | ")} |`);
      out.push(`|${shape.columns.map((_, i) => (left.has(i) ? ":--" : "--:")).join("|")}|`);
      for (const r of shape.rows) out.push(`| ${r.map(cell).join(" | ")} |`);
    } else {
      out.push(shape.empty);
    }
    if (shape.notes.length) out.push("", ...shape.notes);
    out.push("", ...tail);
    return out.join("\n");
  }
  // Discord: bullets, dropping rows from the bottom until it fits one message.
  const build = (n: number) =>
    [shape.heading, ...(shape.rows.length ? shape.rows.slice(0, n).map((r) => `- ${shape.bullet(r)}`) : [shape.empty]), ...shape.notes, ...tail].join("\n");
  let n = Math.min(shape.rows.length, DISCORD_ROWS);
  let text = build(n);
  while (text.length > DISCORD_MAX && n > 1) text = build(--n);
  return text.length > DISCORD_MAX ? `${text.slice(0, DISCORD_MAX - 1)}…` : text;
}

const postage = (l: PkListing, money: Money) =>
  l.source !== "ebay" ? "" : l.shippingCents == null ? " + postage" : l.shippingCents === 0 ? ", free postage" : ` + ${money(l.shippingCents, l.currency)} postage`;

/**
 * One product in one market: its open listings, cheapest first, the price per
 * pack beside each when the pack count is known, and TCGplayer's market price
 * below as a reference (≈ when converted).
 */
export function productShareText(
  boards: Partial<Record<Country, PkBoard>>,
  name: string,
  slug: string,
  packCount: number | null,
  asOf: string | null,
  market: Country,
  opts: ShareOpts,
): string {
  const board = boards[market] ?? boards.US;
  const place = COUNTRIES[board?.market ?? market].place;
  const now = opts.now ?? Date.now();
  const money = moneyFor(opts);
  const open = (board?.listings ?? []).filter((l) => offerStock(l, now) === "open");
  const perPack = packCount != null && packCount > 0;
  const rows = open.map((l) => {
    const pp = perPack ? perPackCents(l.priceCents, packCount) : null;
    return [l.label, `${money(l.priceCents, l.currency)}${postage(l, money)}`, ...(perPack ? [pp != null ? money(pp, l.currency) : "—"] : [])];
  });
  const refs = board?.references ?? [];
  const notes = refs.map((r) => `${r.label} (a reference, not a listing): ${r.converted ? "≈ " : ""}${money(r.priceCents, r.currency)}`);
  if (perPack) notes.unshift(`${packCount} booster ${packCount === 1 ? "pack" : "packs"} inside.`);
  if (opts.eur && open.some((l) => l.currency === "GBP")) notes.push(EUR_NOTE);
  return render(
    {
      heading: `**${name}**: cheapest listings in ${place}`,
      columns: ["Where", "Price", ...(perPack ? ["Per pack"] : [])],
      rows,
      bullet: (r) => `${r[1]} · ${r[0]}${perPack && r[2] !== "—" ? ` · ${r[2]} a pack` : ""}`,
      empty: board?.listings.length ? `No open listing we track in ${place}.` : `No tracked listings in ${place}.`,
      notes,
      path: `/pokemon/sealed/${slug}`,
      asOf,
    },
    opts,
  );
}

/** Kinds a set paste lists at most. */
export const SET_SHARE_ROWS = 8;

/**
 * One set in the catalogue's market: the cheapest listing of each product type,
 * with its price per pack. Pre-orders count, said as such (a set not out yet
 * still has prices worth pasting). Null for an unknown set.
 */
export function setShareText(catalog: Pick<PkCatalog, "market" | "currency" | "tiles" | "sets" | "pricesAsOf">, setSlug: string, opts: ShareOpts): string | null {
  const set = catalog.sets.find((s) => s.slug === setSlug);
  if (!set) return null;
  const place = COUNTRIES[catalog.market].place;
  const money = moneyFor(opts);
  const tiles = catalog.tiles.filter((t) => t.setSlug === set.slug);
  const picks = Object.values(cheapestByKind(tiles, { includePresale: true }))
    .filter((t): t is PkTile => t != null)
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind))
    .slice(0, SET_SHARE_ROWS);
  const rows = picks.map((t) => [
    kindInfo(t.kind).label,
    t.name,
    `${money(t.lowCents as number, catalog.currency)}${t.presale ? " (pre-order)" : ""}${t.lowSource ? ` on ${listingLabel(t.lowSource, catalog.market)}` : ""}`,
    t.perPackCents != null ? money(t.perPackCents, catalog.currency) : "—",
  ]);
  return render(
    {
      heading: `**${set.name} sealed**: cheapest listing of each type in ${place}`,
      columns: ["Type", "Product", "Cheapest listing", "Per pack"],
      left: [1],
      rows,
      bullet: (r) => `${r[0]}: ${r[2]}${r[3] !== "—" ? ` · ${r[3]} a pack` : ""} (${r[1]})`,
      empty: `No tracked listings in ${place}.`,
      notes: opts.eur && rows.length && catalog.currency === "GBP" ? [EUR_NOTE] : [],
      path: `/pokemon/sets/${set.slug}`,
      asOf: catalog.pricesAsOf,
    },
    opts,
  );
}

/**
 * The lowest price per pack in the catalogue's market (perPackRanking: released
 * products with an open listing and a known pack count). `kinds` narrows it,
 * `label` names the narrowing ("Booster boxes"), `anchor` is the section of
 * /pokemon/price-per-pack the source link lands on.
 */
export function perPackShareText(
  catalog: Pick<PkCatalog, "market" | "currency" | "tiles" | "pricesAsOf">,
  scope: { kinds?: readonly PkKind[]; limit?: number; label?: string; anchor?: string },
  opts: ShareOpts,
): string {
  const place = COUNTRIES[catalog.market].place;
  const money = moneyFor(opts);
  const ranked = perPackRanking(catalog.tiles, { kinds: scope.kinds, limit: scope.limit ?? 20 });
  const rows = ranked.map((t, i) => [
    String(i + 1),
    t.name,
    money(t.perPackCents as number, catalog.currency),
    `${money(t.lowCents as number, catalog.currency)}${t.lowSource ? ` on ${listingLabel(t.lowSource, catalog.market)}` : ""}`,
    String(t.packCount),
  ]);
  return render(
    {
      heading: `**Lowest price per pack${scope.label ? `: ${scope.label}` : ""}** in ${place}`,
      columns: ["#", "Product", "Per pack", "Cheapest listing", "Packs"],
      left: [1],
      rows,
      bullet: (r) => `${r[2]} a pack · ${r[1]} · ${r[3]}, ${r[4]} ${r[4] === "1" ? "pack" : "packs"}`,
      empty: `No tracked listings in ${place} with a known pack count.`,
      notes: ["Released products only: pre-orders are left out.", ...(opts.eur && rows.length && catalog.currency === "GBP" ? [EUR_NOTE] : [])],
      path: `/pokemon/price-per-pack${scope.anchor ? `#${scope.anchor}` : ""}`,
      asOf: catalog.pricesAsOf,
    },
    opts,
  );
}
