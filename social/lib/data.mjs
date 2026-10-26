// Read the site's public data (data/public, data/price-history) and pick what a
// social post shows. Pure reads of committed files: no database, no network.
// Every number here is one the site itself shows, on the same basis.
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

// Same guards as the site's /movers (src/lib/price-history.ts computePriceMovers):
// nothing under US$3, and a one-week swing of +300% or -80% is a mismatched
// listing far more often than a real move, so it is never shown.
const MIN_CENTS = 300;
const OUTLIER_SPIKE = 300;
const OUTLIER_DROP = 80;

export const SETS = {
  OGN: { name: "Origins", slug: "origins" },
  OGS: { name: "Proving Grounds", slug: "proving-grounds" },
  SFD: { name: "Spiritforged", slug: "spiritforged" },
  UNL: { name: "Unleashed", slug: "unleashed" },
  VEN: { name: "Vendetta", slug: "vendetta" },
  RAD: { name: "Radiance", slug: "radiance" },
  LGC: { name: "Legacy", slug: "legacy" },
};

let _cards;
export function cards() {
  _cards ??= new Map(read("data/public/cards.json").map((c) => [c.id, c]));
  return _cards;
}

export function historyDays(kind = "cards") {
  return fs.readdirSync(path.join(ROOT, "data/price-history", kind)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
}
export const historyDay = (day, kind = "cards") => read(`data/price-history/${kind}/${day}.json`).prices;

// Card art: the site's own copy in public/card-art when it has one, else the
// image CDN (fine on a laptop or in Actions; the cloud sandbox blocks it).
export function cardArt(card) {
  const base = card.imageThumbUrl ? path.basename(card.imageThumbUrl) : null;
  if (base && fs.existsSync(path.join(ROOT, "public/card-art", base))) return { local: path.join(ROOT, "public/card-art", base) };
  return card.imageUrl ? { remote: card.imageUrl } : null;
}

export function cardLabel(c) {
  const tags = [];
  if (c.isOvernumbered) tags.push("Overnumbered");
  if (c.variant && /^[a-z]$/i.test(c.variant) && c.type !== "Rune") tags.push("Alt art");
  if (/\*/.test(c.collectorNumber ?? "")) tags.push("Signature");
  return { name: c.name, number: c.collectorNumber, set: SETS[c.setCode]?.name ?? c.setName, rarity: c.rarity, tags };
}

const usable = (c, opts) => c && !c.isPromo && (opts.remoteArt ? cardArt(c) : cardArt(c)?.local);

// Seven-day movers on the /movers basis: cheapest in-stock listing for the card
// across the AU, US, UK and SG stores each Sydney day, in US cents.
export function movers({ limit = 5, set, remoteArt = false } = {}) {
  const days = historyDays();
  const today = days.at(-1);
  const weekAgo = days.filter((d) => d <= shiftDay(today, -7)).at(-1) ?? days[0];
  const now = historyDay(today), then = historyDay(weekAgo);
  const out = [];
  for (const [id, v] of Object.entries(now)) {
    const was = then[id];
    if (!was || v < MIN_CENTS) continue;
    const pct = ((v - was) / was) * 100;
    if (pct >= OUTLIER_SPIKE || pct <= -OUTLIER_DROP || Math.abs(pct) < 1) continue;
    const c = cards().get(id);
    if (!usable(c, { remoteArt }) || (set && c.setCode !== set)) continue;
    out.push({ card: c, wasCents: was, nowCents: v, pct });
  }
  return {
    today, weekAgo,
    up: out.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, limit),
    down: out.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, limit),
  };
}

// A set's most expensive cards today, on the same basis. A card whose price
// fell by more than half overnight is held back for a human look: that is how a
// mismatched listing shows up (Riven 173* at launch).
export function setTop(setCode, { limit = 10, remoteArt = false } = {}) {
  const days = historyDays();
  const today = days.at(-1);
  const now = historyDay(today);
  const prev = days.length > 1 ? historyDay(days.at(-2)) : {};
  const held = [];
  const rows = [];
  for (const [id, v] of Object.entries(now)) {
    const c = cards().get(id);
    if (!c || c.setCode !== setCode || c.isPromo) continue;
    if (prev[id] && v < prev[id] * 0.5) { held.push({ card: c, nowCents: v, prevCents: prev[id] }); continue; }
    rows.push({ card: c, nowCents: v });
  }
  rows.sort((a, b) => b.nowCents - a.nowCents);
  const top = [];
  const noArt = [];
  for (const r of rows) {
    if (top.length >= limit) break;
    if (usable(r.card, { remoteArt })) top.push(r); else noArt.push(r);
  }
  const floor = top.at(-1)?.nowCents ?? 0;
  // Only what would have ranked matters: a penny common halving is noise.
  return { today, top, held: held.filter((h) => h.prevCents >= floor), noArt: noArt.filter((r) => r.nowCents >= floor) };
}

// Cheapest in-stock booster box of a set in each market, in that market's own
// currency, from independent stores only: eBay and TCGplayer rows are left out,
// as the sealed alerts do (src/lib/sealed-alert-read.ts), since a post says
// "stores". Pre-orders count only when the title says so (flagged).
const CURRENCY = { AU: "AUD", US: "USD", UK: "GBP", EU: "EUR", CA: "CAD", SG: "SGD" };
export function cheapestBoxes(setCode, productType = "Booster Box") {
  const rows = read("data/public/sealed-listings.json").filter(
    (l) => l.inStock && l.setCode === setCode && l.productType === productType && !/^ebay/.test(l.retailer) && l.retailer !== "tcgplayer",
  );
  const best = {};
  const count = {};
  for (const l of rows) {
    count[l.country] = (count[l.country] ?? new Set()).add(l.retailer);
    if (!best[l.country] || l.priceCents < best[l.country].priceCents) best[l.country] = l;
  }
  const meta = read("data/public/meta.json");
  return {
    asOf: meta.generatedAt,
    markets: Object.keys(CURRENCY).filter((m) => best[m]).map((m) => ({
      market: m, currency: CURRENCY[m], priceCents: best[m].priceCents, store: best[m].retailerName,
      preorder: /pre-?order|presale|pre-?sale/i.test(best[m].title), stores: count[m].size, title: best[m].title,
    })),
  };
}

export function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SYMBOL = { USD: "US$", AUD: "A$", GBP: "£", EUR: "€", CAD: "C$", SGD: "S$" };
export function money(cents, currency = "USD") {
  const v = cents / 100;
  const s = v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);
  return `${SYMBOL[currency] ?? currency + " "}${s}`;
}
export const pct = (p) => `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}%`;
export const prettyDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
