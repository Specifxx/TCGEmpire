// RiftCompare Marketplace — shared config + the price-comparison integration.
//
// A P2P marketplace: any signed-in, email-verified user can list and sell. Their
// cheapest active listing per card shows up in the normal price comparison as a
// "RiftCompare Marketplace" source (one row per market, just like the stores) AND
// as the hero block above it (see MarketplaceHeroBlock). Payment is real Stripe
// Checkout to the platform account; payouts to sellers happen via Stripe Connect
// once an order is confirmed delivered (see lib/connect.ts) — see docs/MARKETPLACE.md.
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { CONDITION_KEYS } from "./constants";
import { SITE_URL } from "./site";
import { MARKETPLACE_LAUNCH_COUNTRIES, isLaunchCountry, CURRENCY_BY_COUNTRY } from "./marketplace-countries";
import {
  MARKETPLACE_FEE_BPS,
  MARKETPLACE_PREMIUM_FEE_BPS,
  marketplaceFeeBps,
  platformFeeCents,
  MARKETPLACE_SHIP_DEADLINE_DAYS,
  MARKETPLACE_AUTO_RELEASE_DAYS,
} from "./marketplace-policy";

export { MARKETPLACE_LAUNCH_COUNTRIES, isLaunchCountry, CURRENCY_BY_COUNTRY };
// Fee + escrow-timing policy lives in the prisma-free ./marketplace-policy (so
// client components can import it); re-exported here for all server-side callers.
export { MARKETPLACE_FEE_BPS, MARKETPLACE_PREMIUM_FEE_BPS, marketplaceFeeBps, platformFeeCents, MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS };

// Per-market retailer keys, mirroring how eBay uses ebay / ebay_us / ebay_uk. The
// RetailerPrice unique key is [cardId, retailer, condition, isFoil] (no country), so
// a single "marketplace" key serving multiple markets would collide — hence one key
// per market.
export const MARKETPLACE_RETAILER: Record<string, string> = {
  AU: "marketplace",
  US: "marketplace_us",
  UK: "marketplace_uk",
  SG: "marketplace_sg",
  CA: "marketplace_ca",
};
export const MARKETPLACE_RETAILER_KEYS = Object.values(MARKETPLACE_RETAILER);
export const MARKETPLACE_RETAILER_NAME = "RiftCompare Marketplace";

// Private listings (Phase 2, lower priority) get a reduced fee — not wired into
// checkout yet, but reserved here so the constant has one home.
export const MARKETPLACE_PRIVATE_FEE_BPS = Number(process.env.MARKETPLACE_PRIVATE_FEE_BPS ?? 200);

// Feature flag for the "make an offer" flow — OFF at launch (offers don't settle
// through Stripe yet; see MARKETPLACE_RETAILER comment / plan Phase 2 item 1).
export const MARKETPLACE_OFFERS = process.env.MARKETPLACE_OFFERS === "1";

// New-seller listing caps (the old D8 guardrail — max active listings + max
// combined active value until N completed sales) were REMOVED: they were the
// single biggest blocker to sellers actually loading their inventory, and the
// real protections against a bad seller don't depend on them — the buyer always
// pays the platform first and funds sit in escrow until delivery is confirmed
// (lib/connect.ts), the ship deadline auto-cancels+refunds a no-show seller,
// buyer protection covers not-received/not-as-described, and an abusive account
// can be suspended outright (SellerProfile.suspendedAt). Sellers may now list
// unlimited inventory at any value.

// ── Feature disabled (2026-08-19) ───────────────────────────────────────────────
// The marketplace is fully switched off site-wide — no browsing, buying, or
// creating new listings/offers for anyone, including admins and beta testers.
// Hardcoded rather than env-driven so a code push, not a separate Vercel
// dashboard change, is what re-enables/disables it — NEXT_PUBLIC_MARKETPLACE_PUBLIC
// is no longer read. All the pre-launch "private beta" plumbing this flag already
// drove (nav-groups.ts's MARKETPLACE_NAV_VISIBLE, the sitemap/JSON-LD/merchant-feed
// gates below) still exists and keys off this same constant, so flipping it back
// to `process.env.NEXT_PUBLIC_MARKETPLACE_PUBLIC === "1"` is enough to fully
// restore the old env-driven launch behavior.
//
// Deliberately NOT disabled: the escrow-enforcement cron
// (api/cron/marketplace-maintenance), the Stripe webhooks, the order/funds
// management routes, and the /admin/marketplace console — these keep resolving
// any orders that were already in flight when this shipped. See that cron's own
// header comment for why turning it off too would leave live Stripe escrow stuck.
export const MARKETPLACE_PUBLIC = false;
export const MARKETPLACE_BETA_EMAILS = (process.env.MARKETPLACE_BETA_EMAILS ?? "test@test.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Who may see/buy listings right now — nobody, while the feature is off (see
// above). No admin/beta-tester bypass: this used to let admins preview the
// pre-launch marketplace while it stayed invisible to everyone else, but that
// bypass has no purpose while the feature is fully disabled rather than
// pre-launch, and leaving it would mean "fully disabled" wasn't actually true
// for those accounts. Existing order/fund management is unaffected — those
// routes gate on the user's own order/seller ownership, not this function.
export function canViewMarketplaceListings(_email?: string | null, _isAdmin?: boolean): boolean {
  return MARKETPLACE_PUBLIC;
}

export const MARKETPLACE_COUNTRIES = ["AU", "US", "UK", "SG", "CA"] as const;

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

// Active listings for one card, with the seller's shop name — powers the
// card page's Product JSON-LD offers (SEO) alongside MarketplaceHeroBlock's
// aggregate view. Returns [] when the marketplace isn't public yet so the
// structured data stays byte-identical pre-launch.
export async function getActiveListingsForCard(cardId: string) {
  if (!MARKETPLACE_PUBLIC) return [];
  return prisma.marketplaceListing.findMany({
    where: { cardId, status: "ACTIVE", quantity: { gt: 0 } },
    select: {
      id: true,
      priceCents: true,
      currency: true,
      country: true,
      condition: true,
      isFoil: true,
      seller: { select: { sellerProfile: { select: { shopName: true, shippingFlatCents: true } }, displayName: true } },
    },
    orderBy: { priceCents: "asc" },
    take: 50,
  });
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

  // Cheapest active listing per (card, market, foil-status). isFoil MUST be part of
  // the key: a foil and non-foil printing are different RetailerPrice rows (the
  // unique key is [cardId, retailer, condition, isFoil]) and different physical
  // items — without it, a cheaper non-foil listing silently won the slot and the
  // foil listing (often the one a buyer is actually looking at) never synced at all.
  const best = new Map<string, (typeof listings)[number]>();
  for (const l of listings) {
    const key = `${l.cardId}|${l.country}|${l.isFoil}`;
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
      url: `${SITE_URL}/marketplace?cardId=${l.cardId}`,
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
