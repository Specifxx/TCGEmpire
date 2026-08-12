// Per-store landing pages (/stores/[slug]).
//
// tcgsnoop.com.au runs 33 of these and they're the one page type nobody in the
// Riftbound space has. They're also a link-acquisition play: stores link to
// pages that feature them.
//
// WHAT WE CAN AND CANNOT PUBLISH — read before adding fields.
// An audit of src/lib/retailers.ts found the RetailerInfo type has exactly eight
// fields (key, name, base, collections, shippingFlatCents, freeOverCents,
// shippingNote, country). There is NO street address, NO phone number, NO
// opening hours, and NO physical-store flag anywhere in this repo — not in
// retailers.ts, not in the Prisma schema, not in StoreSuggestion. So:
//
//   * These pages emit `Organization`, NOT `LocalBusiness`. LocalBusiness without
//     an address is a hollow entity claim, and inventing one is out of the
//     question. If verified address/phone/hours are ever collected, upgrade the
//     schema type then — not before.
//   * shippingFlatCents / freeOverCents are declared ESTIMATES by retailers.ts's
//     own header ("Shipping figures are ESTIMATES for the typical 'single card'
//     postage at each store"). They are rendered with an explicit "estimate"
//     label and never as a store's published rate. Where a real policy page
//     exists we link it instead, which is what shippingPolicyUrl() is for.
//
// Everything genuinely factual on these pages — inventory count, price range,
// cheapest current singles — comes from live RetailerPrice rows, which is real
// first-party data and the actual differentiator.
import { RETAILER_LIST, type RetailerInfo } from "./retailers";

export interface StorePage extends RetailerInfo {
  slug: string;
}

// Slug from the retailer key (already lowercase, alphanumeric-ish and unique —
// it's the DB's `retailer` column value, so it round-trips to the price rows
// without a lookup table).
export const storeSlug = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const STORE_PAGES: StorePage[] = RETAILER_LIST.map((r) => ({ ...r, slug: storeSlug(r.key) }));

const BY_SLUG = new Map(STORE_PAGES.map((s) => [s.slug, s]));
export const storeBySlug = (slug: string): StorePage | undefined => BY_SLUG.get(slug.toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// Display name for a store PAGE, disambiguated by market when it has to be.
// ─────────────────────────────────────────────────────────────────────────────
// Two chains (Danireon, Hobbiesville) serve more than one market off a single
// domain via Shopify Markets, and each market is a separate retailer key on
// purpose — the RetailerPrice rows would otherwise collide on
// @@unique([cardId, retailer, condition, isFoil]). Both keys carry the same
// `name`, so both store pages rendered the SAME <title>, which is a duplicate-
// title pair in Search Console and gives Google no reason to keep both.
//
// Found by scripts/seo-gate.ts against production, where all 77 store URLs are
// live (a local database has far fewer, which is why it had not surfaced).
//
// The market is appended ONLY when a name is genuinely shared, so the 75
// single-market stores are untouched — and it is derived from the data rather
// than a hand-maintained exception list, so a chain that adds a third market
// later disambiguates on its own. The suffix is also just better copy: these
// pages really are different (CAD vs USD pricing, different postage), and
// saying which market is what a reader needs to know.
const NAME_COUNTS = STORE_PAGES.reduce<Map<string, number>>(
  (m, s) => m.set(s.name, (m.get(s.name) ?? 0) + 1),
  new Map()
);

/** "Hobbiesville" for a single-market store, "Hobbiesville (Canada)" when the
 *  same trading name is tracked in more than one market. */
export function storePageName(store: StorePage, placeLabel: string): string {
  return (NAME_COUNTS.get(store.name) ?? 0) > 1 ? `${store.name} (${placeLabel})` : store.name;
}

/** Store names tracked in more than one market — used by the test that pins
 *  this behaviour so it reads the same data the helper does. */
export const sharedStoreNames = (): string[] =>
  [...NAME_COUNTS.entries()].filter(([, n]) => n > 1).map(([name]) => name);

// NOTE ON FALLBACK RETAILERS: these pages are built from RETAILER_LIST, which
// contains only real configured stores. The converted reference sources
// (tcgplayer_au/uk/sg, cardmarket) live in lib/constants.ts and are NOT in
// RETAILERS, so they can't leak in here. That safety depends on iterating
// RETAILER_LIST — if this is ever rewritten to iterate
// `retailerPrice.groupBy({ by: ["retailer"] })` instead, it WILL pick them up,
// along with the marketplace and eBay pseudo-retailers, and each would render a
// store page for something that isn't a store.

// Below this many in-stock listings a store page is thin — noindex it rather
// than publish a page whose only content is "0 cards in stock". Several tracked
// retailers are deliberately directory-only (no webstore, or a catalogue we
// don't auto-price), so this is a normal state, not an error.
export const STORE_THIN_THRESHOLD = 5;
