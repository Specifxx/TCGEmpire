// How many watched cards may carry a TARGET PRICE ("Notify me at $X"), per
// tier (2026-09-25 premium lineup). Plain watches and the weekly new-low
// email are free for every account — up to FREE_WATCHLIST_LIMIT distinct cards
// on a free account, unlimited on any paid tier (lib/free-limits.ts,
// 2026-09-28); the target trigger is the paid one, and only Plus has a ceiling. Premium's "unlimited" is
// the ladder the rest of the category uses (MTGStocks, Pricempire, Market
// Movers) — see DECISIONS.md, "Premium lineup: fewer tools, each one worth
// paying for".
//
// Shared by the PATCH route that sets a target (the enforcement) and every
// surface that quotes the number (tier table, pricing cards, watchlist), so
// the promise and the check can never drift apart.
export const PLUS_TARGET_ALERT_LIMIT = 25;

export function targetAlertLimit(tier: "plus" | "premium" | null | undefined): number {
  if (tier === "premium") return Number.POSITIVE_INFINITY;
  if (tier === "plus") return PLUS_TARGET_ALERT_LIMIT;
  return 0;
}

// ── Deck price watches and sealed watches (2026-09-29, "Premium works while
// you're away" — DECISIONS.md) ─────────────────────────────────────────────
//
// A DECK PRICE WATCH (a saved list priced delivered after every import, emailed
// at a target or on a material drop) is Premium only, up to DECK_WATCH_LIMIT
// per account: each is a bounded RetailerPrice read per run, so "unlimited"
// would let one account set the run's egress.
export const DECK_WATCH_LIMIT = 10;

export function deckWatchLimit(tier: "plus" | "premium" | null | undefined): number {
  return tier === "premium" ? DECK_WATCH_LIMIT : 0;
}

// A SEALED WATCH (restock, at-RRP, target and drop emails for one sealed
// product in one market) is Plus and Premium: Plus up to
// SEALED_WATCH_LIMIT_PLUS, Premium unlimited — the same ladder as targets.
// The run reads the self-cached sealed groups once per market whatever the
// count, so unlimited costs nothing extra.
export const SEALED_WATCH_LIMIT_PLUS = 10;

export function sealedWatchLimit(tier: "plus" | "premium" | null | undefined): number {
  if (tier === "premium") return Number.POSITIVE_INFINITY;
  if (tier === "plus") return SEALED_WATCH_LIMIT_PLUS;
  return 0;
}

// HOW OFTEN A SEALED WATCH IS CHECKED, as copy (2026-09-29). Four store reads a
// day (refresh-prices.yml at 07:00 and 19:00 UTC, sealed-refresh.yml at 01:00
// and 13:00), each followed by the sealed alert pass: about every six hours, and
// "about" because the GitHub scheduler starts a run late. Never "instant", never
// "first in line": a Discord stock bot polls faster than a price site can, and
// the copy says so. One definition, so the table, the FAQ, the watch form and
// the email cannot drift apart (tests/sealed-cadence.test.ts pins them).
export const SEALED_CHECK_CADENCE = "about every six hours";
export const SEALED_CHECK_SENTENCE = `Sealed products are checked ${SEALED_CHECK_CADENCE}, so stock may have moved since. A Discord stock bot may be faster.`;

// Premium's "unlimited" sealed watches still stop at a sanity ceiling, so one
// account cannot fill the watch table (and the paid run's read cap, which is
// oldest-first) with junk rows. Nobody tracks two hundred sealed products; the
// number is quoted from here by the create route, the run and the copy that
// explains it. `sealedWatchLimit` stays the marketing ladder (Infinity =
// "Unlimited"); this is the enforcement.
export const SEALED_WATCH_HARD_CAP = 200;

export function sealedWatchCeiling(tier: "plus" | "premium" | null | undefined): number {
  return Math.min(sealedWatchLimit(tier), SEALED_WATCH_HARD_CAP);
}
