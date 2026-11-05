// /browse's constants and query helpers, CLIENT-SAFE ON PURPOSE (2026-11-05,
// DECISIONS.md "The card list becomes one CDN copy per URL"): the
// BrowseMarketBoard island imports these, and the server view
// (lib/browse-view.ts, which queries the database) re-exports them. A value
// import of lib/browse-view.ts from a client file would drag Prisma and
// node:crypto into the browser bundle.
import type { CardQuery } from "./cards";

/** /browse opens on "Most popular" (lib/cards.ts buildCardOrderBy). */
export const BROWSE_DEFAULT_SORT = "popular";

/**
 * Sealed products shown above the card grid for a text search (2026-10-04, owner:
 * "if I search origins and I click enter, there's no sealed products found").
 * More than this link on to /sealed?q= for the rest.
 */
export const BROWSE_SEALED_SHOWN = 6;

/** Filters that only mean something for single cards: a sealed box has no rarity, domain or printing. */
export const CARD_ONLY_FILTERS = [
  "domain", "rarity", "type", "set", "variant", "tag", "rules", "rulesSet",
  "sig", "over", "ult", "promo", "printing", "priced", "min", "max",
] as const satisfies readonly (keyof CardQuery)[];

export type BrowseParams = CardQuery & { market?: string };

/** The page's own query, without `market`: what the island repeats to the API. Only set keys. */
export function browseQuery(sp: BrowseParams): CardQuery {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k === "market" || !v) continue;
    out[k] = v;
  }
  return out as CardQuery;
}
