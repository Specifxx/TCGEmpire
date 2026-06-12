import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["accept", "decline", "cancel"]) });

// Respond to an offer. Seller: accept | decline. Buyer: cancel. Accepting locks
// the deal in — the buyer then completes it at the offered price through the
// normal buy endpoint (which validates the ACCEPTED offer and marks it COMPLETED).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action } = parsed.data;

  const offer = await prisma.marketplaceOffer.findUnique({
    where: { id: params.id },
    include: { listing: { select: { status: true, quantity: true } } },
  });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  if (offer.status !== "PENDING") {
    return NextResponse.json({ error: `This offer is already ${offer.status.toLowerCase()}` }, { status: 400 });
  }
  if (offer.expiresAt < new Date()) {
    await prisma.marketplaceOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This offer has expired" }, { status: 400 });
  }

  if (action === "cancel") {
    if (offer.buyerId !== user.id) return NextResponse.json({ error: "Only the buyer can cancel" }, { status: 403 });
  } else {
    if (offer.sellerId !== user.id) return NextResponse.json({ error: "Only the seller can respond" }, { status: 403 });
    if (action === "accept" && (offer.listing.status !== "ACTIVE" || offer.listing.quantity < offer.quantity)) {
      return NextResponse.json({ error: "The listing no longer has enough stock to accept this" }, { status: 400 });
    }
  }

  const status = action === "accept" ? "ACCEPTED" : action === "decline" ? "DECLINED" : "CANCELLED";
  await prisma.marketplaceOffer.update({
    where: { id: offer.id },
    data: { status, respondedAt: new Date() },
  });
  return NextResponse.json({ ok: true, status });
}
