import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/stripe";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { importMarketplaceListings, MARKETPLACE_AUTO_RELEASE_DAYS, MARKETPLACE_SHIP_DEADLINE_DAYS } from "@/lib/marketplace";
import { autoReleaseDate } from "@/lib/marketplace-policy";
import { estimateDeliveryWindow, formatDateRange } from "@/lib/delivery-estimate";
import { revalidateCardPage } from "@/lib/revalidate-card";
import {
  sendFundsReleasedEmail,
  sendAutoCancelledBuyerEmail,
  sendAutoCancelledSellerEmail,
  sendOrderCompletedBuyerEmail,
  sendShipReminderEmail,
  sendDeliveryNudgeEmail,
} from "@/lib/marketplace-email";
import { notify } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";

// Escrow enforcement, run every 6h by .github/workflows/marketplace-maintenance.yml
// (Vercel's Hobby-plan cron only fires once/day, too coarse for a 14-day release
// window measured in hours — GH Actions gives us the finer cadence for free).
//
// Five bounded jobs, each capped at 200 rows/run so a backlog can never turn one
// invocation into an unbounded scan:
//   (a) release abandoned checkout reservations (existing helper)
//   (b) auto-release funds on SHIPPED orders past the buyer-confirm window —
//       the PRIMARY release path now, not a fallback (see autoReleaseShipped)
//   (c) auto-refund PAID orders the seller never shipped in time
//   (d) T-24h "ship soon" reminder to sellers approaching the ship deadline
//   (e) "has it arrived?" nudge to buyers once the estimated delivery window
//       has passed on a still-unconfirmed SHIPPED order
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 200;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releasedReservations = await releaseExpiredReservations().catch(() => 0);
  const autoReleased = await autoReleaseShipped();
  const autoCancelled = await autoCancelUnshipped();
  const shipReminders = await sendShipReminders();
  const deliveryNudges = await sendDeliveryNudges();

  return NextResponse.json({ ok: true, releasedReservations, autoReleased, autoCancelled, shipReminders, deliveryNudges });
}

// Auto-release is now the PRIMARY, scheduled release path — every shipped order
// releases on a fixed, buyer-visible date (shippedAt + MARKETPLACE_AUTO_RELEASE_DAYS)
// unless disputedAt pauses it. A seller confirming their own delivery is still
// never a trigger (conflict of interest; see orders/[id]/route.ts). Admin review
// no longer gates or delays this — admins handle exceptions (early-release
// requests, stale/disputed orders) via /admin/marketplace, but doing nothing is
// the expected, safe default for the vast majority of orders.
async function autoReleaseShipped(): Promise<number> {
  const cutoff = new Date(Date.now() - MARKETPLACE_AUTO_RELEASE_DAYS * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "SHIPPED", shippedAt: { lt: cutoff }, disputedAt: null },
    select: { id: true, orderNumber: true, quantity: true, totalCents: true, feeCents: true, currency: true, buyerId: true, sellerId: true, marketplaceListingId: true },
    take: BATCH,
  });

  let n = 0;
  for (const o of orders) {
    try {
      await prisma.order.update({ where: { id: o.id }, data: { status: "COMPLETED", receivedAt: new Date(), releasedBy: "AUTO" } });
      await releaseFundsForOrder(o.id);
      n++;

      const [seller, buyer] = await Promise.all([
        prisma.user.findUnique({ where: { id: o.sellerId }, select: { email: true } }),
        prisma.user.findUnique({ where: { id: o.buyerId }, select: { email: true } }),
      ]);
      const listing = o.marketplaceListingId
        ? await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
        : null;
      const info = {
        orderId: o.id,
        orderNumber: o.orderNumber,
        cardName: listing?.card.name ?? "your order",
        quantity: o.quantity,
        totalCents: o.totalCents,
        feeCents: o.feeCents,
        currency: o.currency,
      };
      if (seller?.email) await sendFundsReleasedEmail(seller.email, info).catch(() => {});
      if (buyer?.email) await sendOrderCompletedBuyerEmail(buyer.email, info, { auto: true }).catch(() => {});
      if (listing) await revalidateCardPage(listing.cardId).catch(() => {});
      await notify(o.sellerId, "funds_released", "Funds released", `${formatMoney(o.totalCents - o.feeCents, o.currency)} sent for ${info.cardName} (order ${o.orderNumber ?? o.id}).`, "/marketplace/funds").catch(() => {});
      await notify(o.buyerId, "order_completed", "Order complete", `Order for ${info.cardName} auto-completed and the seller has been paid.`, "/marketplace/orders").catch(() => {});
    } catch {
      // Skip this order this run; it's picked up again on the next pass.
    }
  }
  return n;
}

// Parcel-group key mirroring orders/route.ts's groupKey — cron emails must fire
// once per PARCEL (one Stripe checkout/seller), never once per Order row, or a
// multi-item cart would get spammed with duplicate reminder/nudge emails.
function parcelKey(o: { stripeSessionId: string | null; id: string; sellerId: string }): string {
  return `${o.stripeSessionId ?? o.id}:${o.sellerId}`;
}
function buyerParcelKey(o: { stripeSessionId: string | null; id: string; buyerId: string }): string {
  return `${o.stripeSessionId ?? o.id}:${o.buyerId}`;
}

// T-24h "ship soon" seller reminder — fires once per parcel for PAID orders
// approaching the auto-refund deadline that haven't shipped yet. Dedupe via
// shipReminderAt so 6-hourly re-runs never double-email the same parcel.
async function sendShipReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - (MARKETPLACE_SHIP_DEADLINE_DAYS - 1) * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "PAID", shippedAt: null, shipReminderAt: null, cancelRequestedAt: null, paidAt: { lt: cutoff } },
    select: {
      id: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      sellerId: true,
      stripeSessionId: true,
      paidAt: true,
      marketplaceListingId: true,
    },
    take: BATCH,
  });
  if (!orders.length) return 0;

  const groups = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = parcelKey(o);
    const g = groups.get(key);
    if (g) g.push(o);
    else groups.set(key, [o]);
  }

  let emailed = 0;
  for (const rows of groups.values()) {
    const first = rows[0]!;
    try {
      const seller = await prisma.user.findUnique({ where: { id: first.sellerId }, select: { email: true } });
      if (seller?.email && first.paidAt) {
        const listing = first.marketplaceListingId
          ? await prisma.marketplaceListing.findUnique({ where: { id: first.marketplaceListingId }, select: { card: { select: { name: true } } } })
          : null;
        const totalCents = rows.reduce((sum, r) => sum + r.totalCents, 0);
        const cardName = rows.length > 1 ? `${rows.length} items` : listing?.card.name ?? "your item";
        await sendShipReminderEmail(
          seller.email,
          { orderId: first.id, orderNumber: first.orderNumber, cardName, quantity: first.quantity, totalCents, currency: first.currency },
          new Date(first.paidAt.getTime() + MARKETPLACE_SHIP_DEADLINE_DAYS * 86_400_000)
        ).catch(() => {});
        await notify(first.sellerId, "ship_reminder", "Ship soon", `Order for ${cardName} must ship within 24 hours or it's auto-cancelled.`, "/marketplace/sell").catch(() => {});
        emailed++;
      }
    } finally {
      // Stamp every row in the group regardless of whether the email actually
      // sent (fire-and-forget convention throughout this file) — a lost email
      // must not retry forever.
      await prisma.order.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { shipReminderAt: new Date() } }).catch(() => {});
    }
  }
  return emailed;
}

// Buyer "has it arrived?" nudge — fires once the ESTIMATED delivery window has
// passed for a shipped, non-disputed order. Conservative by design (only after
// the upper bound of the estimate) since there's no carrier data confirming
// delivery either way. Self-draining: every row either gets nudged+stamped or
// eventually auto-releases at the 14-day mark and drops out of this query.
async function sendDeliveryNudges(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "SHIPPED", deliveryNudgeAt: null, disputedAt: null, shippedAt: { lt: new Date(Date.now() - 3 * 86_400_000) } },
    select: {
      id: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      buyerId: true,
      stripeSessionId: true,
      shippedAt: true,
      shipCountry: true,
      sellerId: true,
      marketplaceListingId: true,
    },
    take: BATCH,
  });
  if (!orders.length) return 0;

  const now = Date.now();
  const due = orders.filter((o) => {
    if (!o.shippedAt) return false;
    const eta = estimateDeliveryWindow({ paidAt: null, shippedAt: o.shippedAt, handlingDays: 0, country: o.shipCountry });
    return !!eta && eta.to.getTime() < now;
  });
  if (!due.length) return 0;

  const groups = new Map<string, typeof due>();
  for (const o of due) {
    const key = buyerParcelKey(o);
    const g = groups.get(key);
    if (g) g.push(o);
    else groups.set(key, [o]);
  }

  let emailed = 0;
  for (const rows of groups.values()) {
    const first = rows[0]!;
    try {
      const buyer = await prisma.user.findUnique({ where: { id: first.buyerId }, select: { email: true } });
      if (buyer?.email && first.shippedAt) {
        const listing = first.marketplaceListingId
          ? await prisma.marketplaceListing.findUnique({ where: { id: first.marketplaceListingId }, select: { card: { select: { name: true } } } })
          : null;
        const totalCents = rows.reduce((sum, r) => sum + r.totalCents, 0);
        const cardName = rows.length > 1 ? `${rows.length} items` : listing?.card.name ?? "your order";
        const eta = estimateDeliveryWindow({ paidAt: null, shippedAt: first.shippedAt, handlingDays: 0, country: first.shipCountry });
        await sendDeliveryNudgeEmail(
          buyer.email,
          { orderId: first.id, orderNumber: first.orderNumber, cardName, quantity: first.quantity, totalCents, currency: first.currency },
          eta ? formatDateRange(eta.from, eta.to) : "a few days ago",
          autoReleaseDate(first.shippedAt)
        ).catch(() => {});
        await notify(first.buyerId, "delivery_nudge", "Has your order arrived?", `Order for ${cardName} should have arrived — confirm delivery or report a problem.`, "/marketplace/orders").catch(() => {});
        emailed++;
      }
    } finally {
      await prisma.order.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deliveryNudgeAt: new Date() } }).catch(() => {});
    }
  }
  return emailed;
}

// PAID but never shipped within the deadline → full refund + restock. Protects
// buyers from a seller who takes payment and disappears.
async function autoCancelUnshipped(): Promise<number> {
  const cutoff = new Date(Date.now() - MARKETPLACE_SHIP_DEADLINE_DAYS * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "PAID", paidAt: { lt: cutoff }, shippedAt: null },
    select: {
      id: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      buyerId: true,
      sellerId: true,
      marketplaceListingId: true,
    },
    take: BATCH,
  });

  let n = 0;
  let touchedListings = false;
  for (const o of orders) {
    try {
      await refundOrder(o.id);
      await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
      if (o.marketplaceListingId) {
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { status: true } });
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: o.marketplaceListingId },
            data: { quantity: { increment: o.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
          });
          touchedListings = true;
        }
      }
      n++;

      const [buyer, seller] = await Promise.all([
        prisma.user.findUnique({ where: { id: o.buyerId }, select: { email: true } }),
        prisma.user.findUnique({ where: { id: o.sellerId }, select: { email: true } }),
      ]);
      const listing = o.marketplaceListingId
        ? await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
        : null;
      const info = { orderId: o.id, orderNumber: o.orderNumber, cardName: listing?.card.name ?? "the item", quantity: o.quantity, totalCents: o.totalCents, currency: o.currency };
      if (buyer?.email) await sendAutoCancelledBuyerEmail(buyer.email, info).catch(() => {});
      if (seller?.email) await sendAutoCancelledSellerEmail(seller.email, info).catch(() => {});
      if (listing) await revalidateCardPage(listing.cardId).catch(() => {});
      await notify(o.buyerId, "order_cancelled", "Order cancelled", `Order for ${info.cardName} was cancelled and refunded in full — the seller didn't ship in time.`, "/marketplace/orders").catch(() => {});
      await notify(o.sellerId, "order_cancelled", "Order auto-cancelled", `Order for ${info.cardName} was auto-cancelled for missing the ship deadline.`, "/marketplace/sell").catch(() => {});
    } catch {
      // Skip this order this run; it's picked up again on the next pass.
    }
  }
  if (touchedListings) await importMarketplaceListings().catch(() => {});
  return n;
}
