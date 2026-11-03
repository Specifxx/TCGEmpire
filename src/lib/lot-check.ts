// The lot checker (DECISIONS.md, "Lot checker", 2026-10-27): someone looking at
// an eBay lot or a collection for sale pastes what is in it into the deck pricer,
// types the asking price, and sees whether it beats buying those cards as
// singles. Pure; the DeckBuilder's LotCheck box draws it.

/** "12.50" / "12,50" / "$1,234" → cents, or null for anything that isn't a positive amount. */
export function parseAskCents(input: string): number | null {
  let s = input.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // A comma followed by exactly two digits at the end is a decimal comma.
  if (/,\d{2}$/.test(s) && !s.includes(".")) s = s.replace(",", ".");
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export interface LotVerdict {
  kind: "cheaper" | "even" | "dearer";
  /** singles − ask: positive when the lot is cheaper. */
  diffCents: number;
  /** |diff| as a share of the singles total, whole percent. */
  pct: number;
}

/** Within 5% either way is "about the same": prices and postage move more than that. */
export function lotVerdict(askCents: number, singlesCents: number): LotVerdict | null {
  if (!(askCents > 0) || !(singlesCents > 0)) return null;
  const diffCents = singlesCents - askCents;
  const pct = Math.round((Math.abs(diffCents) / singlesCents) * 100);
  const kind = pct < 5 ? "even" : diffCents > 0 ? "cheaper" : "dearer";
  return { kind, diffCents, pct };
}
