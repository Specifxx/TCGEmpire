import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewMarketplaceListings, offerExpiry, OFFER_MIN_RATIO } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

const LISTING_CARD_SELECT = {
  card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true } },
} as const;

// Lazily expire stale PENDING offers so every read reflects reality without a cron.
async function expireStale() {
  await prisma.marketplaceOffer
    .updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } })
    .catch(() => {});
}

// GET → the signed-in user's offers, both directions: ones they made (as buyer)
// and ones on their listings (as seller).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await expireStale();

  const [made, received] = await Promise.all([
    prisma.marketplaceOffer.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        listing: { include: LISTING_CARD_SELECT },
        seller: { select: { displayName: true, sellerProfile: { select: { shopName: true } } } },
      },
    }),
    prisma.marketplaceOffer.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        listing: { include: LISTING_CARD_SELECT },
        buyer: { select: { displayName: true } },
      },
    }),
  ]);
  return NextResponse.json({ made, received });
}

const createSchema = z.object({
  listingId: z.string().min(1),
  priceCents: z.number().int().min(1),
  quantity: z.number().int().min(1).max(999).default(1),
  message: z.string().max(280).optional(),
});

// POST → make an offer on a listing. One live offer per buyer+listing: a new
// offer replaces (cancels) the previous pending one.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to make an offer" }, { status: 401 });
  if (!canViewMarketplaceListings(user.email)) {
    return NextResponse.json({ error: "The marketplace is in private beta" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid offer" }, { status: 400 });
  const { listingId, priceCents, quantity, message } = parsed.data;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, status: true, quantity: true, priceCents: true },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "This listing is no longer available" }, { status: 404 });
  }
  if (listing.sellerId === user.id) {
    return NextResponse.json({ error: "You can't make an offer on your own listing" }, { status: 400 });
  }
  if (quantity > listing.quantity) {
    return NextResponse.json({ error: `Only ${listing.quantity} available` }, { status: 400 });
  }
  if (priceCents >= listing.priceCents) {
    return NextResponse.json({ error: "Your offer is at or above the asking price — just buy it!" }, { status: 400 });
  }
  if (priceCents < Math.ceil(listing.priceCents * OFFER_MIN_RATIO)) {
    return NextResponse.json(
      { error: `Offers below ${Math.round(OFFER_MIN_RATIO * 100)}% of asking aren't accepted` },
      { status: 400 }
    );
  }

  await expireStale();
  const offer = await prisma.$transaction(async (tx) => {
    // Replace any previous pending offer from this buyer on this listing.
    await tx.marketplaceOffer.updateMany({
      where: { listingId, buyerId: user.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    return tx.marketplaceOffer.create({
      data: {
        listingId,
        buyerId: user.id,
        sellerId: listing.sellerId,
        priceCents,
        quantity,
        message: message?.trim() || null,
        expiresAt: offerExpiry(),
      },
    });
  });

  return NextResponse.json({ ok: true, offerId: offer.id, expiresAt: offer.expiresAt });
}
