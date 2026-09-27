// THE indexing policy: for each kind of route, is it `index` or `noindex, follow`,
// and does it belong in the sitemap. Every route and sitemap section asks here
// instead of carrying its own threshold, so the two can never disagree.
//
// ADSENSE_REVIEW_MODE (server env var, default ON) tightens the policy while
// the domain is under AdSense review, so the indexable site is mostly editorial
// and reference pages. Pages stay live, crawlable and internally linked; only
// their robots tag and sitemap membership change. Set ADSENSE_REVIEW_MODE=false
// to restore the normal thresholds. See DECISIONS.md, 2026-09-27.
//
// NOT the paywall flag. NEXT_PUBLIC_ADSENSE_REVIEW_MODE (lib/adsense.ts) lifts
// the paywall and stays off by default; this one only touches indexing.
import { FACET_THIN_THRESHOLD } from "./facets";
import { STORE_THIN_THRESHOLD } from "./store-pages";
import { CHAMPION_THIN_THRESHOLD } from "./champions";
import { isOvernumbered, isSignature } from "./constants";

const RAW = (process.env.ADSENSE_REVIEW_MODE ?? "true").trim().toLowerCase();
export const INDEXING_REVIEW_MODE = !["false", "0", "off", "no"].includes(RAW);

/** Store pages need this many in-stock listings to be indexed during review. */
export const REVIEW_STORE_MIN_IN_STOCK = 25;

export interface IndexDecision {
  index: boolean;
  sitemap: boolean;
}

const INDEX: IndexDecision = { index: true, sitemap: true };
const NOINDEX: IndexDecision = { index: false, sitemap: false };

/** Spread into a route's Metadata: `...robotsMeta(decision)`. */
export function robotsMeta(d: IndexDecision): { robots?: { index: false; follow: true } } {
  return d.index ? {} : { robots: { index: false, follow: true } };
}

/** /cards/type/*, /cards/rarity/*, /cards/printing/* — filtered views of /browse. */
export function facetPolicy(total: number, reviewMode = INDEXING_REVIEW_MODE): IndexDecision {
  if (reviewMode) return NOINDEX;
  // -1 means the count query failed: stay indexed rather than guess.
  return total >= 0 && total < FACET_THIN_THRESHOLD ? NOINDEX : INDEX;
}

/** /stores/[slug], by in-stock listing count (-1 = unknown). */
export function storePolicy(inStock: number, reviewMode = INDEXING_REVIEW_MODE): IndexDecision {
  const min = reviewMode ? REVIEW_STORE_MIN_IN_STOCK : STORE_THIN_THRESHOLD;
  return inStock >= 0 && inStock < min ? NOINDEX : INDEX;
}

/** /champions/[slug], by card count (-1 = unknown). */
export function championPolicy(cardCount: number): IndexDecision {
  return cardCount >= 0 && cardCount < CHAMPION_THIN_THRESHOLD ? NOINDEX : INDEX;
}

/** A page whose main content is an empty state (0 results, nothing priced). */
export function emptyStatePolicy(resultCount: number): IndexDecision {
  return resultCount === 0 ? NOINDEX : INDEX;
}

/** Premium, account, checkout and search-result pages: never indexed. */
export const PRIVATE_POLICY: IndexDecision = NOINDEX;

// ── Card printings ───────────────────────────────────────────────────────────

export interface PrintingFields {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
}

/** Promo, Showcase, alt-art, Overnumbered and Signature prints are special printings. */
export function isSpecialPrinting(c: Pick<PrintingFields, "collectorNumber" | "rarity" | "variant" | "isPromo">): boolean {
  return (
    c.variant != null ||
    c.isPromo ||
    c.rarity === "Showcase" ||
    isOvernumbered(c.collectorNumber) ||
    isSignature(c.collectorNumber)
  );
}

/**
 * The base printing a special printing canonicalises to: same name, not itself
 * special, preferring the same set. Null when no base printing exists — that
 * printing is then the only page for the card and stays indexed.
 */
export function basePrintingOf<T extends PrintingFields>(card: T, siblings: T[]): T | null {
  if (!isSpecialPrinting(card)) return null;
  const bases = siblings.filter((s) => s.id !== card.id && s.name === card.name && !isSpecialPrinting(s));
  if (!bases.length) return null;
  return bases.find((b) => b.setCode === card.setCode) ?? bases.sort((a, b) => (a.slug ?? a.id).localeCompare(b.slug ?? b.id))[0];
}

/**
 * A card page's decision. `hasAnyPrice` = any retailer listing, in or out of
 * stock, has ever been recorded for it; a card with none is an empty table.
 */
export function cardPolicy(
  f: { isDuplicateRow: boolean; basePrinting: unknown | null; hasAnyPrice: boolean },
  reviewMode = INDEXING_REVIEW_MODE,
): IndexDecision {
  if (f.isDuplicateRow) return NOINDEX;
  if (!reviewMode) return INDEX;
  if (f.basePrinting) return NOINDEX;
  if (!f.hasAnyPrice) return NOINDEX;
  return INDEX;
}

// ── Static routes ────────────────────────────────────────────────────────────

/** Static paths that are private or transactional: noindex and out of the sitemap. */
export const PRIVATE_PATH_PREFIXES = [
  "/premium",
  "/login",
  "/verify",
  "/profile",
  "/dashboard",
  "/portfolio",
  "/watching",
  "/alerts/manage",
  "/alerts/action",
  "/admin",
] as const;

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Static paths noindexed during review: the rarity facet index, and /auctions —
 * a feed of third-party eBay lots that is often empty between sweeps.
 */
export const REVIEW_NOINDEX_PATHS = ["/cards/rarity", "/auctions"] as const;

/** The decision for a static path. */
export function staticPathPolicy(path: string, reviewMode = INDEXING_REVIEW_MODE): IndexDecision {
  if (isPrivatePath(path)) return NOINDEX;
  if (reviewMode && (REVIEW_NOINDEX_PATHS as readonly string[]).includes(path)) return NOINDEX;
  return INDEX;
}

/** Whether a core (static) path belongs in the sitemap. */
export function corePathInSitemap(path: string, reviewMode = INDEXING_REVIEW_MODE): boolean {
  return staticPathPolicy(path, reviewMode).sitemap;
}
