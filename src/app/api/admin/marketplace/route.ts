import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { importMarketplaceListings } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum([
    "force-release",
    "force-refund",
    "clear-dispute",
    "mark-reviewed",
    "flag-dispute",
    "suspend-seller",
    "unsuspend-seller",
    "delist-listing",
  ]),
  orderId: z.string().optional(),
  userId: z.string().optional(),
  listingId: z.string().optional(),
});

// Trust & safety tools for admins only — resolving a disputed order (force the
// payout through or refund the buyer), reviewing a SHIPPED order's tracking
// before release, suspending a bad-actor seller, or pulling a single listing.
// force-release/mark-reviewed are THE release gate now: a buyer confirming
// delivery is the only other trigger, and a seller can no longer self-confirm
// their own delivery (see orders/[id]/route.ts) — see the auto-release cron for
// the rolling-window timeout that backstops this when nobody's looked.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, orderId, userId, listingId } = parsed.data;

  switch (action) {
    case "force-release": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          receivedAt: new Date(),
          disputedAt: null,
          releasedBy: "ADMIN",
          adminReviewedAt: new Date(),
          adminReviewedBy: user.email,
        },
      });
      await releaseFundsForOrder(orderId);
      return NextResponse.json({ ok: true });
    }
    // "I checked tracking — not clearly delivered yet, keep waiting." Doesn't
    // release or dispute anything; just stamps the audit trail and resets the
    // auto-release cron's rolling window so the order isn't force-completed out
    // from under an admin who's actively watching it.
    case "mark-reviewed": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({ where: { id: orderId }, data: { adminReviewedAt: new Date(), adminReviewedBy: user.email } });
      return NextResponse.json({ ok: true });
    }
    // An admin spotting a problem directly (vs. a buyer/seller filing a report) —
    // blocks auto-release the same way a support-ticket dispute does.
    case "flag-dispute": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({
        where: { id: orderId },
        data: { disputedAt: new Date(), adminReviewedAt: new Date(), adminReviewedBy: user.email },
      });
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
      await prisma.order.update({ where: { id: orderId }, data: { disputedAt: null, adminReviewedAt: new Date(), adminReviewedBy: user.email } });
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
