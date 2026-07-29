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
