import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/stripe";
import { reconcilePayoutStatus } from "@/lib/connect";
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

  // The connect-webhook is the fast path; this is the fallback so "Enable
  // payouts" doesn't get stuck showing forever if that webhook ever misses an
  // event (wrong/missing secret, endpoint never registered in Stripe, etc.).
  let payoutsEnabled = !!profile?.payoutsEnabled;
  if (!payoutsEnabled && profile?.stripeAccountId && stripeEnabled()) {
    payoutsEnabled = await reconcilePayoutStatus(user.id, profile.stripeAccountId);
  }

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

  // Weekly "sold vs paid out" series for the earnings graphic — the seller's
  // dominant currency only (picking a second currency's numbers into the same
  // bars would silently mix AUD with USD etc). Dominant = whichever currency
  // has the most combined held+released+readyForPayout volume; almost always
  // there's only one anyway, since a seller's listings are all priced in
  // whatever market their shop is set up in.
  const WEEKS = 12;
  const byCurrencyTotal = new Map<string, number>();
  for (const r of [...held, ...released, ...readyForPayout]) {
    const net = (r._sum.totalCents ?? 0) - (r._sum.feeCents ?? 0);
    byCurrencyTotal.set(r.currency, (byCurrencyTotal.get(r.currency) ?? 0) + net);
  }
  const seriesCurrency = [...byCurrencyTotal.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let series: { currency: string; points: { weekStart: string; soldNetCents: number; paidOutNetCents: number }[] } | null = null;
  if (seriesCurrency) {
    const cutoff = new Date(Date.now() - WEEKS * 7 * 86_400_000);
    const seriesOrders = await prisma.order.findMany({
      where: {
        sellerId: user.id,
        kind: "MARKETPLACE",
        currency: seriesCurrency,
        status: { in: ["PAID", "SHIPPED", "COMPLETED"] },
        OR: [{ createdAt: { gte: cutoff } }, { transferredAt: { gte: cutoff } }],
      },
      select: { createdAt: true, transferredAt: true, totalCents: true, feeCents: true },
      take: 2000,
    });
    const now = Date.now();
    const weekIndex = (d: Date) => WEEKS - 1 - Math.floor((now - d.getTime()) / (7 * 86_400_000));
    const points = Array.from({ length: WEEKS }, (_, i) => ({
      weekStart: new Date(now - (WEEKS - 1 - i) * 7 * 86_400_000).toISOString(),
      soldNetCents: 0,
      paidOutNetCents: 0,
    }));
    for (const o of seriesOrders) {
      const net = o.totalCents - o.feeCents;
      const ci = weekIndex(o.createdAt);
      if (ci >= 0 && ci < WEEKS) points[ci].soldNetCents += net;
      if (o.transferredAt) {
        const ti = weekIndex(o.transferredAt);
        if (ti >= 0 && ti < WEEKS) points[ti].paidOutNetCents += net;
      }
    }
    series = { currency: seriesCurrency, points };
  }

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
    payoutsEnabled,
    completedSalesCount: profile?.completedSalesCount ?? 0,
    held: toNet(held),
    released: toNet(released),
    readyForPayout: toNet(readyForPayout),
    recent: recentWithDates,
    series,
  });
}
