// Shared per-order action logic — used by BOTH the single-order route
// (api/marketplace/orders/[id]) and the bulk route (api/marketplace/orders/bulk).
// A single checkout (possibly spanning several sellers) creates one Order row
// per LISTING LINE, so "ship this parcel" or "confirm this delivery" often
// means acting on several Order rows at once (see orders/route.ts's groupKey).
// Extracting the logic here means the bulk route can loop over order ids
// calling the exact same rules as the single-order path, with no duplication.
import { prisma } from "./db";
import { releaseFundsForOrder, refundOrder } from "./connect";
import { revalidateCardPage } from "./revalidate-card";
import { importMarketplaceListings } from "./marketplace";
import {
  sendShippedEmail,
  sendFundsReleasedEmail,
  sendReleaseRequestedEmail,
  sendCancelRequestedEmail,
  sendCancelledMutualEmail,
  sendCancelDeclinedEmail,
  sendOrderCompletedBuyerEmail,
} from "./marketplace-email";
import { nextNumber, formatOrderNumber } from "./order-number";
import { autoReleaseDate } from "./marketplace-policy";
import { estimateDeliveryWindow } from "./delivery-estimate";
import { notify } from "./notifications";

export type ActionResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; httpStatus: number };

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      kind: true,
      status: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      marketplaceListingId: true,
      releaseRequestedAt: true,
      cancelRequestedBy: true,
      cancelRequestedAt: true,
      paidAt: true,
      shippedAt: true,
      shipCountry: true,
    },
  });
}

export async function shipOrder(
  orderId: string,
  userId: string,
  carrier: string,
  trackingNumber: string,
  tracking?: string
): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (order.sellerId !== userId) return { ok: false, error: "Only the seller can mark shipped", httpStatus: 403 };
  if (order.status !== "PAID") return { ok: false, error: `Can't ship a ${order.status} order`, httpStatus: 400 };
  if (order.cancelRequestedAt) return { ok: false, error: "A cancellation is pending on this order — resolve it first", httpStatus: 400 };

  const shippedAt = new Date();
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "SHIPPED", shippedAt, carrier, trackingNumber, trackingNote: tracking?.trim() || null },
  });

  const [buyer, sellerProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }),
    prisma.sellerProfile.findUnique({ where: { userId: order.sellerId }, select: { handlingDays: true } }),
  ]);
  const listing = order.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
    : null;
  if (buyer?.email) {
    const eta = estimateDeliveryWindow({
      paidAt: order.paidAt,
      shippedAt,
      handlingDays: sellerProfile?.handlingDays ?? 2,
      country: order.shipCountry,
    });
    await sendShippedEmail(
      buyer.email,
      { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "your order", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency },
      carrier,
      trackingNumber,
      eta,
      autoReleaseDate(shippedAt)
    ).catch(() => {});
  }
  await notify(
    order.buyerId,
    "order_shipped",
    "Order shipped",
    `${listing?.card.name ?? "Your order"} is on the way.`,
    "/marketplace/orders"
  ).catch(() => {});
  return { ok: true, status: "SHIPPED" };
}

export async function receiveOrder(orderId: string, userId: string): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  // BUYER ONLY. A seller confirming their own delivery is exactly the
  // conflict of interest this whole flow exists to avoid.
  if (order.buyerId !== userId) return { ok: false, error: "Only the buyer can confirm delivery", httpStatus: 403 };
  if (order.status !== "SHIPPED") return { ok: false, error: "This order hasn't been shipped yet", httpStatus: 400 };
  if (order.cancelRequestedAt) return { ok: false, error: "A cancellation is pending on this order — resolve it first", httpStatus: 400 };

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "COMPLETED", receivedAt: new Date(), releasedBy: "BUYER" },
  });

  await releaseFundsForOrder(order.id).catch(() => {});

  const [seller, buyer] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.sellerId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }),
  ]);
  const listing = order.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
    : null;
  const info = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    cardName: listing?.card.name ?? "your order",
    quantity: order.quantity,
    totalCents: order.totalCents,
    currency: order.currency,
  };
  if (seller?.email) await sendFundsReleasedEmail(seller.email, info).catch(() => {});
  if (buyer?.email) await sendOrderCompletedBuyerEmail(buyer.email, info, { auto: false }).catch(() => {});
  if (listing) await revalidateCardPage(listing.cardId).catch(() => {});

  await notify(order.sellerId, "funds_released", "Funds released", `Payout sent for ${info.cardName} (order ${formatOrderNumber(info.orderNumber) ?? info.orderId}).`, "/marketplace/funds").catch(() => {});
  await notify(order.buyerId, "order_completed", "Order complete", `Delivery confirmed for ${info.cardName}.`, "/marketplace/orders").catch(() => {});

  return { ok: true, status: "COMPLETED" };
}

// `notify` defaults true for the single-order route; the bulk route passes
// false for every id after the first in a group so one "please check tracking"
// email goes out per parcel, not one per line item.
export async function requestReleaseOrder(orderId: string, userId: string, notify = true): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (order.sellerId !== userId) return { ok: false, error: "Only the seller can request a release", httpStatus: 403 };
  if (order.status !== "SHIPPED") return { ok: false, error: "This order hasn't shipped yet", httpStatus: 400 };
  if (order.cancelRequestedAt) return { ok: false, error: "A cancellation is pending on this order", httpStatus: 400 };
  if (order.releaseRequestedAt) return { ok: true, alreadyRequested: true };

  await prisma.order.update({ where: { id: order.id }, data: { releaseRequestedAt: new Date() } });
  if (notify) {
    const listing = order.marketplaceListingId
      ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : null;
    await sendReleaseRequestedEmail(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        cardName: listing?.card.name ?? "the item",
        quantity: order.quantity,
        totalCents: order.totalCents,
        currency: order.currency,
      },
      autoReleaseDate(order.shippedAt!)
    ).catch(() => {});
  }
  return { ok: true };
}

export async function reportOrder(orderId: string, userId: string, userEmail: string, userName: string, message: string): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (order.buyerId !== userId && order.sellerId !== userId) {
    return { ok: false, error: "Only the buyer or seller can report this order", httpStatus: 403 };
  }
  const number = await nextNumber("support");
  await prisma.$transaction([
    prisma.supportTicket.create({
      data: {
        number,
        userId,
        email: userEmail,
        name: userName,
        category: "ORDER",
        orderId: order.id,
        subject: `Problem with order ${formatOrderNumber(order.orderNumber) ?? order.id}`,
        message,
      },
    }),
    prisma.order.update({ where: { id: order.id }, data: { disputedAt: new Date() } }),
  ]);
  const otherId = userId === order.buyerId ? order.sellerId : order.buyerId;
  await notify(
    otherId,
    "order_disputed",
    "A problem was reported",
    `Order ${formatOrderNumber(order.orderNumber) ?? order.id} has been paused while support looks into it.`,
    "/marketplace/orders"
  ).catch(() => {});
  return { ok: true, ticket: formatOrderNumber(number) };
}

export async function requestCancelOrder(orderId: string, userId: string, userName: string, reason: string): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (order.buyerId !== userId && order.sellerId !== userId) {
    return { ok: false, error: "Only the buyer or seller can request a cancellation", httpStatus: 403 };
  }
  if (order.status !== "PAID" && order.status !== "SHIPPED") {
    return { ok: false, error: `Can't cancel a ${order.status} order`, httpStatus: 400 };
  }
  if (order.cancelRequestedAt) return { ok: false, error: "A cancellation is already pending", httpStatus: 400 };

  await prisma.order.update({
    where: { id: order.id },
    data: { cancelRequestedBy: userId, cancelRequestedAt: new Date(), cancelReason: reason },
  });

  const otherId = userId === order.buyerId ? order.sellerId : order.buyerId;
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { email: true } });
  const listing = order.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
    : null;
  if (other?.email) {
    await sendCancelRequestedEmail(
      other.email,
      { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "the item", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency },
      userName,
      reason
    ).catch(() => {});
  }
  await notify(
    otherId,
    "cancel_requested",
    "Cancellation requested",
    `${userName} wants to cancel order ${formatOrderNumber(order.orderNumber) ?? order.id}.`,
    "/marketplace/orders"
  ).catch(() => {});
  return { ok: true };
}

export async function withdrawCancelOrder(orderId: string, userId: string): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (order.cancelRequestedBy !== userId) return { ok: false, error: "Only whoever requested it can withdraw", httpStatus: 403 };
  if (!order.cancelRequestedAt) return { ok: false, error: "No pending cancellation", httpStatus: 400 };
  await prisma.order.update({ where: { id: order.id }, data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null } });
  return { ok: true };
}

export async function respondCancelOrder(orderId: string, userId: string, accept: boolean): Promise<ActionResult> {
  const order = await loadOrder(orderId);
  if (!order || order.kind !== "MARKETPLACE") return { ok: false, error: "Order not found", httpStatus: 404 };
  if (!order.cancelRequestedAt || !order.cancelRequestedBy) return { ok: false, error: "No pending cancellation", httpStatus: 400 };
  if (order.cancelRequestedBy === userId) return { ok: false, error: "Wait for the other party to respond", httpStatus: 403 };
  if (order.buyerId !== userId && order.sellerId !== userId) {
    return { ok: false, error: "Only the buyer or seller can respond", httpStatus: 403 };
  }

  const listing = order.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { id: true, cardId: true, status: true, card: { select: { name: true } } } })
    : null;
  const info = { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "the item", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency };

  if (!accept) {
    await prisma.order.update({ where: { id: order.id }, data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null } });
    const requester = await prisma.user.findUnique({ where: { id: order.cancelRequestedBy }, select: { email: true } });
    if (requester?.email) await sendCancelDeclinedEmail(requester.email, info).catch(() => {});
    await notify(order.cancelRequestedBy!, "cancel_declined", "Cancellation declined", `Order ${formatOrderNumber(order.orderNumber) ?? order.id} continues as normal.`, "/marketplace/orders").catch(() => {});
    return { ok: true, status: "declined" };
  }

  // accept-cancel — full refund + restock, no partial/manual amount involved.
  await refundOrder(order.id);
  await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  if (listing) {
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { quantity: { increment: order.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
    });
    await importMarketplaceListings().catch(() => {});
    await revalidateCardPage(listing.cardId).catch(() => {});
  }
  const [buyer, seller] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: order.sellerId }, select: { email: true } }),
  ]);
  if (buyer?.email) await sendCancelledMutualEmail(buyer.email, info).catch(() => {});
  if (seller?.email) await sendCancelledMutualEmail(seller.email, info).catch(() => {});
  await notify(order.buyerId, "order_cancelled", "Order cancelled", `Order ${formatOrderNumber(order.orderNumber) ?? order.id} was cancelled and refunded.`, "/marketplace/orders").catch(() => {});
  await notify(order.sellerId, "order_cancelled", "Order cancelled", `Order ${formatOrderNumber(order.orderNumber) ?? order.id} was cancelled and refunded.`, "/marketplace/sell").catch(() => {});
  return { ok: true, status: "CANCELLED" };
}

// ── Group-aware versions ─────────────────────────────────────────────────────
// A single checkout — one Stripe charge — creates one Order row per LISTING
// LINE (see orders/route.ts's groupKey), so acting on "the whole parcel" means
// several rows sharing ONE underlying side-effect: one support ticket, one
// cancellation-negotiation email, one refund of the shared PaymentIntent — not
// one of each per line. These validate every row up front (failing the whole
// group before touching anything if any row isn't eligible) and only trigger
// the shared side-effect once, then update every row.

async function loadGroup(orderIds: string[]) {
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      kind: true,
      status: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      marketplaceListingId: true,
      cancelRequestedBy: true,
      cancelRequestedAt: true,
    },
  });
  return orders.filter((o) => o.kind === "MARKETPLACE");
}

export async function reportOrderGroup(orderIds: string[], userId: string, userEmail: string, userName: string, message: string): Promise<ActionResult> {
  const orders = await loadGroup(orderIds);
  if (orders.length === 0) return { ok: false, error: "Order not found", httpStatus: 404 };
  if (orders.some((o) => o.buyerId !== userId && o.sellerId !== userId)) {
    return { ok: false, error: "Only the buyer or seller can report this order", httpStatus: 403 };
  }

  // One ticket for the whole parcel (referencing its first order), not one per line.
  const first = orders[0];
  const number = await nextNumber("support");
  await prisma.$transaction([
    prisma.supportTicket.create({
      data: {
        number,
        userId,
        email: userEmail,
        name: userName,
        category: "ORDER",
        orderId: first.id,
        subject: `Problem with order ${formatOrderNumber(first.orderNumber) ?? first.id}${orders.length > 1 ? ` (+${orders.length - 1} more items)` : ""}`,
        message,
      },
    }),
    prisma.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { disputedAt: new Date() } }),
  ]);
  const otherId = userId === first.buyerId ? first.sellerId : first.buyerId;
  await notify(
    otherId,
    "order_disputed",
    "A problem was reported",
    `Order ${formatOrderNumber(first.orderNumber) ?? first.id} has been paused while support looks into it.`,
    "/marketplace/orders"
  ).catch(() => {});
  return { ok: true, ticket: formatOrderNumber(number) };
}

export async function requestCancelGroup(orderIds: string[], userId: string, userName: string, reason: string): Promise<ActionResult> {
  const orders = await loadGroup(orderIds);
  if (orders.length === 0) return { ok: false, error: "Order not found", httpStatus: 404 };
  if (orders.some((o) => o.buyerId !== userId && o.sellerId !== userId)) {
    return { ok: false, error: "Only the buyer or seller can request a cancellation", httpStatus: 403 };
  }
  if (orders.some((o) => o.status !== "PAID" && o.status !== "SHIPPED")) {
    return { ok: false, error: "One or more of these items can't be cancelled right now", httpStatus: 400 };
  }
  if (orders.some((o) => o.cancelRequestedAt)) {
    return { ok: false, error: "A cancellation is already pending", httpStatus: 400 };
  }

  await prisma.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { cancelRequestedBy: userId, cancelRequestedAt: new Date(), cancelReason: reason },
  });

  const first = orders[0];
  const otherId = userId === first.buyerId ? first.sellerId : first.buyerId;
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { email: true } });
  const listing = first.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: first.marketplaceListingId }, select: { card: { select: { name: true } } } })
    : null;
  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  if (other?.email) {
    await sendCancelRequestedEmail(
      other.email,
      { orderId: first.id, orderNumber: first.orderNumber, cardName: orders.length > 1 ? `${orders.length} items` : listing?.card.name ?? "the item", quantity: first.quantity, totalCents, currency: first.currency },
      userName,
      reason
    ).catch(() => {});
  }
  await notify(
    otherId,
    "cancel_requested",
    "Cancellation requested",
    `${userName} wants to cancel order ${formatOrderNumber(first.orderNumber) ?? first.id}.`,
    "/marketplace/orders"
  ).catch(() => {});
  return { ok: true };
}

export async function withdrawCancelGroup(orderIds: string[], userId: string): Promise<ActionResult> {
  const orders = await loadGroup(orderIds);
  if (orders.length === 0) return { ok: false, error: "Order not found", httpStatus: 404 };
  if (orders.some((o) => o.cancelRequestedBy !== userId)) {
    return { ok: false, error: "Only whoever requested it can withdraw", httpStatus: 403 };
  }
  if (orders.some((o) => !o.cancelRequestedAt)) return { ok: false, error: "No pending cancellation", httpStatus: 400 };
  await prisma.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null },
  });
  return { ok: true };
}

export async function respondCancelGroup(orderIds: string[], userId: string, accept: boolean): Promise<ActionResult> {
  const orders = await loadGroup(orderIds);
  if (orders.length === 0) return { ok: false, error: "Order not found", httpStatus: 404 };
  if (orders.some((o) => !o.cancelRequestedAt || !o.cancelRequestedBy)) {
    return { ok: false, error: "No pending cancellation", httpStatus: 400 };
  }
  if (orders.some((o) => o.cancelRequestedBy === userId)) {
    return { ok: false, error: "Wait for the other party to respond", httpStatus: 403 };
  }
  if (orders.some((o) => o.buyerId !== userId && o.sellerId !== userId)) {
    return { ok: false, error: "Only the buyer or seller can respond", httpStatus: 403 };
  }

  const first = orders[0];
  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const listing = first.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: first.marketplaceListingId }, select: { card: { select: { name: true } } } })
    : null;
  const info = { orderId: first.id, orderNumber: first.orderNumber, cardName: orders.length > 1 ? `${orders.length} items` : listing?.card.name ?? "the item", quantity: first.quantity, totalCents, currency: first.currency };

  if (!accept) {
    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null },
    });
    const requester = await prisma.user.findUnique({ where: { id: first.cancelRequestedBy! }, select: { email: true } });
    if (requester?.email) await sendCancelDeclinedEmail(requester.email, info).catch(() => {});
    await notify(first.cancelRequestedBy!, "cancel_declined", "Cancellation declined", `Order ${formatOrderNumber(first.orderNumber) ?? first.id} continues as normal.`, "/marketplace/orders").catch(() => {});
    return { ok: true, status: "declined" };
  }

  // Accept: refund each order (refundOrder is safe to call per-row even though
  // they share one PaymentIntent — it detects an already-refunded sibling and
  // skips the duplicate Stripe call, see lib/connect.ts), restock every
  // listing, cancel every row, then send ONE pair of emails for the group.
  for (const o of orders) {
    await refundOrder(o.id);
    await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
  }
  const listingIds = [...new Set(orders.map((o) => o.marketplaceListingId).filter((x): x is string => !!x))];
  if (listingIds.length) {
    const listings = await prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, cardId: true, status: true } });
    const qtyByListing = new Map<string, number>();
    for (const o of orders) {
      if (!o.marketplaceListingId) continue;
      qtyByListing.set(o.marketplaceListingId, (qtyByListing.get(o.marketplaceListingId) ?? 0) + o.quantity);
    }
    for (const l of listings) {
      await prisma.marketplaceListing.update({
        where: { id: l.id },
        data: { quantity: { increment: qtyByListing.get(l.id) ?? 0 }, ...(l.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
      });
      await revalidateCardPage(l.cardId).catch(() => {});
    }
    await importMarketplaceListings().catch(() => {});
  }
  const [buyer, seller] = await Promise.all([
    prisma.user.findUnique({ where: { id: first.buyerId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: first.sellerId }, select: { email: true } }),
  ]);
  if (buyer?.email) await sendCancelledMutualEmail(buyer.email, info).catch(() => {});
  if (seller?.email) await sendCancelledMutualEmail(seller.email, info).catch(() => {});
  await notify(first.buyerId, "order_cancelled", "Order cancelled", `Order ${formatOrderNumber(first.orderNumber) ?? first.id} was cancelled and refunded.`, "/marketplace/orders").catch(() => {});
  await notify(first.sellerId, "order_cancelled", "Order cancelled", `Order ${formatOrderNumber(first.orderNumber) ?? first.id} was cancelled and refunded.`, "/marketplace/sell").catch(() => {});
  return { ok: true, status: "CANCELLED" };
}
