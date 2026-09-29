// FINISH THIS SET: the pure half (2026-09-29, DECISIONS.md, "Finish this set").
//
// The set tracker (lib/set-scope.ts) says what a binder is missing from a set;
// this turns that gap into the list Best Basket prices. Everything that decides
// WHICH cards are in one plan lives here with no database, so the route, the
// page copy and the tests read one definition.
//
//   • wanted = the set's cards in the chosen scope (and rarity), minus the ones
//     the account owns (any finish, any condition: the tracker's own rule, so
//     "missing" here is exactly what the checklist shows as missing);
//   • one copy of each;
//   • a card with no in-stock REAL-STORE listing (nothing anywhere, or eBay only)
//     is not priced: it is listed apart as "not stocked", never dropped;
//   • an optional per-card ceiling leaves out the dearer ones, and says how many;
//   • ONE PLAN HOLDS AT MOST SET_GAP_CHUNK CARDS (Best Basket's 200-line cap).
//     A bigger gap is served as a ranked chunk, cheapest first, with one plain
//     line and a step to the next chunk. Never silently partial.
//
// Client-safe: imports only pure modules (tests/client-imports.test.ts).
import { DECK_LINE_CAP } from "./deck";
import {
  cardInScope,
  compareByNumber,
  isOwned,
  stockOf,
  type ChecklistCard,
  type OwnedMap,
  type SetScope,
} from "./set-scope";

/** Cards in one plan. Best Basket's line cap (DECK_LINE_CAP, WATCHLIST_BASKET_CAP), so a plan is never bigger than the tool prices. */
export const SET_GAP_CHUNK = DECK_LINE_CAP;

/** The catalogue read is capped at 1,200 cards (lib/set-checklist.ts), so no chunk starts past it. */
export const SET_GAP_MAX_OFFSET = 1200;

/** How many not-stocked cards a Premium answer names; the rest are counted. */
export const NOT_STOCKED_LIST_CAP = 200;

/** A chunk start from a request: a whole number of chunks, 0 or more, never past the catalogue. */
export function normalizeOffset(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  if (n <= 0) return 0;
  return Math.min(SET_GAP_MAX_OFFSET, Math.floor(n / SET_GAP_CHUNK) * SET_GAP_CHUNK);
}

export interface SetGapOptions {
  scope: SetScope;
  /** Only this rarity (the checklist's own filter), or null for all. */
  rarity?: string | null;
  /** Leave out cards whose cheapest listing is dearer than this, cents. */
  maxPriceCents?: number | null;
  /** Rank to start at, a multiple of SET_GAP_CHUNK. */
  offset?: number;
}

/** Counts only: safe to send to any signed-in account (no store, line or link). */
export interface SetGapSummary {
  setCode: string;
  scope: SetScope;
  rarity: string | null;
  maxPriceCents: number | null;
  /** Cards in scope (and rarity) the account owns. */
  ownedInScope: number;
  /** Cards in scope (and rarity) it is missing. */
  gapTotal: number;
  /** Of those, cards with an in-stock real-store listing. */
  stocked: number;
  /** Stocked cards dearer than the ceiling: left out at the member's own choice. */
  overCeiling: number;
  /** Stocked cards within the ceiling: what the chunks are cut from. */
  candidates: number;
  /** Where this chunk starts (0-based rank) and how many cards it holds. */
  offset: number;
  inChunk: number;
  /** Candidates past this chunk: "N more not included". */
  moreAfter: number;
  /** Offset of the next chunk, or null when this is the last. */
  nextOffset: number | null;
  /** Missing cards with no in-stock real-store listing: listed apart, not priced. */
  notStockedCount: number;
}

export interface SetGapPlan {
  /** This chunk's cards, cheapest first: one copy each. */
  chunk: ChecklistCard[];
  /** Every missing card no real store has in stock, by collector number. */
  notStocked: ChecklistCard[];
  summary: SetGapSummary;
}

/** Cheapest listing first; ties by collector number then id, so a chunk boundary is stable. */
function byPriceThenNumber(a: ChecklistCard, b: ChecklistCard): number {
  return (a.minCents ?? 0) - (b.minCents ?? 0) || compareByNumber(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function planSetGap(
  setCode: string,
  cards: readonly ChecklistCard[],
  owned: OwnedMap,
  opts: SetGapOptions,
): SetGapPlan {
  const rarity = opts.rarity ? opts.rarity : null;
  const ceiling = opts.maxPriceCents != null && opts.maxPriceCents > 0 ? Math.floor(opts.maxPriceCents) : null;
  const offset = normalizeOffset(opts.offset ?? 0);

  let ownedInScope = 0;
  const missing: ChecklistCard[] = [];
  for (const c of cards) {
    if (!cardInScope(c, opts.scope)) continue;
    if (rarity && c.rarity !== rarity) continue;
    if (isOwned(owned, c.id)) ownedInScope++;
    else missing.push(c);
  }

  const stocked = missing.filter((c) => stockOf(c) === "store");
  const notStocked = missing.filter((c) => stockOf(c) !== "store").sort(compareByNumber);
  const within = ceiling == null ? stocked : stocked.filter((c) => (c.minCents ?? 0) <= ceiling);
  const ranked = [...within].sort(byPriceThenNumber);
  const chunk = ranked.slice(offset, offset + SET_GAP_CHUNK);
  const moreAfter = Math.max(0, ranked.length - (offset + chunk.length));

  return {
    chunk,
    notStocked,
    summary: {
      setCode,
      scope: opts.scope,
      rarity,
      maxPriceCents: ceiling,
      ownedInScope,
      gapTotal: missing.length,
      stocked: stocked.length,
      overCeiling: stocked.length - within.length,
      candidates: ranked.length,
      offset,
      inChunk: chunk.length,
      moreAfter,
      nextOffset: moreAfter > 0 ? offset + chunk.length : null,
      notStockedCount: notStocked.length,
    },
  };
}

/**
 * The one plain line above a chunked plan, or null when the whole gap fits in
 * one plan. The first chunk reads exactly "Your 200 cheapest missing cards. N
 * more not included."; a later one says which ranks it is.
 */
export function setGapNote(s: Pick<SetGapSummary, "offset" | "inChunk" | "moreAfter">): string | null {
  if (s.inChunk === 0) return null;
  if (s.offset === 0) {
    return s.moreAfter > 0 ? `Your ${s.inChunk} cheapest missing cards. ${s.moreAfter} more not included.` : null;
  }
  const range = `Missing cards ${s.offset + 1} to ${s.offset + s.inChunk}, cheapest first.`;
  return s.moreAfter > 0 ? `${range} ${s.moreAfter} more not included.` : `${range} That is all of the rest.`;
}

/** The label on the step to the next chunk. */
export function nextChunkLabel(s: Pick<SetGapSummary, "moreAfter">): string {
  return `Plan the next ${Math.min(SET_GAP_CHUNK, s.moreAfter)}`;
}

/** The refusal for a set that has not released, with how many revealed cards have no listing yet. No denominator. */
export function preReleaseGapMessage(setName: string, revealedNoListing: number): string {
  return `${setName} isn't out yet, so there is nothing to order. ${revealedNoListing} ${
    revealedNoListing === 1 ? "revealed card has" : "revealed cards have"
  } no store listing yet.`;
}

/** Revealed (non-promo) cards of a set that no real store lists yet. */
export function revealedWithoutListing(cards: readonly ChecklistCard[]): number {
  return cards.filter((c) => !c.isPromo && stockOf(c) !== "store").length;
}

/** The set page's copy for a plan that could not be built because nothing missing has a store listing. */
export function nothingStockedMessage(missing: number, place: string): string {
  return `None of the ${missing} ${missing === 1 ? "card" : "cards"} you're missing has a store listing in ${place} right now.`;
}

/** The set part of a Best Basket answer that /api/basket adds, by tier. */
export interface SetGapAnswer {
  summary: SetGapSummary;
  setName: string;
  notStocked: { name: string; setCode: string; collectorNumber: string }[];
}

/**
 * What a set answer adds to the response. Counts for EVERY signed-in account
 * (`setGap`: no store, line, link or card name); the named not-stocked cards
 * are Premium's, like the rest of the plan. The route spreads exactly this, so
 * a non-Premium payload carries nothing more.
 */
export function setGapFields(
  full: boolean,
  a: SetGapAnswer,
): { setGap: SetGapSummary } | { setGap: SetGapSummary; setName: string; notStocked: SetGapAnswer["notStocked"] } {
  return full ? { setGap: a.summary, setName: a.setName, notStocked: a.notStocked } : { setGap: a.summary };
}
