// The words on the product and set share cards (lib/pokemon/product-og.tsx,
// set-og.tsx), as plain strings from already-loaded data. Pure, so the lines can
// be tested from the fixtures without rendering an image
// (tests/pokemon-share.test.ts).
//
// Both cards quote US figures only, and say so: an unfurl is one image for every
// market, and the US is the default market the pages, their titles and their
// JSON-LD describe. Every card prints its "as of" date, because Discord, Reddit
// and X keep an unfurl long after the import has moved on.

import { formatMoney } from "../format";
import { buildBoard } from "./board";
import { formatDay } from "./format";
import { kindInfo, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import { asOfLabel, cheapestByKind, formatPerPack } from "./value";
import type { PkCatalog, PkProductDetail, PkTile } from "./types";

const footerLine = (asOf: string | null): string => ["Item price, postage extra", "updated daily", asOf].filter(Boolean).join(" · ");

export interface ProductOgLines {
  name: string;
  /** "Elite Trainer Box · 30th Celebration". */
  context: string;
  /** The cheapest open US listing, split for the big type. Null when there is none. */
  headline: { label: string; price: string; source: string } | null;
  /** Shown in the headline's place when there is no open US listing. */
  noListing: string | null;
  /** "US$12.78 a pack · 9 packs". */
  perPack: string | null;
  /** "TCGplayer market US$162.45 (reference)". */
  reference: string | null;
  /** "Pre-order: TCGplayer lists 6 Nov 2026". */
  preorder: string | null;
  /** "Item price, postage extra · updated daily · as of 1 Oct 2026". */
  footer: string;
}

/** "Cheapest US listing US$115.00 on TCGplayer", the headline as one sentence. */
export function headlineSentence(h: ProductOgLines["headline"]): string | null {
  return h ? `${h.label} ${h.price} ${h.source}` : null;
}

export function productOgLines(p: PkProductDetail, now: number = Date.now()): ProductOgLines {
  // The US board, through the same rules as the page (open rows only for the
  // headline, references never in the comparison). Its hrefs go unused.
  const board = buildBoard(p.name, p.offers, "US", { page: `/pokemon/sealed/${p.slug}`, surface: "og", now });
  const h = board.headline;
  const pp = h ? perPackCents(h.priceCents, p.packCount) : null;
  const ref = board.references.find((r) => r.source === "tcgplayer_market");
  const release = formatDay(p.releasedOn);
  const seen = [...board.listings.map((l) => l.lastSeen), ...board.references.map((r) => r.checkedAt)];
  const newest = seen.length ? seen.reduce((a, b) => (b > a ? b : a)) : null;
  return {
    name: p.name,
    context: [kindInfo(p.kind).label, p.set?.name].filter(Boolean).join(" · "),
    headline: h ? { label: "Cheapest US listing", price: formatMoney(h.priceCents, h.currency), source: `on ${h.label}` } : null,
    noListing: h ? null : "No tracked US listing",
    perPack: pp != null && p.packCount ? `${formatPerPack(pp, board.currency)} · ${p.packCount} ${p.packCount === 1 ? "pack" : "packs"}` : null,
    reference: ref ? `TCGplayer market ${formatMoney(ref.priceCents, ref.currency)} (reference)` : null,
    preorder: p.presale && release ? `Pre-order: TCGplayer lists ${release}` : null,
    footer: footerLine(asOfLabel(newest)),
  };
}

export interface SetOgLines {
  name: string;
  /** "Mega Evolution · 34 sealed products". */
  context: string;
  /** Every figure on the card is a US one. */
  label: string;
  /**
   * Box, ETB and bundle. `text` is the whole line, "from US$147.60 (US$4.10 a
   * pack)"; `price` and `perPack` are its two halves, for the card's two lines.
   */
  rows: { kind: string; text: string; price: string; perPack: string | null }[];
  /** "TCGplayer lists 16 Sep 2026", or "Pre-orders open: …" for a set not out yet. */
  release: string | null;
  footer: string;
}

/** The three kinds a set card prices: the ones people compare first. */
export const SET_OG_KINDS: readonly PkKind[] = ["booster-box", "etb", "booster-bundle"];

/** Null when the US catalogue holds no such set. */
export function setOgLines(catalog: Pick<PkCatalog, "sets" | "tiles" | "pricesAsOf" | "currency">, slug: string): SetOgLines | null {
  const set = catalog.sets.find((s) => s.slug === slug);
  if (!set) return null;
  const tiles = catalog.tiles.filter((t) => t.setSlug === set.slug);
  const presale = tiles.some((t) => t.presale);
  const released = cheapestByKind(tiles);
  // A set that is all pre-orders still gets prices: its pre-order listings,
  // said as such, which is what a card shared before release day is for.
  const preorders = cheapestByKind(tiles, { includePresale: true });
  const rows: SetOgLines["rows"] = [];
  for (const kind of SET_OG_KINDS) {
    const t: PkTile | undefined = released[kind] ?? preorders[kind];
    if (!t || t.lowCents == null) continue;
    const price = `${t.presale ? "pre-order from" : "from"} ${formatMoney(t.lowCents, catalog.currency)}`;
    // A pre-order's per-pack figure is shown like any other (it is that
    // listing's price over its packs); only rankings leave pre-orders out.
    const perPack = t.perPackCents != null ? formatPerPack(t.perPackCents, catalog.currency) : null;
    rows.push({ kind: kindInfo(kind).label, text: perPack ? `${price} (${perPack})` : price, price, perPack });
  }
  const date = formatDay(set.releasedOn);
  return {
    name: set.name,
    context: `${set.series} · ${set.productCount} sealed ${set.productCount === 1 ? "product" : "products"}`,
    label: "US prices",
    rows,
    release: date ? `${presale ? "Pre-orders open: " : ""}TCGplayer lists ${date}` : null,
    footer: footerLine(asOfLabel(catalog.pricesAsOf)),
  };
}
