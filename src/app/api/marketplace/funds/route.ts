import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { shipByDate, autoReleaseDate } from "@/lib/marketplace-policy";

export const dynamic = "force-dynamic";

// No ledger table (D2 in the plan) — pending/released are derived straight from
// bounded, indexed Order aggregates. Stripe's own Express dashboard (via the
// login link from /api/marketplace/stripe/connect) is the source of truth for
// actual withdrawable balance; we never mirror that number here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { stripeAccountId: true, payoutsEnabled: true, completedSalesCount: true },
  });

  // Held: PAID or SHIPPED — money is in the platform's balance, not yet
  // transferred. Grouped by currency since a seller can list in more than one.
  const held = await prisma.order.groupBy({
    by: ["currency"],
    where: { sellerId: user.id, kind: "MARKETPLACE", status: { in: ["PAID", "SHIPPED"] } },
    _sum: { totalCents: true, feeCents: true },
  });

  // Released: COMPLETED with a recorded transfer — what's actually been paid out.
  const released = await prisma.order.groupBy({
    by: ["currency"],
    where: { sellerId: user.id, kind: "MARKETPLACE", status: "COMPLETED", stripeTransferId: { not: null } },
    _sum: { totalCents: true, feeCents: true },
  });

  // Stuck: COMPLETED but never transferred — a sale can finish before a seller
  // sets up payouts (see api/marketplace/listings + stripe/checkout), so
  // releaseFundsForOrder() no-ops instead of erroring. This money is real and
  // owed; it just needs the seller to finish Stripe Connect, which then
  // auto-releases everything in this bucket (see connect-webhook/route.ts).
  const readyForPayout = await prisma.order.groupBy({
    by: ["currency"],
    where: { sellerId: user.id, kind: "MARKETPLACE", status: "COMPLETED", stripeTransferId: null },
    _sum: { totalCents: true, feeCents: true },
  });

  const recent = await prisma.order.findMany({
    where: { sellerId: user.id, kind: "MARKETPLACE", status: { in: ["PAID", "SHIPPED", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalCents: true,
      feeCents: true,
      currency: true,
      createdAt: true,
      paidAt: true,
      shippedAt: true,
      receivedAt: true,
      transferredAt: true,
    },
  });

  const toNet = (rows: typeof held) =>
    rows.map((r) => ({ currency: r.currency, netCents: (r._sum.totalCents ?? 0) - (r._sum.feeCents ?? 0) }));

  // Per-order concrete dates — "when do I get paid" answered exactly, not with a
  // generic rule. shipByAt only matters while still PAID; releasesAt (the
  // auto-release date) only once shipped.
  const recentWithDates = recent.map((o) => ({
    ...o,
    shipByAt: o.status === "PAID" && o.paidAt ? shipByDate(o.paidAt) : null,
    releasesAt: o.shippedAt ? autoReleaseDate(o.shippedAt) : null,
  }));

  return NextResponse.json({
    hasAccount: !!profile?.stripeAccountId,
    payoutsEnabled: !!profile?.payoutsEnabled,
    completedSalesCount: profile?.completedSalesCount ?? 0,
    held: toNet(held),
    released: toNet(released),
    readyForPayout: toNet(readyForPayout),
    recent: recentWithDates,
  });
}
