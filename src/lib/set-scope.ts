// THE SET TRACKER'S PURE HALF (2026-09-29, DECISIONS.md, "Set tracker").
//
// A binder is diffed against a SET'S CATALOGUE: which cards of Origins does
// this account not hold, and what is the cheapest listing for each? Everything
// that decides the answer lives here with no database, no React and no Next, so
// the tracker page, the owned overlay and the tests all read one definition
// and the numbers cannot drift apart:
//
//   • which printings count toward a set (two scopes, below);
//   • which of a card's prices is a STORE listing and which is not;
//   • progress and cost-to-finish, with eBay-only cards counted in neither total;
//   • the pre-release rule: a set that has not released shows "N revealed" with
//     no denominator and no percentage (Radiance's total is unsettled, 167
//     printed against 180 announced, DECISIONS 2026-09-19);
//   • the missing list as a Best Basket-ready text and as a CSV.
//
// Client-safe: it imports only other pure modules (constants, card-name,
// deck), so a "use client" file may import it (tests/client-imports.test.ts).
//
// WHAT COUNTS AS OWNED. Any finish and any condition: a foil LP copy fills the
// slot as well as an NM non-foil does. The tracker says so on the page. One of
// each: a playset rule (Legends and Battlefields hold one, the rest three) is
// not encoded until it is verified, so "own" means "at least one copy".
//
// WHAT COUNTS TOWARD A SET.
//   "base"  the numbered run: not a promo, no alt-art letter, not overnumbered,
//           not a Signature, not a Crystal Rose. A base set of 298 is 298.
//   "all"   every printing we track: the base set plus alt-arts, overnumbered
//           prints, Signatures and Crystal Roses. Promos are excluded from both:
//           a promo shares its base card's number and art and is a different
//           ownership question ("do I have the promo") this tracker does not ask.
// Tokens (collector number "t03/000") are in neither: they are not collectable
// cards of the set. "Printings we track" is the honest label: the counts are
// only as complete as our Card rows, never a typed-in total.
import { isCrystalRose, isOvernumbered, isSignature } from "./constants";
import { cardDisplayName } from "./card-name";
import { formatDeckLine } from "./deck";

export type SetScope = "base" | "all";

export const SET_SCOPES: { key: SetScope; label: string; hint: string }[] = [
  { key: "base", label: "Base set", hint: "The numbered run: no alt-arts, overnumbered prints, Signatures or promos." },
  { key: "all", label: "Every printing we track", hint: "The base set plus alt-arts, overnumbered prints, Signatures and Crystal Roses. Promos are left out." },
];

/** A scope from a query string; anything else is the base set. */
export function parseScope(v: unknown): SetScope {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "all" ? "all" : "base";
}

/** The fields the scope rule reads. */
export interface ScopeCard {
  setCode: string;
  collectorNumber: string;
  variant?: string | null;
  isPromo?: boolean | null;
  isOvernumbered?: boolean | null;
}

/** "t03/000": a token, not a card of the set. */
export function isTokenNumber(collectorNumber: string): boolean {
  return /^t\d/i.test(collectorNumber.trim()) || /\/0+\s*$/.test(collectorNumber);
}

/** Is this printing a special treatment of a card (alt-art, overnumbered, Signature, Crystal Rose)? */
export function isSpecialPrinting(c: ScopeCard): boolean {
  return (
    (c.variant != null && c.variant !== "") ||
    // The stored flag is denormalised and backfilled on deploy, so the number
    // itself is read as well: whichever knows, wins.
    !!c.isOvernumbered ||
    isOvernumbered(c.collectorNumber) ||
    isSignature(c.collectorNumber) ||
    isCrystalRose(c.setCode, c.collectorNumber)
  );
}

export function cardInScope(c: ScopeCard, scope: SetScope): boolean {
  if (c.isPromo) return false;
  if (isTokenNumber(c.collectorNumber)) return false;
  return scope === "all" ? true : !isSpecialPrinting(c);
}

// ── A card as the checklist carries it ───────────────────────────────────────

export interface ChecklistCard extends ScopeCard {
  id: string;
  slug: string | null;
  name: string;
  rarity: string;
  /**
   * Cheapest in-stock listing at a REAL store in the reader's market, cents,
   * or null. Never Card.lowestPriceCents*, which is "stores + eBay" and would
   * let an eBay-only card read as available.
   */
  minCents: number | null;
  /** Distinct real stores with that card in stock. 0 when minCents is null. */
  stores: number;
  /** No store has it, but the market's own price column has one (eBay or a reference price). */
  otherSource: boolean;
}

export type CardStock = "store" | "other" | "none";

export function stockOf(c: Pick<ChecklistCard, "minCents" | "otherSource">): CardStock {
  if (c.minCents != null) return "store";
  return c.otherSource ? "other" : "none";
}

/** Owned copies by card id (any finish and condition). */
export type OwnedMap = Readonly<Record<string, number>>;

export const isOwned = (owned: OwnedMap, id: string): boolean => (owned[id] ?? 0) > 0;

export interface SetSummary {
  /** Cards in the scope. */
  total: number;
  /** Of those, cards with at least one copy owned. */
  owned: number;
  /** total - owned. */
  missing: number;
  /** Whole percent owned, or null when total is 0. */
  percent: number | null;
  /** Missing cards with a real-store listing: the only ones costed. */
  priced: number;
  /** Sum of their cheapest listings, before postage. */
  costCents: number;
  /** Missing cards no source has in stock in this market. */
  notInStock: number;
  /** Missing cards only eBay (or a reference price) has: counted in neither of the two totals above. */
  otherOnly: number;
}

export function summarise(cards: readonly ChecklistCard[], owned: OwnedMap, scope: SetScope): SetSummary {
  let total = 0;
  let have = 0;
  let priced = 0;
  let costCents = 0;
  let notInStock = 0;
  let otherOnly = 0;
  for (const c of cards) {
    if (!cardInScope(c, scope)) continue;
    total++;
    if (isOwned(owned, c.id)) {
      have++;
      continue;
    }
    const s = stockOf(c);
    if (s === "store") {
      priced++;
      costCents += c.minCents ?? 0;
    } else if (s === "other") otherOnly++;
    else notInStock++;
  }
  return {
    total,
    owned: have,
    missing: total - have,
    percent: total > 0 ? Math.floor((have / total) * 100) : null,
    priced,
    costCents,
    notInStock,
    otherOnly,
  };
}

/**
 * A set that has not released: "N revealed", never a fraction, a percentage or
 * a bar. `revealed` counts non-promo Card rows (the same count the set page's
 * title uses); `owned` is how many of them the account holds. Both are shown
 * side by side ("3 owned, 41 revealed so far"), because "3 of 41" would read as
 * a denominator the set does not have yet.
 */
export interface PreReleaseSummary {
  revealed: number;
  owned: number;
}

export function summarisePreRelease(cards: readonly ChecklistCard[], owned: OwnedMap): PreReleaseSummary {
  let revealed = 0;
  let have = 0;
  for (const c of cards) {
    if (c.isPromo) continue;
    revealed++;
    if (isOwned(owned, c.id)) have++;
  }
  return { revealed, owned: have };
}

/**
 * A collector number as a pre-release set shows it: "001/167" is "001". The
 * printed denominator is a total, and a set that has not released has none we
 * will state (167 printed against 180 announced), so no row may print one.
 */
export function numberWithoutTotal(collectorNumber: string): string {
  return collectorNumber.split("/")[0].trim();
}

export function preReleaseLine(s: PreReleaseSummary): string {
  return `${s.revealed} ${s.revealed === 1 ? "card" : "cards"} revealed so far`;
}

// ── The list: filter, sort ───────────────────────────────────────────────────

export type ShowFilter = "all" | "missing" | "owned";
export type SortKey = "cheapest" | "dearest" | "number";

export const parseShow = (v: unknown): ShowFilter => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "owned" || s === "all" ? s : "missing";
};
export const parseSort = (v: unknown): SortKey => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "dearest" || s === "number" ? s : "cheapest";
};

/** "112a/298" → [112, "a"], for a numeric-aware collector-number order. */
function numberOrder(collectorNumber: string): [number, string] {
  const m = collectorNumber.match(/^(\d+)([a-z]?)(\*?)/i);
  return m ? [parseInt(m[1], 10), `${m[2].toLowerCase()}${m[3]}`] : [Number.MAX_SAFE_INTEGER, collectorNumber];
}

export function compareByNumber(a: Pick<ChecklistCard, "collectorNumber" | "name">, b: Pick<ChecklistCard, "collectorNumber" | "name">): number {
  const [an, as] = numberOrder(a.collectorNumber);
  const [bn, bs] = numberOrder(b.collectorNumber);
  return an - bn || as.localeCompare(bs) || a.name.localeCompare(b.name);
}

export interface ListOptions {
  scope: SetScope;
  show: ShowFilter;
  rarity?: string | null;
  sort: SortKey;
}

/**
 * The rows of the tick list. Cheapest/dearest put priced cards first in that
 * order, then the ones with no store listing (eBay only, then not in stock) by
 * number, so the head of the list is always what can be bought today.
 */
export function listRows(cards: readonly ChecklistCard[], owned: OwnedMap, opts: ListOptions): ChecklistCard[] {
  const rows = cards.filter((c) => {
    if (!cardInScope(c, opts.scope)) return false;
    if (opts.rarity && c.rarity !== opts.rarity) return false;
    const has = isOwned(owned, c.id);
    return opts.show === "all" || (opts.show === "owned" ? has : !has);
  });
  const rank = (c: ChecklistCard) => (stockOf(c) === "store" ? 0 : stockOf(c) === "other" ? 1 : 2);
  return rows.sort((a, b) => {
    if (opts.sort === "number") return compareByNumber(a, b);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const d = (a.minCents ?? 0) - (b.minCents ?? 0);
      const byPrice = opts.sort === "cheapest" ? d : -d;
      if (byPrice) return byPrice;
    }
    return compareByNumber(a, b);
  });
}

/** Rarities present in the scope, for the filter. */
export function raritiesIn(cards: readonly ChecklistCard[], scope: SetScope): string[] {
  return [...new Set(cards.filter((c) => cardInScope(c, scope)).map((c) => c.rarity))].sort();
}

// ── The missing list, out of the page ────────────────────────────────────────

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * One line per card, `1 Name (OGN-001)`: pastes straight into Best Basket, the
 * deck pricer or the paste import, and each line names its exact printing (a
 * Signature keeps its "*"), so an alt-art is never priced as its base card.
 */
export function missingText(rows: readonly ChecklistCard[]): string {
  return rows.map((c) => formatDeckLine(1, c)).join("\n");
}

/** The same list as a CSV: set, number, name, rarity, cheapest listing (or empty), stores. */
export function missingCsv(rows: readonly ChecklistCard[], currency: string): string {
  const head = `set,number,name,rarity,cheapest_${currency.toLowerCase()},stores`;
  const lines = rows.map((c) =>
    [
      c.setCode,
      esc(c.collectorNumber),
      esc(cardDisplayName(c.name, c)),
      esc(c.rarity),
      c.minCents != null ? (c.minCents / 100).toFixed(2) : "",
      c.stores,
    ].join(","),
  );
  return [head, ...lines].join("\n");
}

/** What a card with no store listing says, by market. Only UK and EU carry reference prices in their column. */
export function otherSourceLabel(country: string): string {
  return country === "UK" || country === "EU" ? "eBay or reference price only" : "eBay only";
}

/**
 * The footer under every cost to finish, verbatim (owner-approved wording): the
 * figure is the cheapest listing, item price only, and delivery is priced by
 * Best Basket. One constant so the page and its test read the same words.
 */
export const SET_FOOTER_COPY = "Cheapest listing per card, before postage. Best Basket prices delivery.";
