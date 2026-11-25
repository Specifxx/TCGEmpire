import { addDays, inRange, rangeStart, tagGroup, toDisplay, type ItemSale, type RangeKey, type SourceResult } from "./core";
import { formatMoney } from "../format";
import { AMAZON_STORES, amazonProductsKey, type AmazonStoredProducts } from "./amazon";

// WHAT IS SELLING, AND WHAT IS CLICKED (2026-11-25, owner: "the earnings dashboard
// also doesn't show the top products or sets that are selling … so we know what's in
// demand"). DECISIONS.md, "Top sellers on the earnings dashboard".
//
// SALES come from the networks' own item reports, never from our clicks:
//   eBay      Transaction Detail: one row per sale, with the listing's title (core.ts epnItemSales);
//   TCGplayer Impact's Action Listing (SKU) report: one row per order line, joined to its action (impactItemSales);
//   Amazon    the Reports page grouped by product, typed in by the daily Chrome run ("item" lines,
//             lib/earnings/amazon.ts): a total over the run's range, so it shows only in ranges that cover it.
// CLICKS (lib/earnings/top-clicks.ts) are what visitors pressed Buy on: a lead, not a sale, and labelled so.
//
// PURE: the page, the growth report and the tests hand in the rows.

export interface TopItem {
  key: string;
  name: string;
  networks: string[];
  sites: string[];
  orders: number;
  units: number;
  /** In the display currency. */
  saleCents: number;
  cents: number;
}

const NETWORK_LABEL: Record<ItemSale["network"], string> = { ebay: "eBay", tcgplayer: "TCGplayer", amazon: "Amazon" };

/** Two titles of one product fold together: case, punctuation and spacing ignored. */
export const itemKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// A SET IS A PRODUCT NAME WITHOUT ITS PRODUCT TYPE. No network says which set an
// item belongs to, so the set is read from the name: the box, pack, bundle and
// condition words are taken off and what is left ("pokemon prismatic evolutions")
// is the set. A best guess, labelled so on the page; a name that is nothing but
// product words has no set.
const PRODUCT_WORDS = [
  "\\d+\\s?(?:ct|count|pcs?|pieces|packs?|boxes)",
  "ultra premium collection",
  "premium collection",
  "special collection",
  "elite trainer box(?:es)?",
  "pokemon center",
  "booster box(?:es)?",
  "booster display",
  "display box",
  "booster bundle",
  "booster packs?",
  "sleeved booster",
  "blister packs?",
  "build (?:and|&) battle(?: box)?",
  "collector booster",
  "play booster",
  "set booster",
  "draft booster",
  "starter decks?",
  "theme decks?",
  "commander decks?",
  "bundle",
  "displays?",
  "cases?",
  "collection",
  "boxes",
  "box",
  "packs?",
  "tins?",
  "etb",
  "decks?",
  "factory sealed",
  "sealed",
  "brand new",
  "new",
  "english",
  "trading card game",
  "card game",
  "tcg",
  "ccg",
  "official",
  "in stock",
  "pre ?order",
  "free shipping",
  "\\d+\\s?(?:ct|count|pcs?|pieces|packs?|boxes|x)",
  "x\\s?\\d+",
];
const PRODUCT_RE = new RegExp(`\\b(?:${PRODUCT_WORDS.join("|")})\\b`, "g");

export function setOf(name: string): string {
  const left = itemKey(name).replace(PRODUCT_RE, " ").replace(/\s+/g, " ").trim();
  return left.length >= 3 ? left : "";
}

/** Whether a row belongs to the range: a day row by its day; a range row (Amazon) when the range covers most of it. */
export function itemInRange(it: Pick<ItemSale, "day" | "from">, range: RangeKey, today: string): boolean {
  if (!it.from) return inRange(it.day, range, today);
  const start = rangeStart(range, today);
  // Three days of slack: the Chrome run's range ends a day or two before today.
  return it.day <= today && (start == null || addDays(it.from, 3) >= start);
}

function rank(items: readonly ItemSale[], keyOf: (it: ItemSale) => string, nameOf: (it: ItemSale) => string, range: RangeKey, today: string, display: string, n: number): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const it of items) {
    if (!itemInRange(it, range, today)) continue;
    const key = keyOf(it);
    if (!key) continue;
    const row = m.get(key) ?? { key, name: nameOf(it), networks: [], sites: [], orders: 0, units: 0, saleCents: 0, cents: 0 };
    const net = NETWORK_LABEL[it.network];
    if (!row.networks.includes(net)) row.networks.push(net);
    const site = it.tag ? tagGroup(it.tag).label : "";
    if (site && !row.sites.includes(site)) row.sites.push(site);
    row.orders += it.orders;
    row.units += it.qty;
    row.saleCents += toDisplay(it.saleCents, it.currency, display);
    row.cents += toDisplay(it.cents, it.currency, display);
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.orders - a.orders || b.cents - a.cents || b.saleCents - a.saleCents).slice(0, n);
}

/** The products that sold most in the range (by orders, then commission). */
export function topProducts(items: readonly ItemSale[], range: RangeKey, today: string, display: string, n = 25): TopItem[] {
  return rank(items, (it) => itemKey(it.name), (it) => it.name, range, today, display, n);
}

/** The sets that sold most in the range (setOf each name). */
export function topSets(items: readonly ItemSale[], range: RangeKey, today: string, display: string, n = 15): TopItem[] {
  return rank(items, (it) => setOf(it.name), (it) => titleCase(setOf(it.name)), range, today, display, n);
}

export const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Every item row the sources carry, plus Amazon's stored product lines. */
export function allItems(sources: readonly Pick<SourceResult, "items">[], amazon: readonly AmazonStoredProducts[] = []): ItemSale[] {
  const out: ItemSale[] = sources.flatMap((s) => s.items ?? []);
  for (const a of amazon) {
    const store = AMAZON_STORES.find((s) => s.key === a.store);
    for (const p of a.products) {
      if (!p.items && !p.cents) continue;
      out.push({
        network: "amazon",
        day: a.to,
        from: a.from,
        tag: "",
        name: p.name,
        ...(p.asin ? { itemId: p.asin } : {}),
        qty: p.items,
        saleCents: 0,
        cents: p.cents,
        currency: store?.currency ?? a.currency,
        orders: p.items,
      });
    }
  }
  return out;
}

/** Which networks have item rows, so the page can say which ones are missing. */
export function itemCoverage(sources: readonly Pick<SourceResult, "key" | "items" | "status">[], amazon: readonly AmazonStoredProducts[]): { network: string; rows: number | null }[] {
  const of = (k: string) => sources.find((s) => s.key === k);
  return [
    { network: "eBay", rows: of("ebay")?.items ? of("ebay")!.items!.length : null },
    { network: "TCGplayer", rows: of("tcgplayer")?.items ? of("tcgplayer")!.items!.length : null },
    { network: "Amazon", rows: amazon.length ? amazon.reduce((n, a) => n + a.products.length, 0) : null },
  ];
}

export const AMAZON_PRODUCT_KEYS = AMAZON_STORES.map((s) => amazonProductsKey(s.key));

// ── Clicks (lib/earnings/top-clicks.ts reads them; these are the pure parts) ──
export interface ClickItem {
  /** The product's key on its site (its slug), or for a views row its page path. */
  key: string;
  d28: number;
  d7: number;
}
export interface ClickSite {
  site: string;
  label: string;
  status: "ok" | "partial" | "not-configured" | "error";
  /** "clicks": buy clicks per product. "views": no click events, so product page views. */
  kind: "clicks" | "views";
  items: ClickItem[];
}
export interface TopClicks {
  fetchedAt: number;
  sites: ClickSite[];
}

/** The top `n` of a [28d, 7d] map, biggest first. Pure. */
export function topOf(m: Record<string, [number, number]>, n = 25): ClickItem[] {
  return Object.entries(m)
    .map(([key, [d28, d7]]) => ({ key, d28, d7 }))
    .filter((x) => x.d28 > 0 || x.d7 > 0)
    .sort((a, b) => b.d28 - a.d28 || b.d7 - a.d7)
    .slice(0, n);
}

/** A slug or path as a readable name: "/sealed/origins-booster-box" -> "Origins Booster Box". Pure. */
export function itemLabel(key: string): string {
  const last = key.split("?")[0].split("/").filter(Boolean).pop() ?? key;
  return decodeURIComponent(last)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Every site's clicks in one list, biggest first (views rows left out: they are not clicks). Pure. */
export function topClickedOverall(t: TopClicks | null, n = 30): (ClickItem & { site: string; label: string })[] {
  if (!t) return [];
  return t.sites
    .filter((s) => s.kind === "clicks")
    .flatMap((s) => s.items.map((i) => ({ ...i, site: s.site, label: s.label })))
    .sort((a, b) => b.d28 - a.d28 || b.d7 - a.d7)
    .slice(0, n);
}


// ── The growth report's section (the email the agents read: no browser needed) ──
/** Plain text: products and sets sold in the last 30 days (sales), then the most-clicked items (clicks). Pure. */
export function sellingReportText(items: readonly ItemSale[], clicks: TopClicks | null, today: string, display = "AUD", money: (c: number) => string = (c) => formatMoney(c, display)): string {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).padEnd(n);
  const sold = (rows: TopItem[]) =>
    rows.length
      ? rows.map((r, i) => `${String(i + 1).padStart(2)}. ${cut(r.name, 58)} ${String(r.orders).padStart(4)} orders  ${money(r.cents).padStart(10)}  ${r.networks.join("/")}  ${r.sites.join(", ") || "no tag"}`).join("\n")
      : "    (no item-level sales yet)";
  const products = topProducts(items, "30d", today, display, 15);
  const sets = topSets(items, "30d", today, display, 10);
  const week = topProducts(items, "7d", today, display, 10);
  const clicked = topClickedOverall(clicks, 20);
  const lines = [
    "WHAT'S SELLING · SALES (orders the networks reported, item by item; last 30 days; amounts are our commission)",
    sold(products),
    "",
    "Top products sold, last 7 days",
    sold(week),
    "",
    "Top sets sold, last 30 days (set = product name without box/pack words, a best guess)",
    sold(sets),
    "",
    "MOST CLICKED · BUY CLICKS, NOT SALES (every site, last 28 days / last 7 days)",
    clicked.length ? clicked.map((c, i) => `${String(i + 1).padStart(2)}. ${cut(itemLabel(c.key), 58)} ${String(c.d28).padStart(5)} / ${String(c.d7).padStart(4)}  ${c.label}`).join("\n") : "    (clicks not read yet)",
  ];
  return lines.join("\n");
}
