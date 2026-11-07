// MEMBER-FEATURED LISTINGS, the pure half (owner, 2026-11-07: "a premium feature
// could be for sellers to feature their listing on our website on a featured
// page … for premium users to enter a link to their listing and get it
// featured"). DECISIONS.md, "Premium members feature their own eBay listings".
//
// A member pastes a link; nothing they type is ever shown. The auction sweep
// (refresh-auctions.yml) asks eBay's getItem for each pending or live row and
// judgeItem below decides, from eBay's own answer, whether it is a live
// Riftbound listing. Only then does /featured show it, with eBay's title,
// photo, price and end time, labelled as the seller's own listing.

/** The eBay sites we can tag (lib/affiliate.ts EBAY_MARKETS), and the Browse marketplace each is read from. */
export const FEATURE_HOSTS: Record<string, string> = {
  "ebay.com.au": "EBAY_AU",
  "ebay.com": "EBAY_US",
  "ebay.co.uk": "EBAY_GB",
  "ebay.ca": "EBAY_CA",
  "ebay.es": "EBAY_ES",
  "ebay.com.sg": "EBAY_SG",
};

/** Live or pending at once, per member. */
export const MEMBER_FEATURE_LIMIT = 3;
/** A listing is featured for at most this long; the member can add it again. */
export const FEATURE_DAYS = 30;
/** getItem calls one sweep may spend on these (six sweeps a day). */
export const FEATURE_CHECKS_PER_SWEEP = 40;
export const FEATURED_TAG = "featured-listings";

export type FeatureStatus = "pending" | "live" | "rejected" | "ended" | "removed";

/** An /itm/ link on one of our eBay sites → its host and item id, or null. */
export function parseEbayItemLink(input: string): { host: string; itemId: string } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (!(host in FEATURE_HOSTS)) return null;
  const m = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:[/?]|$)/) ?? u.pathname.match(/\/itm\/(\d{9,15})/);
  const id = m?.[1] ?? (u.pathname.startsWith("/itm") ? u.searchParams.get("item") : null);
  return id && /^\d{9,15}$/.test(id) ? { host, itemId: id } : null;
}

/** eBay's app share links (ebay.io/m/…, ebay.us/…), which only redirect. */
export function isEbayShortLink(input: string): boolean {
  try {
    const h = new URL(input.trim()).hostname.toLowerCase();
    return h === "ebay.io" || h === "ebay.us" || h === "ebay.to";
  } catch {
    return false;
  }
}

export interface ItemFacts {
  title: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  format: "auction" | "buy_it_now";
  bids: number | null;
  endsAt: string | null;
  seller: string | null;
  location: string | null;
  condition: string | null;
}

export type Verdict =
  | { status: "live"; facts: ItemFacts }
  | { status: "rejected" | "ended"; reason: string; facts?: ItemFacts };

const RIFTBOUND = /\briftbound\b/i;

function cents(v: unknown): number | null {
  const n = Number((v as { value?: unknown } | undefined)?.value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/**
 * eBay getItem's answer (or null for a 404) → what /featured may show.
 * Exported and pure for tests/featured-submissions.test.ts.
 */
export function judgeItem(item: any, now: number, createdAt: number): Verdict {
  if (!item) return { status: "ended", reason: "eBay no longer lists it (sold, ended or removed)." };
  const options: string[] = Array.isArray(item.buyingOptions) ? item.buyingOptions : [];
  const auction = options.includes("AUCTION");
  const price = auction ? (cents(item.currentBidPrice) ?? cents(item.price)) : cents(item.price);
  const currency = String((auction ? item.currentBidPrice?.currency : null) ?? item.price?.currency ?? "");
  const loc = item.itemLocation ?? {};
  const facts: ItemFacts = {
    title: String(item.title ?? "").slice(0, 200),
    priceCents: price ?? 0,
    currency,
    imageUrl: typeof item.image?.imageUrl === "string" ? item.image.imageUrl : null,
    format: auction ? "auction" : "buy_it_now",
    bids: auction && Number.isFinite(Number(item.bidCount)) ? Number(item.bidCount) : null,
    endsAt: typeof item.itemEndDate === "string" ? item.itemEndDate : null,
    seller: typeof item.seller?.username === "string" ? item.seller.username : null,
    location: [loc.city, loc.stateOrProvince, loc.country].filter((s) => typeof s === "string" && s).join(", ") || null,
    condition: typeof item.condition === "string" ? item.condition : null,
  };
  const aspects: { name?: string; value?: string }[] = Array.isArray(item.localizedAspects) ? item.localizedAspects : [];
  const gameSaysRiftbound = aspects.some((a) => /^(game|franchise|tcg)$/i.test(a.name ?? "") && RIFTBOUND.test(a.value ?? ""));
  if (!RIFTBOUND.test(facts.title) && !gameSaysRiftbound) return { status: "rejected", reason: "Not a Riftbound listing.", facts };
  if (!price || !currency) return { status: "rejected", reason: "eBay shows no price for it.", facts };
  if (!facts.imageUrl) return { status: "rejected", reason: "The listing has no photo.", facts };
  if (!auction && !options.includes("FIXED_PRICE")) return { status: "rejected", reason: "Only auctions and Buy It Now listings can be featured.", facts };
  const stock = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  if (stock === "OUT_OF_STOCK") return { status: "ended", reason: "It has sold.", facts };
  if (facts.endsAt && Date.parse(facts.endsAt) <= now) return { status: "ended", reason: "The listing has ended.", facts };
  if (now - createdAt >= FEATURE_DAYS * 86_400_000) return { status: "ended", reason: `${FEATURE_DAYS} days are up; add it again to keep it featured.`, facts };
  return { status: "live", facts };
}

/** When a live row stops showing: the listing's end, or 30 days after it was added. */
export function featureEndsAt(endsAt: string | null, createdAt: string): number {
  const cap = Date.parse(createdAt) + FEATURE_DAYS * 86_400_000;
  return endsAt ? Math.min(Date.parse(endsAt), cap) : cap;
}
