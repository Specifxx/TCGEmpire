import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { validateListingInput, importMarketplaceListings, MARKETPLACE_COUNTRIES, CURRENCY_BY_COUNTRY } from "@/lib/marketplace";

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
  if (!user.isVerifiedSeller) return NextResponse.json({ error: "Verified sellers only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const base = schema.safeParse(body);
  if (!base.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const v = validateListingInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const profile = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "Set up your shop (name + shipping) first" }, { status: 400 });

  const card = await prisma.card.findUnique({ where: { id: base.data.cardId }, select: { id: true } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // Per-listing region (defaults to the shop's market); currency follows the region.
  const country = base.data.country ?? profile.country;
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

  // Refresh the comparison rows so the new listing shows up immediately.
  await importMarketplaceListings().catch(() => {});
  return NextResponse.json({ ok: true, listing });
}
