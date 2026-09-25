// ── METHODOLOGY BREAKS ────────────────────────────────────────────────────────
// Windows in which a step in the series comes from a change in how prices are
// SOURCED rather than from the market moving. Moved out of market-index.ts on
// 2026-09-25 so every reader that compares two points of PriceHistory can honour
// the same list — until then only the Index did, and /movers, Rising Cards, the
// homepage table and the card-page narrative printed the 09-23 re-basing as a
// market-wide crash.
//
// THIS MODULE HAS NO IMPORTS, ON PURPOSE. lib/price-history.ts re-exports all of
// it (and market-index.ts re-exports METHODOLOGY_BREAKS from there), so server
// readers keep importing from price-history as before. But price-history pulls
// in Prisma, and one comparing reader — lib/content/card-narrative.ts — is also
// reachable from a client bundle (lib/box-ev.ts → BoxEvCalculator), where the
// database client must never land. Keeping the list dependency-free lets that
// reader import the same helper directly.
//
// 2026-09-23: the US TCGplayer row switched from TCGplayer's market price to
// the cheapest English Near-Mint listing (lib/tcgplayer.ts), sampled at a median
// 25% below market. For many cards that row IS the US low, and PriceHistory
// records each card's low across markets, so the first snapshot on the new
// basis would otherwise read as a market-wide drop. The window is eight days,
// not one, because PriceHistory writes at most weekly per card and it cannot be
// known from the date alone whether a snapshot written on the switch day came
// before or after the deploy — so every step ending in that span is suspect.
//
// Two ways to honour a break, one per shape of reader:
//   • a chain-linked LEVEL (the Index) flattens each step ending inside
//     [from, to) — chainLinkSeries in market-index.ts;
//   • a per-card COMPARISON (movers, 7-day changes, range position, records,
//     the card-page trajectory) must never compare a point recorded before the
//     new basis with one recorded after it — dropBreakWindow below.
//     tests/methodology-breaks.test.ts fails if a file that reads PriceHistory
//     (directly, or through getPriceHistory) neither imports it nor is exempted
//     there with a reason.
//
// `settled` is the first instant from which every recorded point is certainly
// on the new basis (defaults to `to`). For 09-23 that is the next Sydney day:
// the switch deployed on the 23rd, so only a point dated the 23rd can be either
// basis. PriceHistory.day is the Sydney date at UTC midnight, the same encoding
// as these bounds.
export type MethodologyBreak = { from: number; to: number; settled?: number; why: string };

export const METHODOLOGY_BREAKS: readonly MethodologyBreak[] = [
  {
    from: Date.UTC(2026, 8, 23),
    to: Date.UTC(2026, 9, 1),
    settled: Date.UTC(2026, 8, 24),
    why: "US TCGplayer row: market price -> cheapest English NM listing",
  },
];

// Drops every point a comparison must not reach back to across a break. For
// each break the series has reached (a point at or after `from`):
//   • with a point at or after `settled`, the series restarts at the first
//     such point — everything older is on the old basis or might be;
//   • with none (the newest point is from the switch day itself, whose basis
//     is unknown), only that newest point is kept, so nothing is compared.
// A series that never reached the break is returned untouched, and the order
// of the kept points is preserved.
//
// The cost is the Index's cost: about a week of genuine movement is never
// measured, and a card needs new post-break points before a mover, a 7-day
// change or a range position means anything again. A live price appended as the
// newest point (Rising Cards does this) takes part like any other point: until
// a snapshot on the new basis is in the series, the live point is all that is
// left and nothing is compared.
export function dropBreakWindow<T extends { t: number }>(
  points: readonly T[],
  breaks: readonly { from: number; to: number; settled?: number }[] = METHODOLOGY_BREAKS,
): T[] {
  let kept = [...points];
  for (const b of breaks) {
    const settled = b.settled ?? b.to;
    let reached = false;
    let firstSettled: number | null = null;
    let newestUnsure: number | null = null;
    for (const p of kept) {
      if (p.t < b.from) continue;
      reached = true;
      if (p.t >= settled) firstSettled = firstSettled == null ? p.t : Math.min(firstSettled, p.t);
      else newestUnsure = newestUnsure == null ? p.t : Math.max(newestUnsure, p.t);
    }
    if (!reached) continue;
    const cut = firstSettled ?? newestUnsure!;
    kept = kept.filter((p) => p.t >= cut);
  }
  return kept;
}

// The break a reader should still explain to a visitor, if any: one whose window
// opened on or before `now` and closed less than `graceDays` ago. After that the
// weekly comparisons have rebuilt on the new basis and there is nothing to say.
export function recentMethodologyBreak(now = Date.now(), graceDays = 14): MethodologyBreak | null {
  for (const b of METHODOLOGY_BREAKS) {
    if (now >= b.from && now < b.to + graceDays * 86400_000) return b;
  }
  return null;
}

// The instant from which every recorded point is certainly on the CURRENT
// pricing basis: the `settled` (else `to`) of the latest break that has opened
// by `now`, or null when none has. Two uses:
//   • a reader that only ever compares on the current basis need not READ
//     anything older (Rising Cards' weekly history load starts here — every
//     earlier point would be dropped by dropBreakWindow anyway);
//   • a board that compares against a "record" can say honestly what the
//     record is a record OF ("its high since 24 Sep 2026", not "all-time"),
//     because that date never ages out: dropBreakWindow always restarts there.
export function currentBasisStart(
  now = Date.now(),
  breaks: readonly { from: number; to: number; settled?: number }[] = METHODOLOGY_BREAKS,
): number | null {
  let start: number | null = null;
  for (const b of breaks) {
    if (b.from > now) continue;
    const settled = b.settled ?? b.to;
    if (start == null || settled > start) start = settled;
  }
  return start;
}
