// What a store will REALLY charge to post an order — read from each store's own
// checkout (the snapshot in shipping-rates.json), not guessed.
//
// Why this exists: on 2026-09-25 an Adelaide customer ran Best Basket, was
// shown $2 postage for a store and was quoted $20 at its checkout. The $2 was a
// hand-typed guess in retailers.ts. The probe measured every tracked store the
// same day: at Obsession Gaming the only option is "Standard" $20.00, for one
// card or fifteen, to every capital, never free — the guess said $2 and "free
// over $50". The one-card guess was too low at 25 of the 27 AU stores measured
// (median real rate $8.00), and every guessed AU free-over threshold was wrong;
// the other markets were wrong the same way.
//
// ── The model ───────────────────────────────────────────────────────────────
// The probe measured a handful of real carts per store (1 card, 10 cards, and
// few-card carts at ~20/50/100/150 in the market currency, plus extra rungs
// around thresholds). For each cart and each group of addresses it recorded the
// cheapest non-letter rate ("std": tracked, or a name like "Standard" that does
// not say) and the cheapest untracked letter ("ltr"). A cart of any other size
// is priced from those points, always erring towards the DEARER answer:
//
//   * A letter / untracked option is only offered to a cart no bigger than the
//     biggest cart it was seen on — in value AND in card count. Stores drop the
//     letter as an order grows (Mana Market's $7 letter is gone at 10 cards,
//     Forbidden Planet's under £20); outside what was seen it is never quoted.
//   * A price is the dearest of: the nearest measured cart with at least as
//     many cards, the nearest with at least as much value, and every measured
//     cart the order fully contains. Postage only rises with size apart from
//     free-shipping thresholds, so this never lands under what was measured.
//   * Free postage needs a measured THRESHOLD: a cart that paid, then a bigger-
//     value cart with no more cards that went free, and every cart above free.
//     The order must reach the first free cart — a threshold between $90.98
//     (paid) and $100.98 (free) is applied from $100.98, never from a guessed
//     round number.
//   * Region: AU by state, the others by the probe's cities/countries. When the
//     buyer's region is not known the HIGHEST regional figure is used and the
//     quote says "up to". No measured AU store charges by state (all eight
//     capitals quoted identically), so for AU this only matters as reassurance.
//   * A store the probe could not measure falls back to its retailers.ts guess,
//     flagged basis "estimate" and never shown as measured. The guessed
//     free-over threshold is NOT applied: not one of the AU guesses survived
//     measurement, and a guess must never zero someone's postage.
//
// Pure: no database, no request state. The snapshot is a JSON import, so a page
// that uses this adds no query (see the egress rules at the top of lib/db.ts).

import SNAPSHOT_JSON from "./shipping-rates.json";
import { RETAILERS } from "./retailers";
import { currencyOf, type Country } from "./country";
import { formatMoney } from "./format";
import type { ShippingSnapshot, SnapshotStore, SnapshotZone } from "./shipping-snapshot";

export const SHIPPING_SNAPSHOT = SNAPSHOT_JSON as unknown as ShippingSnapshot;

// ── Regions ─────────────────────────────────────────────────────────────────
// `at` lists the probe address ids (lib/shipping-probe.ts PROBE_ADDRESSES) a
// region is priced from. England is priced from London AND Manchester — the
// dearer of the two.
export interface ShippingRegion {
  key: string;
  label: string;
  at: string[];
}

export const SHIPPING_REGIONS: Record<Country, ShippingRegion[]> = {
  AU: [
    { key: "NSW", label: "New South Wales", at: ["syd"] },
    { key: "VIC", label: "Victoria", at: ["mel"] },
    { key: "QLD", label: "Queensland", at: ["bne"] },
    { key: "SA", label: "South Australia", at: ["adl"] },
    { key: "WA", label: "Western Australia", at: ["per"] },
    { key: "TAS", label: "Tasmania", at: ["hba"] },
    { key: "NT", label: "Northern Territory", at: ["drw"] },
    { key: "ACT", label: "ACT", at: ["cbr"] },
  ],
  US: [
    { key: "NE", label: "Northeast (priced to New York)", at: ["ny"] },
    { key: "S", label: "South (priced to Dallas)", at: ["dal"] },
    { key: "MW", label: "Midwest (priced to Chicago)", at: ["chi"] },
    { key: "W", label: "West (priced to San Francisco)", at: ["sf"] },
  ],
  UK: [
    { key: "ENG", label: "England & Wales", at: ["lon", "man"] },
    { key: "SCT", label: "Scotland", at: ["edi"] },
    { key: "NIR", label: "Northern Ireland", at: ["bfs"] },
  ],
  CA: [
    { key: "ON", label: "Ontario", at: ["tor"] },
    { key: "QC", label: "Quebec", at: ["mtl"] },
    { key: "BC", label: "British Columbia", at: ["van"] },
    { key: "AB", label: "Alberta", at: ["cgy"] },
  ],
  EU: [
    { key: "ES", label: "Spain", at: ["es"] },
    { key: "DE", label: "Germany", at: ["de"] },
    { key: "FR", label: "France", at: ["fr"] },
    { key: "NL", label: "Netherlands", at: ["nl"] },
  ],
  SG: [{ key: "SG", label: "Singapore", at: ["sg"] }],
};

export function regionFor(market: Country, key: string | null | undefined): ShippingRegion | null {
  if (!key) return null;
  return SHIPPING_REGIONS[market]?.find((r) => r.key === key) ?? null;
}

// ── Quotes ──────────────────────────────────────────────────────────────────
export interface PostageCart {
  subtotalCents: number;
  items: number; // physical cards in the order at this store
}

export interface PostageOptions {
  region?: string | null; // a SHIPPING_REGIONS key for the store's market; unknown → highest
  trackedOnly?: boolean; // never pick an untracked letter
}

export interface PostageOption {
  cents: number;
  label: string;
  tracked: boolean | null;
}

export interface PostageQuote {
  cents: number; // what the order is charged (0 = free)
  label: string; // the store's own rate name when measured
  tracked: boolean | null; // true: the name says tracked; false: untracked/letter; null: the name does not say
  basis: "measured" | "estimate";
  free: boolean;
  upTo: boolean; // region unknown and the figure differs by region: this is the highest
  otherOption?: PostageOption; // the letter a tracked-only quote skipped, or the tracked rate beside a letter
  freeFromCents?: number; // the store's measured free-postage cart, when this order is below it
  beyondMeasured?: boolean; // bigger than any cart measured (more cards or more value)
  minOrderCents?: number; // the store quotes no postage below this subtotal
  unavailable?: string; // the store does not post here — why
  notServed?: string[]; // (region unknown) regions the store does not post to
  measuredAt?: string; // YYYY-MM-DD
  note?: string;
}

interface Point {
  v: number;
  n: number;
  cents: number;
  name: string;
  tracked: boolean | null;
}

function pointsOf(store: SnapshotStore, zone: SnapshotZone, cls: "std" | "ltr"): Point[] {
  const series = cls === "std" ? zone.std : zone.ltr;
  if (!series) return [];
  const pts: Point[] = [];
  series.forEach((e, j) => {
    if (!e) return;
    const [v, n] = store.carts[j];
    pts.push({
      v,
      n,
      cents: e[0],
      name: store.names[e[1]] ?? "Postage",
      tracked: cls === "ltr" ? false : (e as [number, number, 0 | 1])[2] === 1 ? true : null,
    });
  });
  return pts;
}

/**
 * The subtotal from which the points are free by a THRESHOLD, or null. It
 * needs a paid cart below it with no more cards (so a $0 that only a small
 * cart gets — Maine Phase's "Standard" $0 for 1–3 cards — is not read as
 * "free over $20"), and every cart from there up free.
 */
export function freeThreshold(points: readonly { v: number; n: number; cents: number }[]): number | null {
  const byV = [...points].sort((a, b) => a.v - b.v || a.n - b.n);
  let runStart = byV.length;
  while (runStart > 0 && byV[runStart - 1].cents === 0) runStart--;
  for (let k = runStart; k < byV.length; k++) {
    const p = byV[k];
    if (byV.slice(0, runStart).some((q) => q.cents > 0 && q.v < p.v && q.n <= p.n)) return p.v;
  }
  return null;
}

interface ClassResult {
  pt: Point;
  free: boolean;
  beyond: boolean;
  freeAt: number | null;
}

function evalClass(points: Point[], cart: PostageCart, bounded: boolean): ClassResult | null {
  if (!points.length) return null;
  const v = Math.max(0, cart.subtotalCents);
  const n = Math.max(1, cart.items);
  const maxV = Math.max(...points.map((p) => p.v));
  const maxN = Math.max(...points.map((p) => p.n));
  // A letter is only offered inside what was seen.
  if (bounded && (v > maxV || n > maxN)) return null;
  const beyond = v > maxV || n > maxN;
  const freeAt = freeThreshold(points);
  if (freeAt != null && v >= freeAt) {
    const pt = points.filter((p) => p.v >= freeAt).sort((a, b) => a.v - b.v || a.n - b.n)[0];
    return { pt, free: true, beyond, freeAt };
  }
  const paid = freeAt == null ? points : points.filter((p) => p.v < freeAt);
  const countProxy = paid.filter((p) => p.n >= n).sort((a, b) => a.n - b.n || a.v - b.v)[0];
  const valueProxy = paid.filter((p) => p.v >= v).sort((a, b) => a.v - b.v || a.n - b.n)[0];
  const contained = paid.filter((p) => p.v <= v && p.n <= n).sort((a, b) => b.cents - a.cents || b.v - a.v)[0];
  let cands = [valueProxy, countProxy, contained].filter((p): p is Point => !!p);
  if (!cands.length) cands = paid;
  const pt = cands.reduce((best, p) => (p.cents > best.cents ? p : best));
  return { pt, free: pt.cents === 0, beyond, freeAt };
}

function storeCurrency(key: string): string | null {
  const r = RETAILERS[key];
  if (!r) return null;
  return r.currency ?? currencyOf((r.country ?? "AU") as Country);
}

function estimateQuote(key: string, note?: string): PostageQuote {
  const r = RETAILERS[key];
  return {
    cents: r?.shippingFlatCents ?? 0,
    label: "Estimate — not measured",
    tracked: null,
    basis: "estimate",
    free: false,
    upTo: false,
    ...(note ? { note } : {}),
  };
}

function zoneQuote(store: SnapshotStore, zone: SnapshotZone, cart: PostageCart, opts: PostageOptions): PostageQuote {
  if (zone.none) {
    return { cents: 0, label: "No postage", tracked: null, basis: "measured", free: false, upTo: false, unavailable: "Quoted no postage here", measuredAt: store.measuredAt };
  }
  let std = evalClass(pointsOf(store, zone, "std"), cart, false);
  const ltr = evalClass(pointsOf(store, zone, "ltr"), cart, true);
  let beyondFallback = false;
  if (!std && !ltr) {
    // The store only ever quoted letters here and this order is bigger than
    // any of them: the dearest letter seen, flagged.
    std = evalClass(pointsOf(store, zone, "ltr"), cart, false);
    beyondFallback = true;
    if (!std) return { cents: 0, label: "No postage", tracked: null, basis: "measured", free: false, upTo: false, unavailable: "Quoted no postage here" };
  }
  let chosen: ClassResult;
  let other: ClassResult | null = null;
  if (!std) chosen = ltr!;
  else if (!ltr) chosen = std;
  else if (opts.trackedOnly || std.pt.cents <= ltr.pt.cents) {
    chosen = std;
    if (ltr.pt.cents < std.pt.cents) other = ltr;
  } else {
    chosen = ltr;
    other = std;
  }
  const toOption = (r: ClassResult): PostageOption => ({ cents: r.free ? 0 : r.pt.cents, label: r.pt.name, tracked: r.pt.tracked });
  const q: PostageQuote = {
    cents: chosen.free ? 0 : chosen.pt.cents,
    label: chosen.pt.name,
    tracked: chosen.pt.tracked,
    basis: "measured",
    free: (chosen.free ? 0 : chosen.pt.cents) === 0,
    upTo: false,
    measuredAt: store.measuredAt,
  };
  if (other) q.otherOption = toOption(other);
  if (chosen.beyond || beyondFallback) q.beyondMeasured = true;
  const threshold = std?.freeAt ?? null;
  if (!q.free && threshold != null && cart.subtotalCents < threshold) q.freeFromCents = threshold;
  // Free postage applied as a checkout discount the rates endpoint cannot see
  // (measured separately through the Storefront API — SHIPPING_OVERRIDES).
  if (store.freeFromCents) {
    if (cart.subtotalCents >= store.freeFromCents) {
      q.cents = 0;
      q.free = true;
      q.note = `free ${store.freeNote ?? "at checkout"}`;
      delete q.otherOption;
      delete q.freeFromCents;
    } else if (!q.free) {
      q.freeFromCents = Math.min(q.freeFromCents ?? Infinity, store.freeFromCents);
    }
  }
  if (store.minOrderCents && cart.subtotalCents < store.minOrderCents) q.minOrderCents = store.minOrderCents;
  return q;
}

function regionQuote(store: SnapshotStore, region: ShippingRegion, cart: PostageCart, opts: PostageOptions): PostageQuote | null {
  const quotes = region.at
    .map((id) => store.zones.find((z) => z.at.includes(id)))
    .filter((z): z is SnapshotZone => !!z)
    .map((z) => zoneQuote(store, z, cart, opts));
  if (!quotes.length) return null; // no zone measured for this region
  const served = quotes.filter((q) => !q.unavailable);
  if (!served.length) return { ...quotes[0], unavailable: `Does not post to ${region.label} (measured)` };
  return served.reduce((best, q) => (q.cents > best.cents ? q : best));
}

/**
 * The postage a store will charge for one order. See the header for the rules.
 * `snapshot` is injectable for tests and for the builder's change report.
 */
export function shippingFor(
  storeKey: string,
  cart: PostageCart,
  opts: PostageOptions = {},
  snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT,
): PostageQuote {
  const store = snapshot.stores[storeKey];
  const cur = storeCurrency(storeKey);
  if (!store || store.status === "unmeasured" || (cur && store.currency !== cur)) return estimateQuote(storeKey, store?.note);
  if (store.status === "no-post") {
    return {
      cents: 0,
      label: "No postage",
      tracked: null,
      basis: "measured",
      free: false,
      upTo: false,
      unavailable: store.note ?? "Quoted no postage to any address we measured",
      measuredAt: store.measuredAt,
    };
  }
  const regions = SHIPPING_REGIONS[store.market] ?? [];
  const chosen = regionFor(store.market, opts.region);
  if (chosen) {
    const q = regionQuote(store, chosen, cart, opts);
    if (q) return q;
  }
  // Region not known (or not measured): the HIGHEST regional figure.
  const per = regions
    .map((r) => ({ r, q: regionQuote(store, r, cart, opts) }))
    .filter((x): x is { r: ShippingRegion; q: PostageQuote } => !!x.q);
  const served = per.filter((x) => !x.q.unavailable);
  const notServed = per.filter((x) => x.q.unavailable).map((x) => x.r.label);
  if (!served.length) {
    return {
      cents: 0,
      label: "No postage",
      tracked: null,
      basis: "measured",
      free: false,
      upTo: false,
      unavailable: store.note ?? "Quoted no postage to any region we measured",
      measuredAt: store.measuredAt,
    };
  }
  const top = served.reduce((best, x) => (x.q.cents > best.q.cents ? x : best));
  const differs = served.some((x) => x.q.cents !== top.q.cents) || notServed.length > 0;
  return { ...top.q, upTo: differs, ...(notServed.length ? { notServed } : {}) };
}

// ── Display ─────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-25" → "25 Sep 2026" (fixed, locale-free: server and client agree). */
export function formatMeasuredDate(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** The date the market's rates were measured, for footers. */
export function marketMeasuredAt(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): string | null {
  return snapshot.markets[market]?.measuredAt || null;
}

/**
 * Whether a store's prices differ by address — by price, not by rate name (88
 * Games Arena calls the same $8 "3-5 Business Days" in Sydney and Melbourne and
 * "4-7" elsewhere), or because it does not post to some of them.
 */
export function storeIsZonePriced(store: SnapshotStore): boolean {
  const sig = (z: SnapshotZone) =>
    JSON.stringify([z.none ?? false, z.std.map((e) => e?.[0] ?? null), (z.ltr ?? []).map((e) => e?.[0] ?? null)]);
  return new Set(store.zones.map(sig)).size > 1;
}

/** Whether any measured store in the market prices by region (so a picker changes anything). */
export function marketHasZonePricing(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): boolean {
  return Object.values(snapshot.stores).some((s) => s.market === market && s.status === "measured" && storeIsZonePriced(s));
}

export interface StoreShippingSummary {
  basis: "measured" | "estimate" | "no-post";
  currency: string;
  measuredAt?: string;
  note?: string;
  oneCardSubtotalCents?: number;
  std?: { minCents: number; maxCents: number; label: string; tracked: boolean | null };
  letter?: { minCents: number; maxCents: number; label: string; maxItems: number; maxValueCents: number };
  free?: { fromCents: number | null; paidAtCents: number | null; upToCents: number; note?: string };
  regions?: { label: string; cents: number | null; label2?: string }[]; // per region, one card (zone-priced stores only)
  notServed?: string[];
  minOrderCents?: number;
  estimateCents?: number;
}

/** Everything a store page needs to describe its postage, from the snapshot. */
export function shippingSummary(storeKey: string, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): StoreShippingSummary {
  const store = snapshot.stores[storeKey];
  const r = RETAILERS[storeKey];
  const cur = storeCurrency(storeKey) ?? store?.currency ?? "AUD";
  if (!store || store.status === "unmeasured" || store.currency !== cur) {
    return { basis: "estimate", currency: cur, note: store?.note, estimateCents: r?.shippingFlatCents };
  }
  if (store.status === "no-post") return { basis: "no-post", currency: cur, note: store.note, measuredAt: store.measuredAt };

  const oneCard = store.carts.filter(([, n]) => n === 1).sort((a, b) => a[0] - b[0])[0] ?? store.carts[0];
  const cart = { subtotalCents: oneCard[0], items: 1 };
  const regions = SHIPPING_REGIONS[store.market] ?? [];
  const perRegion = regions.map((rg) => ({ rg, t: regionQuote(store, rg, cart, { trackedOnly: true }) }));
  const served = perRegion.filter((x) => x.t && !x.t.unavailable) as { rg: ShippingRegion; t: PostageQuote }[];
  const notServed = perRegion.filter((x) => x.t?.unavailable).map((x) => x.rg.label);
  const out: StoreShippingSummary = { basis: "measured", currency: cur, measuredAt: store.measuredAt, oneCardSubtotalCents: oneCard[0] };
  if (store.note) out.note = store.note;
  if (notServed.length) out.notServed = notServed;
  if (store.minOrderCents) out.minOrderCents = store.minOrderCents;
  if (served.length) {
    const cents = served.map((x) => x.t.cents);
    const top = served.reduce((b, x) => (x.t.cents > b.t.cents ? x : b));
    out.std = { minCents: Math.min(...cents), maxCents: Math.max(...cents), label: top.t.label, tracked: top.t.tracked };
    if (new Set(cents).size > 1) out.regions = served.map((x) => ({ label: x.rg.label, cents: x.t.cents, label2: x.t.label }));
  }
  // The letter, across the zones that offer one: its one-card price and the
  // biggest cart it was seen on.
  const letters: { cents: number; label: string; maxItems: number; maxValueCents: number }[] = [];
  for (const z of store.zones) {
    if (z.none) continue;
    const pts = pointsOf(store, z, "ltr");
    if (!pts.length) continue;
    const one = evalClass(pts, cart, true);
    if (!one) continue;
    const cents = one.free ? 0 : one.pt.cents;
    // How far THAT price reaches: a store can swap a £1.55 2nd Class letter for
    // a £3.80 1st Class one as the order grows (Union County), and the note
    // must not stretch the cheap one over carts only the dearer one covered.
    const atPrice = pts.filter((p) => p.cents <= cents);
    letters.push({ cents, label: one.pt.name, maxItems: Math.max(...atPrice.map((p) => p.n)), maxValueCents: Math.max(...atPrice.map((p) => p.v)) });
  }
  if (letters.length) {
    const top = letters.reduce((b, l) => (l.cents > b.cents ? l : b));
    out.letter = {
      minCents: Math.min(...letters.map((l) => l.cents)),
      maxCents: top.cents,
      label: top.label,
      maxItems: Math.min(...letters.map((l) => l.maxItems)),
      maxValueCents: Math.min(...letters.map((l) => l.maxValueCents)),
    };
  }
  // Free postage: the dearest (latest) threshold across served zones; none if
  // any served zone never went free.
  const upToCents = Math.max(...store.carts.map(([v]) => v));
  let fromCents: number | null = null;
  let paidAtCents: number | null = null;
  let allFree = true;
  for (const z of store.zones) {
    if (z.none) continue;
    const pts = pointsOf(store, z, "std");
    const at = freeThreshold(pts);
    if (at == null) {
      allFree = false;
      continue;
    }
    fromCents = Math.max(fromCents ?? 0, at);
    const paid = pts.filter((p) => p.v < at && p.cents > 0).map((p) => p.v);
    if (paid.length) paidAtCents = Math.max(paidAtCents ?? 0, ...paid);
  }
  if (!allFree) {
    fromCents = null;
    paidAtCents = null;
  }
  if (store.freeFromCents && (fromCents == null || store.freeFromCents < fromCents)) {
    out.free = { fromCents: store.freeFromCents, paidAtCents: null, upToCents, note: store.freeNote };
  } else {
    out.free = { fromCents, paidAtCents, upToCents };
  }
  return out;
}

/**
 * One line for a store card (/stores/tracked) and the retailers.ts-era
 * `shippingNote` slot: measured facts with their date, or a plainly labelled
 * estimate. Never calls an estimate "measured".
 */
export function shippingNoteFor(storeKey: string, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): string {
  const s = shippingSummary(storeKey, snapshot);
  const m = (c: number) => formatMoney(c, s.currency);
  if (s.basis === "estimate") {
    return s.estimateCents != null ? `Postage not measured yet · est. ${m(s.estimateCents)} a card` : "Postage not measured yet";
  }
  if (s.basis === "no-post") return `No postage: ${s.note ?? "quoted none"}`;
  const parts: string[] = [];
  const price = (c: number) => (c === 0 ? "free" : m(c));
  if (s.std) {
    parts.push(
      s.std.minCents === s.std.maxCents
        ? `${s.std.label} ${s.std.maxCents === 0 ? "free for one card" : m(s.std.maxCents)}`
        : `${price(s.std.minCents)}–${m(s.std.maxCents)} by region (${s.std.label} ${m(s.std.maxCents)})`,
    );
  }
  if (s.letter && (!s.std || s.letter.minCents < s.std.minCents)) {
    const p = s.letter.minCents === s.letter.maxCents ? price(s.letter.maxCents) : `${price(s.letter.minCents)}–${m(s.letter.maxCents)}`;
    parts.push(`untracked ${p} (up to ${s.letter.maxItems} card${s.letter.maxItems === 1 ? "" : "s"}, ${m(s.letter.maxValueCents)})`);
  }
  if (s.free?.fromCents != null) parts.push(`free from ${m(s.free.fromCents)}`);
  else if (s.free && s.std && s.std.minCents > 0) parts.push(`no free-postage threshold up to ${m(s.free.upToCents)}`);
  if (s.notServed?.length) parts.push(`does not post to ${s.notServed.join(", ")}`);
  return `${parts.join(" · ")} — measured ${formatMeasuredDate(s.measuredAt)}`;
}

// ── Request helpers (the Best Basket and replacement-cost routes) ───────────
/** A region key from a request, kept only if it belongs to the market. */
export function postageOptionsFrom(market: Country, region: unknown, trackedOnly: unknown): PostageOptions {
  const r = typeof region === "string" ? regionFor(market, region) : null;
  return { region: r?.key ?? null, trackedOnly: trackedOnly === true || trackedOnly === "1" || trackedOnly === "true" };
}

/**
 * The optimiser's store map for one market: each store's name and its postage
 * function bound to the buyer's options, and — for a store that does not post
 * to them at all — why, so its listings are left out rather than priced.
 */
export function basketStoresFor(
  market: Country,
  opts: PostageOptions,
  snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT,
): Record<string, { name: string; postage: (cart: PostageCart) => PostageQuote; unavailable?: string }> {
  return Object.fromEntries(
    Object.values(RETAILERS)
      .filter((r) => (r.country ?? "AU") === market)
      .map((r) => {
        const probe = shippingFor(r.key, { subtotalCents: 0, items: 1 }, opts, snapshot);
        return [
          r.key,
          {
            name: r.name,
            postage: (cart: PostageCart) => shippingFor(r.key, cart, opts, snapshot),
            ...(probe.unavailable ? { unavailable: probe.unavailable } : {}),
          },
        ];
      }),
  );
}
