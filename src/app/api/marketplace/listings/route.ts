import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  validateListingInput,
  importMarketplaceListings,
  MARKETPLACE_COUNTRIES,
  CURRENCY_BY_COUNTRY,
  NEW_SELLER_TRUSTED_SALES,
  NEW_SELLER_MAX_ACTIVE_LISTINGS,
  NEW_SELLER_MAX_ACTIVE_VALUE_CENTS,
  isLaunchCountry,
} from "@/lib/marketplace";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET: the signed-in seller's own listings (?mine=1), or active listings for a card
// (?cardId=…) for the public marketplace.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("cardId");
  const mine = searchParams.get("mine");

  if (mine) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
    const listings = await prisma.marketplaceListing.findMany({
      where: { sellerId: user.id, NOT: { status: "REMOVED" } },
      orderBy: { createdAt: "desc" },
      include: { card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true, variant: true, isPromo: true, rarity: true } } },
    });
    return NextResponse.json({ listings });
  }

  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "ACTIVE", quantity: { gt: 0 }, ...(cardId ? { cardId } : {}) },
    orderBy: { priceCents: "asc" },
    take: cardId ? 50 : 60,
    include: {
      card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true, variant: true, isPromo: true, rarity: true } },
      seller: { select: { displayName: true, sellerProfile: { select: { shopName: true, shippingNote: true } } } },
    },
  });
  return NextResponse.json({ listings });
}

const schema = z.object({
  cardId: z.string().min(1),
  // Seller chooses which market this listing serves; defaults to their shop's market.
  country: z.enum(MARKETPLACE_COUNTRIES).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!user.isVerifiedSeller) return NextResponse.json({ error: "Please verify your email to sell" }, { status: 403 });

  const rl = rateLimit(`mp-listing:${clientIp(req)}:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const base = schema.safeParse(body);
  if (!base.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const v = validateListingInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const profile = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "Set up your shop (name + shipping) first" }, { status: 400 });
  if (profile.suspendedAt) return NextResponse.json({ error: "Your selling privileges are currently suspended" }, { status: 403 });
  if (!profile.payoutsEnabled) {
    return NextResponse.json({ error: "Finish setting up payouts (Stripe Connect) before listing" }, { status: 403 });
  }

  const card = await prisma.card.findUnique({ where: { id: base.data.cardId }, select: { id: true } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // New-seller guardrails (D8): until a seller has a track record, cap how much
  // unsold inventory they can have listed at once — an unproven seller's
  // downside is bounded without blocking them from selling at all.
  if (profile.completedSalesCount < NEW_SELLER_TRUSTED_SALES) {
    const active = await prisma.marketplaceListing.findMany({
      where: { sellerId: user.id, status: "ACTIVE" },
      select: { priceCents: true, quantity: true },
    });
    const activeValueCents = active.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
    if (active.length >= NEW_SELLER_MAX_ACTIVE_LISTINGS) {
      return NextResponse.json(
        { error: `New sellers are capped at ${NEW_SELLER_MAX_ACTIVE_LISTINGS} active listings until your first ${NEW_SELLER_TRUSTED_SALES} sales complete` },
        { status: 403 }
      );
    }
    if (activeValueCents + v.priceCents * v.quantity > NEW_SELLER_MAX_ACTIVE_VALUE_CENTS) {
      return NextResponse.json(
        { error: `New sellers are capped at ${(NEW_SELLER_MAX_ACTIVE_VALUE_CENTS / 100).toFixed(0)} total active listing value until your first ${NEW_SELLER_TRUSTED_SALES} sales complete` },
        { status: 403 }
      );
    }
  }

  // Per-listing region (defaults to the shop's market); currency follows the region.
  const country = base.data.country ?? profile.country;
  if (!isLaunchCountry(country)) {
    return NextResponse.json({ error: "This market isn't open yet — AU, UK and US only for now" }, { status: 400 });
  }
  const currency = CURRENCY_BY_COUNTRY[country] ?? profile.currency;

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: user.id,
      cardId: card.id,
      condition: v.condition,
      isFoil: v.isFoil,
      priceCents: v.priceCents,
      quantity: v.quantity,
      currency,
      country,
      status: "ACTIVE",
    },
  });

  // Refresh the comparison rows so the new listing shows up immediately, and
  // purge this card's page so the hero block reflects it without a 24h wait.
  await importMarketplaceListings().catch(() => {});
  await revalidateCardPage(card.id).catch(() => {});
  return NextResponse.json({ ok: true, listing });
}
