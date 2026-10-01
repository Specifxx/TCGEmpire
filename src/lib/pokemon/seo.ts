// Metadata and structured-data builders for every Pokémon page. Server-side
// (reads POKEMON_INDEX_PRODUCTS through ./flag), never imported by a client
// component.
//
// WHY its own builders rather than lib/seo.ts's pageAlternates/pageOpenGraph
// alone:
//   - Titles are ABSOLUTE. The root template appends " — RiftCompare", which
//     pushed the hub's title to 66 characters; every Pokémon title is ≤60 and
//     carries no brand (TITLE_MAX, tests/pokemon-seo.test.ts).
//   - Alternates drop the Riftbound feed links pageAlternates() re-attaches:
//     /feed.xml is Riftbound news, not this section's.
//   - Share images: a child page's `openGraph` REPLACES its parent folder's
//     file-based opengraph-image (next 14.2, resolve-metadata.js), so a page
//     that sets openGraph without images unfurled with no image at all
//     (/pokemon/sets and /pokemon/sealed did, measured 2026-10-01).
//       "section":   point at /pokemon/opengraph-image explicitly.
//       "colocated": NO `images` key at all (not even undefined), so the
//                    route's own opengraph-image.tsx is the one og:image.
//     Use "colocated" only where the route folder has its own
//     opengraph-image.tsx (the hub, set and product pages).

import type { Metadata } from "next";
import { COUNTRIES } from "../country";
import { formatMoney } from "../format";
import { SITE_URL } from "../site";
import { pageOpenGraph } from "../seo";
import { pokemonIndexProducts } from "./flag";
import { formatDay, formatMonth, listJoin, sourceWord } from "./format";
import { productPassesIndexGate } from "./index-gate";
import type { ProductFacts } from "./product-facts";
import type { SetFacts } from "./set-facts";
import { formatPerPack } from "./value";

export { INDEX_STAGE1_KINDS, productPassesIndexGate } from "./index-gate";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const SECTION_OG_ALT = "Pokémon sealed prices on RiftCompare";

const absolute = (path: string): string => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path === "/" ? "" : path}`);

/** `alternates` for a Pokémon page: its canonical and x-default, no Riftbound feed types. */
export function pokemonAlternates(path: string): Metadata["alternates"] {
  return { canonical: path, languages: { "x-default": absolute(path) } };
}

export interface PokemonMetaOpts {
  /** ≤ TITLE_MAX, no brand. Rendered as `{ absolute }`. */
  title: string;
  /** ≤ DESCRIPTION_MAX. */
  description: string;
  /** Site-relative canonical path, e.g. "/pokemon/booster-boxes". */
  path: string;
  robots?: Metadata["robots"];
  ogType?: "website" | "article";
  /** "section" = the /pokemon share card; "colocated" = this route's own opengraph-image.tsx. */
  ogImage: "section" | "colocated";
  /** Article dates for ogType "article" (ISO). */
  publishedTime?: string;
  modifiedTime?: string;
}

export function pokemonMeta(o: PokemonMetaOpts): Metadata {
  const og = pageOpenGraph({
    title: o.title,
    description: o.description,
    url: o.path,
    type: o.ogType ?? "website",
    ...(o.publishedTime ? { publishedTime: o.publishedTime } : {}),
    ...(o.modifiedTime ? { modifiedTime: o.modifiedTime } : {}),
  }) as Record<string, unknown>;
  const sectionImage = { url: `${SITE_URL}/pokemon/opengraph-image`, width: 1200, height: 630, alt: SECTION_OG_ALT };
  const openGraph = (o.ogImage === "section" ? { ...og, images: [sectionImage] } : og) as Metadata["openGraph"];
  const twitter: Metadata["twitter"] =
    o.ogImage === "section"
      ? { card: "summary_large_image", title: o.title, description: o.description, images: [sectionImage.url] }
      : { card: "summary_large_image", title: o.title, description: o.description };
  return {
    title: { absolute: o.title },
    description: o.description,
    alternates: pokemonAlternates(o.path),
    openGraph,
    twitter,
    ...(o.robots !== undefined ? { robots: o.robots } : {}),
  };
}

/** ItemList JSON-LD of plain links (no Product nodes: those need offers). */
export function pokemonItemList(name: string, items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absolute(it.path),
    })),
  };
}

/** Whether a product page is indexable right now: the owner's switch AND the stage-1 gate. */
export function productIsIndexed(p: { kind: string; packCount: number | null }): boolean {
  return pokemonIndexProducts() && productPassesIndexGate(p);
}

// ── Titles and descriptions ──────────────────────────────────────────────────
// Product and set titles are built from the name alone, so they are stable
// across imports and markets; descriptions carry the day's figures. Both are
// pinned against every active product and set name (tests/pokemon-seo.test.ts,
// tests/fixtures/pokemon-names.json): ≤60 / ≤155 characters, unique, and a
// product or set description always starts with its full name, which is what
// keeps the 30-odd "[variant]" pairs (two Evolving Skies ETBs, Koraidon and
// Miraidon) apart in a crawler's eyes.

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
// "(Exclusive)" says nothing a title needs. A named variant in parentheses
// ("(International Version)", "(1-Tab)", "(Blue)", "(Dollar General
// Exclusive)") is how two products differ, so it is dropped only after " Price".
const GENERIC_NOTE = /\s*\((?:retail |pok[eé]mon center )?exclusive\)/gi;
const shortKind = (s: string) =>
  s.replace(/Pok[eé]mon Center Elite Trainer Box/gi, "Pokémon Center ETB").replace(/Elite Trainer Box/gi, "ETB");

/** Whole words from the start of `s` that fit in `max`, without a dangling connector or a lone number. */
function cutWords(s: string, max: number): string {
  const words = s.split(" ");
  while (words.length > 1 && words.join(" ").length > max) words.pop();
  while (words.length > 1 && /^(?:[:,&+\-–]|\d+|of|the|and)$/i.test(words[words.length - 1])) words.pop();
  return words.join(" ").replace(/[\s:,&+\-–]+$/, "");
}

/**
 * A product page's title and the rung of the ladder that produced it:
 *   1. "{name} Price";
 *   2. shortened: "Elite Trainer Box" → "ETB", "(Exclusive)" dropped, "Version"
 *      dropped inside parentheses, then " Price";
 *   3. cut: " Price" goes first, then "PC ETB", then the remaining
 *      parentheses, then whole words before any "[bracket]" (or " - variant"),
 *      which always survives: for ETBs the bracket IS the product.
 */
export function productTitleLadder(name: string): { title: string; rung: 1 | 2 | 3 } {
  const PRICE = " Price";
  const fits = (t: string) => t.length <= TITLE_MAX;
  const full = squash(name);
  if (fits(full + PRICE)) return { title: full + PRICE, rung: 1 };
  const short = squash(shortKind(full).replace(GENERIC_NOTE, "").replace(/\(([^)]*?) version\)/gi, "($1)"));
  if (fits(short + PRICE)) return { title: short + PRICE, rung: 2 };
  const pc = short.replace(/Pokémon Center ETB/g, "PC ETB");
  const bare = squash(pc.replace(/\s*\([^)]*\)/g, ""));
  for (const t of [short, pc, bare + PRICE, bare]) if (fits(t)) return { title: t, rung: 3 };
  const m = /^(.*?)\s*(\[[^\]]*\]|\s-\s.+)$/.exec(bare);
  if (!m) return { title: cutWords(bare, TITLE_MAX), rung: 3 };
  let tail = m[2].trim();
  if (tail.length > TITLE_MAX - 12) {
    tail = tail.startsWith("[") ? `[${cutWords(tail.slice(1, -1), TITLE_MAX - 16)}…]` : `${cutWords(tail, TITLE_MAX - 14)}…`;
  }
  return { title: `${cutWords(m[1], TITLE_MAX - tail.length - 1)} ${tail}`, rung: 3 };
}

export function productTitle(name: string): string {
  return productTitleLadder(name).title;
}

/** `perPack: false` for a set with no box, ETB or bundle with a known pack count (a collection-only release), so the title promises none. */
export function setTitle(name: string, opts: { perPack?: boolean } = {}): string {
  const full = `${squash(name)} Sealed Prices & Price per Pack`;
  return opts.perPack !== false && full.length <= TITLE_MAX ? full : `${squash(name)} Sealed Prices`;
}

/** The first clause list that fits, else the bare name. Clauses are tried most-informative first. */
function ladder(head: string, variants: readonly (readonly string[])[], tail: string, fallback: string): string {
  for (const clauses of variants) {
    const kept = clauses.filter(Boolean);
    if (!kept.length) continue;
    const d = `${head}: ${kept.join(". ")}. ${tail}`;
    if (d.length <= DESCRIPTION_MAX) return d;
  }
  return fallback.length <= DESCRIPTION_MAX ? fallback : `${head.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

/**
 * "{name}: 9 booster packs, TCGplayer lists 16 Sep 2026. Cheapest US listing
 * US$115.00 on TCGplayer (US$12.78 a pack). Tracked eBay listings in the
 * United Kingdom. Updated daily." Clauses drop, least useful first, until it
 * fits; the name never does, so two products never share a description. The
 * eBay markets are named only when an open eBay listing exists in them.
 *
 * Every clause is a figure this product has. With no open US listing, the
 * first market (in the site's order) that holds one stands in for it; with no
 * listing anywhere, TCGplayer's US market price, if it has a row; with none of
 * those, the name alone.
 */
export function productDescription(f: ProductFacts): string {
  const name = squash(f.name);
  const day = formatDay(f.releasedOn);
  const packs = f.packCount != null ? `${f.packCount} booster ${f.packCount === 1 ? "pack" : "packs"}` : "";
  const date = day ? `${f.presale ? "pre-order, " : ""}TCGplayer lists ${day}` : "";
  const head = [packs, date].filter(Boolean).join(", ");
  const abroad = f.us ? null : (f.markets.find((m) => m.market !== "US" && m.listing) ?? null);
  const away = abroad?.listing ?? null;
  const listing = f.us
    ? `Cheapest US ${f.presale ? "pre-order " : ""}listing ${formatMoney(f.us.cents, f.us.currency)} ${sourceWord(f.us.source)}` +
      (f.us.perPackCents != null ? ` (${formatPerPack(f.us.perPackCents, f.us.currency)})` : "")
    : abroad && away
      ? `Listed in ${COUNTRIES[abroad.market].place} from ${formatMoney(away.cents, away.currency)} ${sourceWord(away.source)}`.trimEnd()
      : "";
  const listingShort = f.us
    ? `Cheapest US listing ${formatMoney(f.us.cents, f.us.currency)}`
    : abroad && away
      ? `Listed in ${COUNTRIES[abroad.market].place} from ${formatMoney(away.cents, away.currency)}`
      : "";
  // The market the stand-in listing already names as eBay's is not named twice.
  const ebayIn = f.ebayMarkets.filter((m) => !(away?.source === "ebay" && abroad?.market === m));
  const ebay = ebayIn.length ? `Tracked eBay listings in ${listJoin(ebayIn.map((m) => COUNTRIES[m].place))}` : "";
  const usRef = f.markets.find((m) => m.market === "US")?.reference ?? null;
  const reference = usRef ? `TCGplayer's market price ${formatMoney(usRef.cents, usRef.currency)}` : "";
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  // A released product's date is the first thing to go; a pre-order's stays,
  // since "when does it come out" is what its searchers ask.
  const lead = cap([packs, f.presale ? date : ""].filter(Boolean).join(", "));
  return ladder(
    name,
    [
      [cap(head), listing, ebay],
      [lead, listing, ebay],
      [cap(head), listing],
      [lead, listing],
      [lead, listingShort],
      [listingShort],
      [cap(packs)],
      [reference],
    ],
    "Updated daily.",
    `${name}. Updated daily.`,
  );
}

/**
 * "{Set}: 14 sealed products, TCGplayer lists Sep 2026: booster box from US$…, ETB
 * from US$…. Updated daily." In the visitor's market (the set page is
 * per-request); a crawler reads the US. "From" figures drop from the end
 * until it fits.
 */
export function setDescription(f: SetFacts): string {
  const name = squash(f.name);
  const month = formatMonth(f.releasedOn);
  // Release dates are always TCGplayer's, said as such, out or not.
  const when = month ? `, TCGplayer lists ${month}` : "";
  const head = `${name}: ${f.productCount} sealed ${f.productCount === 1 ? "product" : "products"}${when}`;
  const SHORT: Partial<Record<string, string>> = { "booster-box": "booster box", etb: "ETB", "pc-etb": "Pokémon Center ETB", "booster-bundle": "booster bundle" };
  // The UK shown in euros is a conversion, marked "≈" as on the page.
  const froms = f.cheapest.map((c) => `${SHORT[c.kind] ?? c.kind} from ${f.converted ? "≈ " : ""}${formatMoney(c.cents, f.currency)}`);
  for (let n = froms.length; n >= 1; n--) {
    const d = `${head}: ${listJoin(froms.slice(0, n))}. Updated daily.`;
    if (d.length <= DESCRIPTION_MAX) return d;
  }
  return `${head}. Updated daily.`;
}
