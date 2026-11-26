// "Cheapest on RiftCompare" — the monthly record of which store had the lowest price, and the badge a store
// can put on its own site to say so (2026-11-26, owner; DECISIONS.md "Monthly cheapest-price badges for stores").
//
// WHAT COUNTS AS A WIN. Once a day, from the morning's public sealed snapshot (data/public/sealed-listings.json,
// never Neon), for every sealed product in every market: the in-stock store rows (no eBay, no TCGplayer, no
// Cardmarket or other reference rows, no zero prices), one row per store at that store's lowest price. A product
// is CONTESTED in a market when two or more stores have it in stock that day, and the store or stores at the lowest
// price WIN it (a tie is a win for each). An uncontested product is never a win: being the only shop with stock is
// not being the cheapest. Prices are compared only inside one market, so only in one currency; nothing is converted.
//
// THE MONTH. data/store-wins/<YYYY-MM>.json (UTC month) holds, per store, how many days it won each product and how
// many days each product was contested for it. The badge's number is the count of DIFFERENT products a store was
// cheapest on, on at least one day of the month; the store page shows the same number, the products and the days,
// so anyone can check the claim. A day is added once (the first snapshot of a UTC day wins), so re-running the
// recorder never double-counts.
//
// THE BADGE. Plain HTML and inline SVG, never an iframe or an image we host: the link must sit on the store's own
// page to earn them anything (lib/store-badge.ts explains). It links to the store's own page here, where the claim
// is shown with its products. Only for a COMPLETE month and only with MIN_BADGE_WINS products or more.
//
// Pure except readStoreWins / listStoreWinMonths, which read the committed files (tests point STORE_WINS_DIR at a
// fixture).
import fs from "node:fs";
import path from "node:path";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import { SITE_URL } from "./site";

export const STORE_WINS_DIR = process.env.STORE_WINS_DIR || path.join(process.cwd(), "data", "store-wins");

/** A store needs at least this many different products in a month for a badge (one lucky day is not a claim). */
export const MIN_BADGE_WINS = 3;

export const STORE_WINS_BASIS =
  "For each sealed product in each market, on each UTC day of the month: the store or stores with the lowest in-stock price, " +
  "counted only when two or more stores had it in stock that day. Store prices only (no eBay, TCGplayer or Cardmarket), in the market's own currency.";

export interface WinsRow {
  groupKey: string;
  title: string;
  productType: string;
  retailer: string;
  retailerName: string;
  priceCents: number;
  inStock: boolean;
  country: string;
}

export interface StoreMonth {
  name: string;
  country: string;
  /** groupKey → days this store had the lowest price for it. */
  wins: Record<string, number>;
  /** groupKey → days the product was contested while this store had it in stock. */
  contested: Record<string, number>;
}

export interface StoreWinsMonth {
  month: string;
  basis: string;
  /** UTC days recorded, ascending. */
  days: string[];
  /** groupKey → its title, for the store page's list. */
  products: Record<string, { title: string; productType: string }>;
  /** retailer key → that store's month. */
  stores: Record<string, StoreMonth>;
}

const MARKETPLACE = new Set(ALL_FALLBACK_RETAILERS);
export const isStoreRow = (r: Pick<WinsRow, "retailer">): boolean =>
  !r.retailer.startsWith("ebay") && !r.retailer.startsWith("tcgplayer") && !r.retailer.startsWith("amazon") && !MARKETPLACE.has(r.retailer);

export const monthOf = (day: string): string => day.slice(0, 7);

export function emptyMonth(month: string): StoreWinsMonth {
  return { month, basis: STORE_WINS_BASIS, days: [], products: {}, stores: {} };
}

/** One day's result: for each store, the products it was cheapest on and the products it competed on. */
export function dayWins(rows: readonly WinsRow[]) {
  // (market, product) → store → that store's lowest in-stock price.
  const offers = new Map<string, Map<string, number>>();
  const names = new Map<string, { name: string; country: string }>();
  const titles = new Map<string, { title: string; productType: string }>();
  for (const r of rows) {
    if (!r.inStock || !isStoreRow(r) || !Number.isFinite(r.priceCents) || r.priceCents <= 0 || !r.groupKey || !r.country) continue;
    const k = `${r.country}\u0000${r.groupKey}`;
    let m = offers.get(k);
    if (!m) offers.set(k, (m = new Map()));
    const prev = m.get(r.retailer);
    if (prev === undefined || r.priceCents < prev) m.set(r.retailer, r.priceCents);
    if (!names.has(r.retailer)) names.set(r.retailer, { name: r.retailerName || r.retailer, country: r.country });
    if (!titles.has(r.groupKey)) titles.set(r.groupKey, { title: r.title, productType: r.productType });
  }
  const stores = new Map<string, { name: string; country: string; won: Set<string>; contested: Set<string> }>();
  const touch = (retailer: string) => {
    let s = stores.get(retailer);
    if (!s) stores.set(retailer, (s = { ...names.get(retailer)!, won: new Set(), contested: new Set() }));
    return s;
  };
  for (const [k, m] of offers) {
    if (m.size < 2) continue;
    const groupKey = k.slice(k.indexOf("\u0000") + 1);
    const low = Math.min(...m.values());
    for (const [retailer, cents] of m) {
      const s = touch(retailer);
      s.contested.add(groupKey);
      if (cents === low) s.won.add(groupKey);
    }
  }
  return { stores, titles };
}

/** Add one UTC day to its month. Returns the month unchanged when that day is already recorded. */
export function addDay(month: StoreWinsMonth, day: string, rows: readonly WinsRow[]): StoreWinsMonth {
  if (monthOf(day) !== month.month) throw new Error(`day ${day} is not in ${month.month}`);
  if (month.days.includes(day)) return month;
  const next: StoreWinsMonth = structuredClone(month);
  next.basis = STORE_WINS_BASIS;
  next.days = [...next.days, day].sort();
  const { stores, titles } = dayWins(rows);
  for (const [retailer, s] of stores) {
    const m = (next.stores[retailer] ??= { name: s.name, country: s.country, wins: {}, contested: {} });
    m.name = s.name;
    m.country = s.country;
    for (const g of s.contested) m.contested[g] = (m.contested[g] ?? 0) + 1;
    for (const g of s.won) {
      m.wins[g] = (m.wins[g] ?? 0) + 1;
      if (!next.products[g]) next.products[g] = titles.get(g)!;
    }
  }
  // Keys in a stable order, so a day's commit diffs cleanly.
  next.stores = Object.fromEntries(Object.entries(next.stores).sort(([a], [b]) => a.localeCompare(b)));
  next.products = Object.fromEntries(Object.entries(next.products).sort(([a], [b]) => a.localeCompare(b)));
  return next;
}

export interface StoreWinSummary {
  retailer: string;
  name: string;
  country: string;
  /** Different products this store was cheapest on, on at least one day. */
  products: number;
  /** Different products it competed on (in stock against another store). */
  contested: number;
  /** Store-days at the lowest price, summed over products: the tie-breaker. */
  winDays: number;
  /** Rank in its own market by products, then win-days (1 = most). */
  rankInMarket: number;
  storesInMarket: number;
  /** Its products, most days first: groupKey, title, days cheapest. */
  top: { groupKey: string; title: string; productType: string; days: number }[];
}

/** Every store with at least one win, ranked within its market. */
export function summarise(month: StoreWinsMonth): StoreWinSummary[] {
  const rows = Object.entries(month.stores)
    .map(([retailer, s]) => {
      const won = Object.entries(s.wins).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
      return {
        retailer,
        name: s.name,
        country: s.country,
        products: won.length,
        contested: Object.keys(s.contested).length,
        winDays: won.reduce((t, [, d]) => t + d, 0),
        rankInMarket: 0,
        storesInMarket: 0,
        top: won.map(([groupKey, days]) => ({ groupKey, days, ...(month.products[groupKey] ?? { title: groupKey, productType: "" }) })),
      };
    })
    .filter((r) => r.products > 0);
  const byMarket = new Map<string, StoreWinSummary[]>();
  for (const r of rows) {
    const list = byMarket.get(r.country) ?? [];
    list.push(r);
    byMarket.set(r.country, list);
  }
  for (const list of byMarket.values()) {
    list.sort((a, b) => b.products - a.products || b.winDays - a.winDays || a.name.localeCompare(b.name));
    // Competition ranking: equal products and win-days share a rank.
    list.forEach((r, i) => {
      const prev = list[i - 1];
      r.rankInMarket = prev && prev.products === r.products && prev.winDays === r.winDays ? prev.rankInMarket : i + 1;
      r.storesInMarket = list.length;
    });
  }
  return rows.sort((a, b) => b.products - a.products || b.winDays - a.winDays || a.name.localeCompare(b.name));
}

/** "2026-11" → "November 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The newest month that has ended by `now` (UTC). */
export function lastCompleteMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

// ── Files ────────────────────────────────────────────────────────────────────

const MONTH_FILE = /^(\d{4}-\d{2})\.json$/;

export function listStoreWinMonths(dir = STORE_WINS_DIR): string[] {
  try {
    return fs
      .readdirSync(dir)
      .map((f) => MONTH_FILE.exec(f)?.[1])
      .filter((m): m is string => !!m)
      .sort();
  } catch {
    return [];
  }
}

/** A month's file, or null when there is none. A file that exists but cannot be read throws. */
export function readStoreWins(month: string, dir = STORE_WINS_DIR): StoreWinsMonth | null {
  const file = path.join(dir, `${month}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as StoreWinsMonth;
}

/** The month a badge is offered for: the last complete month, if it was recorded. */
export function badgeMonth(now = new Date(), dir = STORE_WINS_DIR): StoreWinsMonth | null {
  return readStoreWins(lastCompleteMonth(now), dir);
}

/** One store's badge claim for a month, or null when it does not qualify. */
export function storeClaim(month: StoreWinsMonth | null, retailer: string): StoreWinSummary | null {
  if (!month) return null;
  const s = summarise(month).find((r) => r.retailer === retailer);
  return s && s.products >= MIN_BADGE_WINS ? s : null;
}

// ── The badge ────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type BadgeTheme = "dark" | "light";

const THEMES: Record<BadgeTheme, { bg: string; border: string; ink: string; muted: string; accent: string; ring: string }> = {
  dark: { bg: "#06141c", border: "#1d3a46", ink: "#f1f5f9", muted: "#94a3b8", accent: "#34d17e", ring: "#0d2a22" },
  light: { bg: "#ffffff", border: "#d5e3dc", ink: "#0f1f2b", muted: "#55667a", accent: "#128a49", ring: "#e3f6eb" },
};

/** A rosette: a ring of points around a disc with a tick. 36px, inline, nothing fetched. */
function rosette(t: (typeof THEMES)[BadgeTheme]): string {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    const r = i % 2 === 0 ? 17 : 14.6;
    pts.push(`${(18 + r * Math.cos(a)).toFixed(2)},${(18 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    `<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false" style="display:block;flex:none;width:36px;height:36px">` +
    `<polygon points="${pts.join(" ")}" fill="${t.accent}"/>` +
    `<circle cx="18" cy="18" r="11.5" fill="${t.ring}"/>` +
    `<path d="M12.6 18.4l3.6 3.6 7.2-7.6" fill="none" stroke="${t.accent}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export interface BadgeInput {
  slug: string;
  name: string;
  /** "2026-11" */
  month: string;
  /** Different products cheapest on. */
  products: number;
  theme?: BadgeTheme;
}

/**
 * The badge a store pastes on its own site. Every style is inline and every property a host stylesheet might set on
 * an `a`, `span` or `svg` is set here, so it looks the same on any shop theme. 320px wide at most, one link.
 */
export function cheapestBadgeHtml({ slug, name, month, products, theme = "dark" }: BadgeInput): string {
  const t = THEMES[theme];
  const label = monthLabel(month);
  const href = `${SITE_URL}/stores/${encodeURIComponent(slug)}`;
  const title = `${name} had the cheapest price on ${products} Riftbound products in ${label}, compared by RiftCompare`;
  const font = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const reset = `margin:0;padding:0;border:0;background:none;text-transform:none;letter-spacing:normal;text-align:left;text-decoration:none;font-style:normal;font-family:${font};`;
  return (
    `<a href="${href}" title="${esc(title)}" style="${reset}box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;` +
    `max-width:320px;padding:9px 14px 9px 10px;border:1px solid ${t.border};border-radius:12px;background:${t.bg};` +
    `box-shadow:0 1px 2px rgba(0,0,0,.08);color:${t.ink};line-height:1.2">` +
    rosette(t) +
    `<span style="${reset}display:flex;flex-direction:column;gap:2px;min-width:0">` +
    `<span style="${reset}color:${t.accent};font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">Cheapest price · ${esc(label)}</span>` +
    `<span style="${reset}color:${t.ink};font-size:14px;font-weight:700">on ${products} Riftbound products</span>` +
    `<span style="${reset}color:${t.muted};font-size:11px;font-weight:500">Compared daily by RiftCompare</span>` +
    `</span></a>`
  );
}
