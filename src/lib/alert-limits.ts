// How many watched cards may carry a TARGET PRICE ("Notify me at $X"), per
// tier (2026-09-25 premium lineup). Plain watches and the weekly new-low
// email stay unlimited and free for every account; only the paid target
// trigger is metered, and only Plus has a ceiling. Premium's "unlimited" is
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
