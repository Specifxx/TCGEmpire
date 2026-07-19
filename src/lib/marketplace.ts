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
import { MARKETPLACE_FEE_BPS, platformFeeCents, MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS } from "./marketplace-policy";

export { MARKETPLACE_LAUNCH_COUNTRIES, isLaunchCountry, CURRENCY_BY_COUNTRY };
// Fee + escrow-timing policy lives in the prisma-free ./marketplace-policy (so
// client components can import it); re-exported here for all server-side callers.
export { MARKETPLACE_FEE_BPS, platformFeeCents, MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS };

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

// Private listings (Phase 2, lower priority) get a reduced fee — not wired into
// checkout yet, but reserved here so the constant has one home.
export const MARKETPLACE_PRIVATE_FEE_BPS = Number(process.env.MARKETPLACE_PRIVATE_FEE_BPS ?? 200);

// Feature flag for the "make an offer" flow — OFF at launch (offers don't settle
// through Stripe yet; see MARKETPLACE_RETAILER comment / plan Phase 2 item 1).
export const MARKETPLACE_OFFERS = process.env.MARKETPLACE_OFFERS === "1";

// New-seller guardrails (D8): until a seller has this many COMPLETED sales, cap
// how much unsold inventory they can have listed at once — limits exposure from
// an unproven seller without blocking them from selling at all.
export const NEW_SELLER_TRUSTED_SALES = 3;
export const NEW_SELLER_MAX_ACTIVE_LISTINGS = 10;
export const NEW_SELLER_MAX_ACTIVE_VALUE_CENTS = 500_00;

// ── Private beta gating ────────────────────────────────────────────────────────
// While false, marketplace listings are NOT shown in the public price comparison
// and are only visible/buyable to the allow-listed beta emails (the test buyer);
// the Marketplace nav entries (hamburger menu, UserMenu, footer policy links —
// see nav-groups.ts) also stay hidden. NEXT_PUBLIC_-prefixed (not just
// MARKETPLACE_PUBLIC) so the exact same flag/value drives nav-groups.ts's
// client-side visibility check without a second env var to remember. Flip
// NEXT_PUBLIC_MARKETPLACE_PUBLIC=1 (env, redeploy) to launch publicly.
export const MARKETPLACE_PUBLIC = process.env.NEXT_PUBLIC_MARKETPLACE_PUBLIC === "1";
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
      condition: true,
      isFoil: true,
      seller: { select: { sellerProfile: { select: { shopName: true } }, displayName: true } },
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
