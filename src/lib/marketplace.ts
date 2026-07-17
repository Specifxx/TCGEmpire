// RiftCompare Marketplace — shared config + the price-comparison integration.
//
// Verified sellers list cards here; their cheapest active listing per card shows up
// in the normal price comparison as a "RiftCompare Marketplace" source (one row per
// market, just like the stores). Buying runs in test/wallet mode for now — real
// payouts move to Stripe Connect (see docs/MARKETPLACE.md).
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { CONDITION_KEYS } from "./constants";
import { SITE_URL } from "./site";

// Per-market retailer keys, mirroring how eBay uses ebay / ebay_us / ebay_uk. The
// RetailerPrice unique key is [cardId, retailer, condition, isFoil] (no country), so
// a single "marketplace" key serving multiple markets would collide — hence one key
// per market.
export const MARKETPLACE_RETAILER: Record<string, string> = {
  AU: "marketplace",
  NZ: "marketplace_nz",
  US: "marketplace_us",
  UK: "marketplace_uk",
};
export const MARKETPLACE_RETAILER_KEYS = Object.values(MARKETPLACE_RETAILER);
export const MARKETPLACE_RETAILER_NAME = "RiftCompare Marketplace";

// Platform fee on a marketplace sale, in basis points (300 = 3%). Kept off the
// buyer's price; deducted from the seller's payout.
export const MARKETPLACE_FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS ?? 300);

// ── Private beta gating ────────────────────────────────────────────────────────
// While false, marketplace listings are NOT shown in the public price comparison
// and are only visible/buyable to the allow-listed beta emails (the test buyer).
// Flip MARKETPLACE_PUBLIC=1 (env) to launch publicly.
export const MARKETPLACE_PUBLIC = process.env.MARKETPLACE_PUBLIC === "1";
export const MARKETPLACE_BETA_EMAILS = (process.env.MARKETPLACE_BETA_EMAILS ?? "test@test.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Who may see/buy listings right now. Public when launched; otherwise only the
// allow-listed beta testers and admins (so admins can manage/test the marketplace
// while it stays invisible to everyone else — including the owner's own listings).
export function canViewMarketplaceListings(email?: string | null, isAdmin?: boolean): boolean {
  if (MARKETPLACE_PUBLIC || isAdmin) return true;
  return !!email && MARKETPLACE_BETA_EMAILS.includes(email.toLowerCase());
}

export const MARKETPLACE_COUNTRIES = ["AU", "NZ", "US", "UK", "SG"] as const;
export const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", SG: "SGD" };

export function platformFeeCents(priceCents: number): number {
  return Math.round((priceCents * MARKETPLACE_FEE_BPS) / 10000);
}

// ── Offers ─────────────────────────────────────────────────────────────────────
// "Make an offer" guardrails: offers live 72h, and a lowball below 30% of asking
// is rejected outright (it's spam, not negotiation).
export const OFFER_EXPIRY_HOURS = 72;
export const OFFER_MIN_RATIO = 0.3;

export function offerExpiry(): Date {
  return new Date(Date.now() + OFFER_EXPIRY_HOURS * 3600_000);
}

// A seller's aggregate rating from marketplace reviews (null avg = no reviews yet).
export async function getSellerRating(sellerId: string): Promise<{ avg: number | null; count: number }> {
  const agg = await prisma.marketplaceReview.aggregate({
    where: { sellerId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    avg: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
    count: agg._count._all,
  };
}

// Ratings for many sellers in one query (for listing grids).
export async function getSellerRatings(sellerIds: string[]): Promise<Map<string, { avg: number; count: number }>> {
  if (!sellerIds.length) return new Map();
  const rows = await prisma.marketplaceReview.groupBy({
    by: ["sellerId"],
    where: { sellerId: { in: sellerIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((r) => [r.sellerId, { avg: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all }])
  );
}

// Validate a listing payload from a seller. Returns a normalised object or an error.
export function validateListingInput(input: any):
  | { ok: true; condition: string; isFoil: boolean; priceCents: number; quantity: number }
  | { ok: false; error: string } {
  const condition = String(input?.condition ?? "").toUpperCase();
  if (!CONDITION_KEYS.includes(condition)) return { ok: false, error: "Invalid condition" };
  const isFoil = !!input?.isFoil;
  const priceCents = Math.round(Number(input?.priceCents));
  if (!Number.isFinite(priceCents) || priceCents < 1 || priceCents > 100_000_00) {
    return { ok: false, error: "Price must be between $0.01 and $100,000" };
  }
  const quantity = Math.round(Number(input?.quantity ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
    return { ok: false, error: "Quantity must be between 1 and 999" };
  }
  return { ok: true, condition, isFoil, priceCents, quantity };
}

// Rebuild the marketplace's rows in RetailerPrice from active listings, so listed
// cards appear in the price comparison. One row per (card, market) = the cheapest
// active listing. Called by the price importer; also runnable on its own after a
// listing change so the comparison updates promptly.
export async function importMarketplaceListings(): Promise<number> {
  // Replace all marketplace rows across every market key.
  await prisma.retailerPrice.deleteMany({ where: { retailer: { in: MARKETPLACE_RETAILER_KEYS } } });
  // During private beta, keep listings OUT of the public comparison entirely.
  if (!MARKETPLACE_PUBLIC) return 0;

  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "ACTIVE", quantity: { gt: 0 } },
    orderBy: { priceCents: "asc" }, // cheapest first → first seen per (card,market) wins
    select: {
      cardId: true,
      condition: true,
      isFoil: true,
      priceCents: true,
      currency: true,
      country: true,
      seller: { select: { sellerProfile: { select: { shippingFlatCents: true } } } },
    },
  });

  // Cheapest active listing per (card, market).
  const best = new Map<string, (typeof listings)[number]>();
  for (const l of listings) {
    const key = `${l.cardId}|${l.country}`;
    if (!best.has(key)) best.set(key, l);
  }

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  for (const l of best.values()) {
    const retailer = MARKETPLACE_RETAILER[l.country];
    if (!retailer) continue;
    const ship = l.seller.sellerProfile?.shippingFlatCents ?? null;
    rows.push({
      cardId: l.cardId,
      retailer,
      retailerName: MARKETPLACE_RETAILER_NAME,
      title: "RiftCompare Marketplace listing",
      url: `${SITE_URL}/marketplace`,
      condition: l.condition,
      isFoil: l.isFoil,
      priceCents: l.priceCents,
      // Seller's flat postage where set (>0); otherwise leave unknown.
      shippingCents: ship && ship > 0 ? ship : null,
      currency: l.currency,
      country: l.country,
      inStock: true,
    });
  }

  if (rows.length) await prisma.retailerPrice.createMany({ data: rows });
  return rows.length;
}
