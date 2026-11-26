import { inRange, tagGroup, toDisplay, type ItemSale, type RangeKey, type TagDay } from "./core";
import { itemKey, setOf, titleCase } from "./top-items";

// EARNINGS, SALES AND CLICKS BY PRODUCT AND SET, FOR DEXCOMPARE AND MTG COMPARE
// (owner, 2026-11-26: "earnings are only by link placement tag, never by product or set …
// a view for DexCompare and MTG Compare that shows earnings, clicks and sales by product
// and set for the last 30 days, split by TCGplayer and eBay, plus Amazon clicks by
// product. Read only"). DECISIONS.md, "Earnings by product and set".
//
// Neither network says which of OUR products a sale came from: the sub-ids name the site,
// market and placement (mtg-us-product-table), never the product. So the two halves are
// joined here, and the page says how:
//   SALES   the networks' own item rows (lib/earnings/top-items.ts): eBay's Transaction
//           Detail titles and TCGplayer's SKU lines, kept to the rows whose tag belongs to
//           the site (tagGroup). Each is matched to ONE catalogue product when every word of
//           that product's name is in the sale's title and no other product of the same
//           length also fits; a tie or no fit stays unmatched, listed under its own name.
//   CLICKS  Vercel Web Analytics buy clicks by the product page they were pressed on
//           (lib/earnings/product-clicks.ts), per network by the click's `retailer`.
//           A click on a list page (the quick view) has no product page and is counted
//           only in the gaps.
// What cannot be attributed is shown, never spread: untagged sales (about a fifth of
// eBay's), sales whose item has no name, and clicks off product pages.
//
// PURE: the page and the tests hand everything in.

export type ProductSite = "dex" | "mtg";
export const PRODUCT_SITES: { key: ProductSite; label: string; game: string }[] = [
  { key: "mtg", label: "MTG Compare", game: "Magic" },
  { key: "dex", label: "DexCompare", game: "Pokémon" },
];
export const isProductSite = (s: unknown): s is ProductSite => s === "dex" || s === "mtg";

/** Words that name the game, not the product: taken off both sides before matching. */
const GAME_WORDS: Record<ProductSite, RegExp> = {
  mtg: /\b(?:magic the gathering|magic gathering|magic|mtg|wizards of the coast|wotc)\b/g,
  dex: /\b(?:pokemon|pok mon|the pokemon company|pkmn|ptcg)\b/g,
};
/** Does an item's name look like this site's game? Only for the untagged-sales gap (never attributes a sale). */
export function looksLikeGame(site: ProductSite, name: string): boolean {
  return new RegExp(GAME_WORDS[site].source).test(itemKey(name));
}

const STOP = new Set(["the", "of", "and", "a", "an", "x", "with", "for", "in", "edition"]);
/** A name as its significant words, game words removed. Pure. */
export function words(site: ProductSite, name: string): string[] {
  const k = itemKey(name.replace(/['’]/g, "")).replace(GAME_WORDS[site], " ");
  return [...new Set(k.split(" ").filter((w) => w && !STOP.has(w)))];
}

export interface CatalogProduct {
  slug: string;
  name: string;
  type?: string;
  setCode?: string | null;
}

/** A set's key and label for a catalogue product. Products sharing a set code share a set; the
 *  shortest name their titles reduce to is its label ("Final Fantasy"). No code: the product type. */
export function setIndex(site: ProductSite, catalog: readonly CatalogProduct[]): Map<string, { key: string; label: string }> {
  const byCode = new Map<string, string>();
  for (const p of catalog) {
    if (!p.setCode) continue;
    const s = setName(site, p.name);
    if (!s) continue;
    const prev = byCode.get(p.setCode);
    if (!prev || s.length < prev.length) byCode.set(p.setCode, s);
  }
  const out = new Map<string, { key: string; label: string }>();
  for (const p of catalog) {
    const label = p.setCode && byCode.get(p.setCode) ? titleCase(byCode.get(p.setCode)!) : p.type ? `No set · ${p.type}` : titleCase(setName(site, p.name)) || "No set";
    out.set(p.slug, { key: p.setCode ? `code:${p.setCode}` : `label:${label.toLowerCase()}`, label });
  }
  return out;
}

/** The set part of a name: the words before " - " or ":" when there is one, then setOf without game words. */
export function setName(site: ProductSite, raw: string): string {
  const name = raw.replace(/['’]/g, ""); // "Assassin's Creed", not "Assassin S Creed"
  const head = name.split(/\s[-–—]\s|:\s|\s\[|\s\(/)[0] || name;
  return setOf(itemKey(head).replace(GAME_WORDS[site], " ").replace(/\s+/g, " ").trim()) || setOf(itemKey(name).replace(GAME_WORDS[site], " "));
}

export interface ProductMatcher {
  match(name: string): CatalogProduct | null;
}

/** The catalogue product a sale is: every word of the product's name in the sale's name, the most
 *  words winning, and a tie between two products is no match. At least two words. Pure. */
export function productMatcher(site: ProductSite, catalog: readonly CatalogProduct[]): ProductMatcher {
  const entries = catalog.map((p) => ({ p, w: words(site, p.name) })).filter((e) => e.w.length >= 2);
  // Index by a rare word so a match does not scan the whole catalogue.
  const freq = new Map<string, number>();
  for (const e of entries) for (const w of e.w) freq.set(w, (freq.get(w) ?? 0) + 1);
  const byWord = new Map<string, typeof entries>();
  for (const e of entries) {
    const rare = [...e.w].sort((a, b) => (freq.get(a) ?? 0) - (freq.get(b) ?? 0))[0];
    byWord.set(rare, [...(byWord.get(rare) ?? []), e]);
  }
  const cache = new Map<string, CatalogProduct | null>();
  return {
    match(name: string) {
      const key = itemKey(name);
      if (cache.has(key)) return cache.get(key)!;
      const have = new Set(words(site, name));
      let best: CatalogProduct | null = null;
      let bestN = 0;
      let tie = false;
      for (const w of have) {
        for (const e of byWord.get(w) ?? []) {
          if (!e.w.every((x) => have.has(x))) continue;
          if (e.w.length > bestN) (best = e.p), (bestN = e.w.length), (tie = false);
          else if (e.w.length === bestN && e.p.slug !== best?.slug) tie = true;
        }
      }
      const out = tie ? null : best;
      cache.set(key, out);
      return out;
    },
  };
}

// ── Clicks ────────────────────────────────────────────────────────────────────
export type ClickNetwork = "tcgplayer" | "ebay" | "amazon";
/** Which network a buy_click `retailer` value is ("TCGplayer", "eBay (ebay.com.au)", "Amazon AU"); a store is null. */
export function retailerNetwork(retailer: string): ClickNetwork | null {
  const r = retailer.toLowerCase();
  if (/tcg ?player/.test(r)) return "tcgplayer";
  if (/\bebay\b|^ebay/.test(r)) return "ebay";
  if (/amazon|amzn/.test(r)) return "amazon";
  return null;
}

/** The product slug of a product page path ("/us/p/final-fantasy-play-booster-box"), else null. */
export function slugOfPath(path: string): string | null {
  const m = /^\/[a-z]{2}\/p\/([^/?#]+)\/?$/.exec(path.split("?")[0]);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface SiteProductClicks {
  site: ProductSite;
  status: "ok" | "partial" | "not-configured" | "error";
  detail?: string;
  fetchedAt: number;
  /** The window, inclusive UTC days. */
  from: string;
  to: string;
  /** Every buy click by the page it was pressed on (path → clicks), or null when Vercel refused the query. */
  byPath: Record<string, number> | null;
  /** Per network: path → clicks, or null when Vercel refused the per-retailer query. */
  byNetwork: Record<ClickNetwork, Record<string, number> | null>;
  /** Every buy click by retailer value (to show which values were counted as which network). */
  retailers: Record<string, number>;
  /** DexCompare's buy_product {product} clicks (all networks, quick view included), when the site sends them. */
  byProduct: Record<string, number>;
  /** The catalogue, trimmed, for names and sale matching. */
  catalog: CatalogProduct[];
  catalogStatus: "ok" | "error";
}
export interface ProductClicks {
  fetchedAt: number;
  sites: SiteProductClicks[];
}

/** Sum a path → clicks map into slug → clicks (all regions' pages of one product together), and what was off product pages. Pure. */
export function clicksBySlug(byPath: Record<string, number> | null): { slugs: Map<string, number>; offProduct: number; total: number } {
  const slugs = new Map<string, number>();
  let offProduct = 0;
  let total = 0;
  for (const [path, n] of Object.entries(byPath ?? {})) {
    total += n;
    const slug = slugOfPath(path);
    if (slug) slugs.set(slug, (slugs.get(slug) ?? 0) + n);
    else offProduct += n;
  }
  return { slugs, offProduct, total };
}

// ── The view ──────────────────────────────────────────────────────────────────
export interface NetCell {
  clicks: number;
  orders: number;
  units: number;
  /** In the display currency. */
  saleCents: number;
  cents: number;
}
const cell = (): NetCell => ({ clicks: 0, orders: 0, units: 0, saleCents: 0, cents: 0 });

export interface ProductRow {
  key: string;
  name: string;
  /** Our product page, when the row is a catalogue product. */
  slug: string | null;
  set: string;
  setKey: string;
  tcgplayer: NetCell;
  ebay: NetCell;
  amazonClicks: number;
  /** All buy clicks on the product's pages (every network and store). */
  allClicks: number;
  /** DexCompare's buy_product clicks (quick view included), when sent. */
  productClicks: number;
}

export interface SiteGaps {
  /** Earned in the range under this site's tags, per network, from the tag totals (every sale, named or not). */
  taggedCents: Record<"tcgplayer" | "ebay", number>;
  taggedSales: Record<"tcgplayer" | "ebay", number>;
  /** Of that, what the item rows in this view cover. */
  itemCents: Record<"tcgplayer" | "ebay", number>;
  itemOrders: Record<"tcgplayer" | "ebay", number>;
  /** Item rows of this site that no catalogue product matched (still in the table, by their own name). */
  unmatchedOrders: number;
  unmatchedCents: number;
  /** Untagged sales in the range (no customid / sharedid): no site can claim them. */
  untagged: Record<"tcgplayer" | "ebay", { sales: number; cents: number; gameSales: number; gameCents: number }>;
  /** Buy clicks the product table cannot place. */
  clicksTotal: number | null;
  clicksOffProduct: number | null;
  /** Per network, clicks on product pages vs everywhere (null when Vercel refused). */
  netClicks: Record<ClickNetwork, { onProduct: number; total: number } | null>;
}

export interface ProductEarningsView {
  site: ProductSite;
  products: ProductRow[];
  sets: ProductRow[];
  totals: { tcgplayer: NetCell; ebay: NetCell; amazonClicks: number; allClicks: number };
  gaps: SiteGaps;
}

export interface ViewInput {
  site: ProductSite;
  items: readonly ItemSale[];
  /** Each network's tag rows (source.tags), for the totals every sale counts in. */
  tags: { tcgplayer: readonly TagDay[]; ebay: readonly TagDay[] };
  clicks: SiteProductClicks | null;
  range: RangeKey;
  today: string;
  display: string;
}

export function productEarnings({ site, items, tags, clicks, range, today, display }: ViewInput): ProductEarningsView {
  const catalog = clicks?.catalog ?? [];
  const sets = setIndex(site, catalog);
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const matcher = productMatcher(site, catalog);
  const rows = new Map<string, ProductRow>();
  const rowFor = (p: CatalogProduct | null, name: string): ProductRow => {
    const key = p ? `p:${p.slug}` : `n:${itemKey(name)}`;
    let r = rows.get(key);
    if (!r) {
      const s = p ? sets.get(p.slug) : null;
      const guess = setName(site, name);
      r = {
        key,
        name: p ? p.name : name,
        slug: p ? p.slug : null,
        set: s?.label ?? (guess ? `${titleCase(guess)} (unmatched)` : "Unmatched"),
        setKey: s?.key ?? `guess:${guess}`,
        tcgplayer: cell(),
        ebay: cell(),
        amazonClicks: 0,
        allClicks: 0,
        productClicks: 0,
      };
      rows.set(key, r);
    }
    return r;
  };

  const gaps: SiteGaps = {
    taggedCents: { tcgplayer: 0, ebay: 0 },
    taggedSales: { tcgplayer: 0, ebay: 0 },
    itemCents: { tcgplayer: 0, ebay: 0 },
    itemOrders: { tcgplayer: 0, ebay: 0 },
    unmatchedOrders: 0,
    unmatchedCents: 0,
    untagged: { tcgplayer: { sales: 0, cents: 0, gameSales: 0, gameCents: 0 }, ebay: { sales: 0, cents: 0, gameSales: 0, gameCents: 0 } },
    clicksTotal: null,
    clicksOffProduct: null,
    netClicks: { tcgplayer: null, ebay: null, amazon: null },
  };

  // Sales: this site's item rows.
  for (const it of items) {
    if (it.network === "amazon" || !inRange(it.day, range, today)) continue;
    const net = it.network;
    const cents = toDisplay(it.cents, it.currency, display);
    if (!it.tag) {
      // Counted from the tag totals below; here only whether the item looks like this game.
      if (looksLikeGame(site, it.name)) (gaps.untagged[net].gameSales += it.orders), (gaps.untagged[net].gameCents += cents);
      continue;
    }
    if (tagGroup(it.tag).key !== site) continue;
    const p = matcher.match(it.name);
    const r = rowFor(p, it.name);
    const c = r[net];
    c.orders += it.orders;
    c.units += it.qty;
    c.saleCents += toDisplay(it.saleCents, it.currency, display);
    c.cents += cents;
    gaps.itemCents[net] += cents;
    gaps.itemOrders[net] += it.orders;
    if (!p) (gaps.unmatchedOrders += it.orders), (gaps.unmatchedCents += cents);
  }

  // The tag totals: every sale, named or not, so the page can say what the item rows cover.
  for (const net of ["tcgplayer", "ebay"] as const) {
    for (const t of tags[net]) {
      if (!inRange(t.day, range, today)) continue;
      const cents = toDisplay(t.cents, t.currency, display);
      if (!t.tag) (gaps.untagged[net].sales += t.sales), (gaps.untagged[net].cents += cents);
      else if (tagGroup(t.tag).key === site) (gaps.taggedSales[net] += t.sales), (gaps.taggedCents[net] += cents);
    }
  }

  // Clicks: by product page.
  if (clicks) {
    const all = clicksBySlug(clicks.byPath);
    if (clicks.byPath) (gaps.clicksTotal = all.total), (gaps.clicksOffProduct = all.offProduct);
    for (const [slug, n] of all.slugs) rowFor(bySlug.get(slug) ?? { slug, name: slugLabel(slug) }, slugLabel(slug)).allClicks += n;
    for (const net of ["tcgplayer", "ebay", "amazon"] as const) {
      const m = clicks.byNetwork[net];
      if (!m) continue;
      const c = clicksBySlug(m);
      gaps.netClicks[net] = { onProduct: c.total - c.offProduct, total: c.total };
      for (const [slug, n] of c.slugs) {
        const r = rowFor(bySlug.get(slug) ?? { slug, name: slugLabel(slug) }, slugLabel(slug));
        if (net === "amazon") r.amazonClicks += n;
        else r[net].clicks += n;
      }
    }
    for (const [slug, n] of Object.entries(clicks.byProduct)) rowFor(bySlug.get(slug) ?? { slug, name: slugLabel(slug) }, slugLabel(slug)).productClicks += n;
  }

  const products = [...rows.values()].sort(byWorth);
  const setRows = new Map<string, ProductRow>();
  for (const r of products) {
    const s = setRows.get(r.setKey) ?? { ...emptyRow(r.setKey, r.set), set: r.set, setKey: r.setKey };
    addRow(s, r);
    setRows.set(r.setKey, s);
  }
  const totals = { tcgplayer: cell(), ebay: cell(), amazonClicks: 0, allClicks: 0 };
  for (const r of products) {
    addCell(totals.tcgplayer, r.tcgplayer);
    addCell(totals.ebay, r.ebay);
    totals.amazonClicks += r.amazonClicks;
    totals.allClicks += r.allClicks;
  }
  return { site, products, sets: [...setRows.values()].sort(byWorth), totals, gaps };
}

const emptyRow = (key: string, name: string): ProductRow => ({ key, name, slug: null, set: name, setKey: key, tcgplayer: cell(), ebay: cell(), amazonClicks: 0, allClicks: 0, productClicks: 0 });
function addCell(a: NetCell, b: NetCell) {
  a.clicks += b.clicks;
  a.orders += b.orders;
  a.units += b.units;
  a.saleCents += b.saleCents;
  a.cents += b.cents;
}
function addRow(a: ProductRow, b: ProductRow) {
  addCell(a.tcgplayer, b.tcgplayer);
  addCell(a.ebay, b.ebay);
  a.amazonClicks += b.amazonClicks;
  a.allClicks += b.allClicks;
  a.productClicks += b.productClicks;
}
/** Earnings first, then orders, then clicks. */
function byWorth(a: ProductRow, b: ProductRow): number {
  const earned = (r: ProductRow) => r.tcgplayer.cents + r.ebay.cents;
  const orders = (r: ProductRow) => r.tcgplayer.orders + r.ebay.orders;
  const clicks = (r: ProductRow) => Math.max(r.allClicks, r.productClicks, r.tcgplayer.clicks + r.ebay.clicks + r.amazonClicks);
  return earned(b) - earned(a) || orders(b) - orders(a) || clicks(b) - clicks(a) || a.name.localeCompare(b.name);
}

/** A slug as a readable name, for a clicked product the catalogue no longer lists. */
export const slugLabel = (slug: string) => titleCase(slug.replace(/[-_]+/g, " ").trim());

/** Earnings per click for a network cell, in display cents (null without clicks). */
export const perClick = (c: NetCell): number | null => (c.clicks ? Math.round(c.cents / c.clicks) : null);
