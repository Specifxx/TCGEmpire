// COMPLETE MY SET, AFTER A SCAN (2026-11-19, DECISIONS.md "Complete my set after a scan"). The pure half: which of the
// scanned card's set the member is missing, cheapest first, and for each one the buy links the panel shows in the site's
// row order: eBay (a tagged SEARCH, never an API call), TCGplayer, then the cheapest real store with its price.
//
// "Missing" and "cheapest" are the set tracker's own (lib/set-scope.ts, lib/set-gap.ts missingIn, lib/set-checklist.ts):
// the base set by default, a card counts as owned in any finish or condition, and a card's price is its cheapest in-stock
// listing at a REAL store in the reader's market (never eBay, never a converted reference row, never a cloned row). A card
// no real store has is counted apart, never shown with a price it does not have.
//
// No "@/" imports and no database: the route (app/api/scan/set-gap) does the reads, tests drive this directly.
import { missingIn } from "../set-gap";
import { stockOf, type ChecklistCard, type OwnedMap, type SetScope } from "../set-scope";

/** Rows the panel shows at a time; "Show more" asks for the next page. */
export const SCAN_GAP_PAGE = 6;
export const SCAN_GAP_MAX_OFFSET = 600;

export interface GapListingRow {
  cardId: string;
  retailer: string;
  retailerName: string;
  url: string;
  priceCents: number;
  currency: string;
  condition: string | null;
  inStock: boolean;
  derived: boolean | null;
}

export interface GapLinks {
  /** The cheapest TCGplayer listing (any market's TCGplayer key), or null. */
  tcgplayer: GapListingRow | null;
  /** The cheapest in-stock real store that is not TCGplayer, or null. */
  store: GapListingRow | null;
}

export const isTcgplayerKey = (retailer: string) => retailer.toLowerCase().startsWith("tcgplayer");

/** Pure: one card's TCGplayer row and cheapest real-store row. `fallback` = the market's converted reference keys. */
export function pickGapLinks(rows: readonly GapListingRow[], fallback: readonly string[]): Map<string, GapLinks> {
  const out = new Map<string, GapLinks>();
  for (const r of rows) {
    if (!r.inStock || r.priceCents <= 0 || !r.url) continue;
    const key = r.retailer.toLowerCase();
    if (key.startsWith("ebay")) continue; // eBay is the search link, never a priced row here
    const slot = out.get(r.cardId) ?? { tcgplayer: null, store: null };
    if (isTcgplayerKey(key)) {
      // A reference row (tcgplayer_market, tcgplayer_au) still opens TCGplayer's own page: fine for the link.
      if (!slot.tcgplayer || r.priceCents < slot.tcgplayer.priceCents) slot.tcgplayer = r;
    } else if (r.derived !== true && !fallback.includes(r.retailer)) {
      if (!slot.store || r.priceCents < slot.store.priceCents || (r.priceCents === slot.store.priceCents && r.retailer < slot.store.retailer)) slot.store = r;
    }
    out.set(r.cardId, slot);
  }
  return out;
}

export interface ScanGap {
  /** Cards in the scope, and how many the member has. */
  total: number;
  have: number;
  /** Missing cards a real store has in stock, and the cost of one each at the cheapest listing. */
  buyable: number;
  costCents: number;
  /** Missing cards no real store has in stock today. */
  notStocked: number;
  /** This page of buyable missing cards, cheapest first. */
  page: ChecklistCard[];
  /** The offset of the next page, or null. */
  next: number | null;
}

/** Pure: the member's gap in one set, cheapest first, paged. */
export function scanGap(cards: readonly ChecklistCard[], owned: OwnedMap, opts: { scope?: SetScope; offset?: number; size?: number } = {}): ScanGap {
  const scope = opts.scope ?? "base";
  const size = opts.size ?? SCAN_GAP_PAGE;
  const offset = Math.max(0, Math.min(SCAN_GAP_MAX_OFFSET, Math.floor(opts.offset ?? 0)));
  const { missing, ownedInScope } = missingIn(cards, owned, { scope });
  const buyable = missing
    .filter((c) => stockOf(c) === "store")
    .sort((a, b) => a.minCents! - b.minCents! || a.collectorNumber.localeCompare(b.collectorNumber, "en", { numeric: true }) || a.id.localeCompare(b.id));
  const page = buyable.slice(offset, offset + size);
  return {
    total: missing.length + ownedInScope,
    have: ownedInScope,
    buyable: buyable.length,
    costCents: buyable.reduce((s, c) => s + c.minCents!, 0),
    notStocked: missing.length - buyable.length,
    page,
    next: offset + size < buyable.length ? offset + size : null,
  };
}
