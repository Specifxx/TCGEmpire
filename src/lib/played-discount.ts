// How much cheaper is this played copy than the cheapest Near Mint one here?
//
// The useful part of the retired Condition Impact Calculator (2026-09-25), moved
// to where the question actually comes up: next to a played listing's buy
// button on the card page. The calculator multiplied one number by a fixed
// table, so every card in the game showed NM → LP as −15%, and it treated the
// cheapest copy in ANY condition as Near Mint. This uses the card's own live
// listings instead: "LP · 22% under the cheapest NM here" compares a real
// played copy with a real NM copy from the same market's in-stock list, which
// the page has already loaded (no new query).
//
// Like for like: a foil played copy is compared with the cheapest NM FOIL, a
// non-foil one with the cheapest NM non-foil, because the foil premium would
// otherwise swamp the condition discount. No NM copy of the same finish in the
// market, no note: there is nothing honest to compare with.
//
// And no "a typical LP discount is about 15%" beside it: that 15% is the site's
// own CONDITION_MULTIPLIER valuation assumption (unsourced, the same fixed table
// the retired calculator was faulted for), not a market norm, and quoting it
// next to a real listing would present an invented number as one.
import { normaliseCondition } from "./constants";

export interface ConditionListing {
  id: string;
  condition: string | null;
  isFoil: boolean;
  priceCents: number;
}

export interface PlayedDiscount {
  /** LP, MP, HP or DMG. */
  grade: string;
  /** Whole percent below the cheapest NM copy of the same finish; ≤ 0 = no cheaper. */
  pctUnder: number;
  cheapestNmCents: number;
}

const PLAYED = new Set(["LP", "MP", "HP", "DMG"]);

/** One entry per played listing that has an NM copy of the same finish to compare with. */
export function playedDiscounts(listings: readonly ConditionListing[]): Map<string, PlayedDiscount> {
  const cheapestNm = new Map<boolean, number>();
  for (const l of listings) {
    if (normaliseCondition(l.condition) !== "NM" || !(l.priceCents > 0)) continue;
    const cur = cheapestNm.get(l.isFoil);
    if (cur == null || l.priceCents < cur) cheapestNm.set(l.isFoil, l.priceCents);
  }
  const out = new Map<string, PlayedDiscount>();
  for (const l of listings) {
    const grade = normaliseCondition(l.condition);
    if (!grade || !PLAYED.has(grade)) continue;
    const nm = cheapestNm.get(l.isFoil);
    if (nm == null) continue;
    out.set(l.id, {
      grade,
      pctUnder: Math.round(((nm - l.priceCents) / nm) * 100),
      cheapestNmCents: nm,
    });
  }
  return out;
}

/** "22% under the cheapest NM here", or the honest opposite when it isn't cheaper. */
export function playedDiscountText(d: PlayedDiscount): string {
  if (d.pctUnder > 0) return `${d.pctUnder}% under the cheapest NM here`;
  if (d.pctUnder === 0) return "same price as the cheapest NM here";
  return "costs more than the cheapest NM here";
}
