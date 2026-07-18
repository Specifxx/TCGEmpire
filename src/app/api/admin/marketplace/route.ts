import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { importMarketplaceListings } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["force-release", "force-refund", "clear-dispute", "suspend-seller", "unsuspend-seller", "delist-listing"]),
  orderId: z.string().optional(),
  userId: z.string().optional(),
  listingId: z.string().optional(),
});

// Trust & safety tools for admins only — resolving a disputed order (force the
// payout through or refund the buyer), suspending a bad-actor seller, or pulling
// a single listing. Every action here is deliberately manual: launch scope has no
// automated dispute resolution (see plan's "Open risks").
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, orderId, userId, listingId } = parsed.data;

  switch (action) {
    case "force-release": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED", receivedAt: new Date(), disputedAt: null } });
      await releaseFundsForOrder(orderId);
      return NextResponse.json({ ok: true });
    }
    case "force-refund": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { marketplaceListingId: true, quantity: true } });
      await refundOrder(orderId);
      await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", disputedAt: null } });
      if (order?.marketplaceListingId) {
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { status: true, cardId: true } });
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: order.marketplaceListingId },
            data: { quantity: { increment: order.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
          });
          await importMarketplaceListings().catch(() => {});
          await revalidateCardPage(listing.cardId).catch(() => {});
        }
      }
      return NextResponse.json({ ok: true });
    }
    case "clear-dispute": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({ where: { id: orderId }, data: { disputedAt: null } });
      return NextResponse.json({ ok: true });
    }
    case "suspend-seller": {
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      await prisma.sellerProfile.update({ where: { userId }, data: { suspendedAt: new Date() } });
      await prisma.marketplaceListing.updateMany({ where: { sellerId: userId, status: "ACTIVE" }, data: { status: "PAUSED" } });
      await importMarketplaceListings().catch(() => {});
      return NextResponse.json({ ok: true });
    }
    case "unsuspend-seller": {
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      await prisma.sellerProfile.update({ where: { userId }, data: { suspendedAt: null } });
      return NextResponse.json({ ok: true });
    }
    case "delist-listing": {
      if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });
      const listing = await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
      await importMarketplaceListings().catch(() => {});
      await revalidateCardPage(listing.cardId).catch(() => {});
      return NextResponse.json({ ok: true });
    }
  }
}
