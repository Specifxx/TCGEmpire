import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { trackingUrl, CARRIER_LABEL, type Carrier } from "@/lib/tracking";
import { DisputedOrderActions, SellerSuspendToggle, DelistForm, DeliveryReviewActions } from "@/components/AdminMarketplaceActions";
import { MARKETPLACE_ADMIN_ATTENTION_DAYS, autoReleaseDate } from "@/lib/marketplace-policy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace admin",
  robots: { index: false, follow: false },
};

export default async function AdminMarketplacePage({ searchParams }: { searchParams: { key?: string; q?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();
  const keySuffix = keyOk && !user?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  // Support tickets are a separate model/page (/admin/support) but the same
  // wind-down operation as everything else here — a marketplace order gone
  // wrong is usually how a ticket gets opened — so the dashboard now sends
  // people to this one tile and this header link gets them the rest of the
  // way instead of keeping a second, mostly-empty tile.
  const openTickets = await prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });

  // EXCEPTIONS ONLY — every shipped order now auto-releases on its own scheduled
  // date (shippedAt + MARKETPLACE_AUTO_RELEASE_DAYS) unless disputed, so doing
  // nothing here is the safe, expected default. This queue surfaces only the
  // two cases that actually need a human: a seller asking for an early release,
  // or a parcel shipped unusually long ago with no confirmation either way.
  const attentionCutoff = new Date(Date.now() - MARKETPLACE_ADMIN_ATTENTION_DAYS * 86_400_000);
  const awaitingReview = await prisma.order.findMany({
    where: {
      kind: "MARKETPLACE",
      status: "SHIPPED",
      disputedAt: null,
      OR: [{ releaseRequestedAt: { not: null } }, { shippedAt: { lt: attentionCutoff } }],
    },
    orderBy: { shippedAt: "asc" },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      totalCents: true,
      currency: true,
      shippedAt: true,
      carrier: true,
      trackingNumber: true,
      releaseRequestedAt: true,
      adminReviewedAt: true,
      adminReviewedBy: true,
      buyer: { select: { email: true, displayName: true } },
      seller: { select: { email: true, displayName: true } },
    },
  });
  awaitingReview.sort((a, b) => {
    if (!!a.releaseRequestedAt !== !!b.releaseRequestedAt) return a.releaseRequestedAt ? -1 : 1;
    if (a.releaseRequestedAt && b.releaseRequestedAt) return a.releaseRequestedAt.getTime() - b.releaseRequestedAt.getTime();
    return (a.shippedAt?.getTime() ?? 0) - (b.shippedAt?.getTime() ?? 0);
  });

  const disputed = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", disputedAt: { not: null } },
    orderBy: { disputedAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalCents: true,
      currency: true,
      disputedAt: true,
      buyer: { select: { email: true, displayName: true } },
      seller: { select: { email: true, displayName: true } },
    },
  });

  const q = searchParams.q?.trim();
  const sellers = await prisma.sellerProfile.findMany({
    where: q
      ? { OR: [{ shopName: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] }
      : { OR: [{ suspendedAt: { not: null } }, { completedSalesCount: { gt: 0 } }] },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { userId: true, shopName: true, suspendedAt: true, completedSalesCount: true, payoutsEnabled: true, user: { select: { email: true } } },
  });

  const fmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

  // GMV + fee revenue, monthly for the last 6 months plus all-time. PAID and
  // SHIPPED count as money in escrow; COMPLETED as realised — all three carry
  // a collected fee (cancelled/refunded orders return the buyer's full charge,
  // fee included, so they're excluded).
  type RevRow = { month: Date; gmv: bigint; fees: bigint; orders: bigint };
  const revenue = await prisma.$queryRaw<RevRow[]>`
    SELECT date_trunc('month', "createdAt") AS month,
           SUM("totalCents")::bigint AS gmv,
           SUM("feeCents")::bigint AS fees,
           COUNT(*)::bigint AS orders
    FROM "Order"
    WHERE kind = 'MARKETPLACE' AND status IN ('PAID', 'SHIPPED', 'COMPLETED')
    GROUP BY 1 ORDER BY 1 DESC LIMIT 6
  `.catch(() => [] as RevRow[]);
  const allTime = revenue.length
    ? await prisma.order.aggregate({
        where: { kind: "MARKETPLACE", status: { in: ["PAID", "SHIPPED", "COMPLETED"] } },
        _sum: { totalCents: true, feeCents: true },
        _count: { _all: true },
      })
    : null;
  const monthFmt = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace admin</h1>
          <p className="text-sm text-slate-400">Exceptions queue: early-release requests, stale shipments, disputes, seller controls.</p>
        </div>
        <Link href={`/admin/support${keySuffix}`} className="chip shrink-0 bg-ink-800 text-slate-300 hover:text-white">
          Support tickets{openTickets > 0 && <> · <strong className="text-gold">{openTickets}</strong> open</>} →
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-white">Revenue</h2>
        {!revenue.length ? (
          <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-slate-400">No paid marketplace orders yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-semibold">Month</th>
                  <th className="px-4 py-2 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2 text-right font-semibold">GMV</th>
                  <th className="px-4 py-2 text-right font-semibold" title="2% standard, 1% for Premium sellers — real per-order fees, so this reflects the actual mix">Fee revenue</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map((r) => (
                  <tr key={r.month.toISOString()} className="border-b border-ink-800 last:border-0">
                    <td className="px-4 py-2 text-slate-300">{monthFmt.format(r.month)}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{Number(r.orders)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatMoney(Number(r.gmv), "AUD")}</td>
                    <td className="px-4 py-2 text-right font-semibold text-brand-300">{formatMoney(Number(r.fees), "AUD")}</td>
                  </tr>
                ))}
                {allTime && (
                  <tr className="bg-ink-900/60">
                    <td className="px-4 py-2 font-semibold text-white">All time</td>
                    <td className="px-4 py-2 text-right text-slate-400">{allTime._count._all}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{formatMoney(allTime._sum.totalCents ?? 0, "AUD")}</td>
                    <td className="px-4 py-2 text-right font-semibold text-brand-300">{formatMoney(allTime._sum.feeCents ?? 0, "AUD")}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="px-4 pb-3 pt-1 text-[11px] text-slate-600">
              PAID/SHIPPED/COMPLETED orders only (cancelled &amp; refunded excluded). Mixed currencies are summed at face value.
            </p>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-white">Needs attention ({awaitingReview.length})</h2>
        <p className="mb-3 text-xs text-slate-500">
          Everything else releases automatically 14 days after shipping — only exceptions land here: sellers
          requesting an early release, and parcels shipped over {MARKETPLACE_ADMIN_ATTENTION_DAYS} days ago with no
          confirmation yet. Disputed orders are in their own section below.
        </p>
        {awaitingReview.length === 0 ? (
          <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-slate-400">Nothing awaiting review.</div>
        ) : (
          <ul className="space-y-3">
            {awaitingReview.map((o) => {
              const url = trackingUrl(o.carrier, o.trackingNumber);
              const carrierLabel = o.carrier ? CARRIER_LABEL[o.carrier as Carrier] ?? o.carrier : null;
              const daysAgo = o.shippedAt ? Math.floor((Date.now() - o.shippedAt.getTime()) / 86_400_000) : null;
              return (
                <li key={o.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="font-semibold text-white">
                      {o.orderNumber != null ? `RC-${o.orderNumber}` : o.id.slice(0, 8)} · {formatMoney(o.totalCents, o.currency)}
                    </div>
                    <div className="flex items-center gap-2">
                      {o.releaseRequestedAt && <span className="chip bg-gold/15 text-[10px] font-bold text-gold">🔔 early release requested</span>}
                      <span className="text-xs text-slate-500">
                        shipped {daysAgo}d ago{o.shippedAt && ` · auto-releases ${fmt.format(autoReleaseDate(o.shippedAt))}`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-400">
                    Buyer: {o.buyer.displayName} ({o.buyer.email}) · Seller: {o.seller.displayName} ({o.seller.email})
                  </div>
                  <div className="mt-1 text-sm">
                    {o.trackingNumber ? (
                      url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
                          📦 {carrierLabel}: {o.trackingNumber} ↗
                        </a>
                      ) : (
                        <span className="text-slate-300">📦 {carrierLabel}: {o.trackingNumber}</span>
                      )
                    ) : (
                      <span className="text-slate-500">No tracking number on file</span>
                    )}
                  </div>
                  {o.adminReviewedAt && (
                    <div className="mt-1 text-xs text-slate-500">Last reviewed {fmt.format(o.adminReviewedAt)} by {o.adminReviewedBy}</div>
                  )}
                  <DeliveryReviewActions orderId={o.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-white">Disputed orders ({disputed.length})</h2>
        {disputed.length === 0 ? (
          <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-slate-400">No open disputes.</div>
        ) : (
          <ul className="space-y-3">
            {disputed.map((o) => (
              <li key={o.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="font-semibold text-white">
                    {o.orderNumber != null ? `RC-${o.orderNumber}` : o.id.slice(0, 8)} · {formatMoney(o.totalCents, o.currency)}
                  </div>
                  <span className="text-xs text-slate-500">flagged {fmt.format(o.disputedAt!)}</span>
                </div>
                <div className="mt-0.5 text-sm text-slate-400">
                  Buyer: {o.buyer.displayName} ({o.buyer.email}) · Seller: {o.seller.displayName} ({o.seller.email}) · status {o.status}
                </div>
                <DisputedOrderActions orderId={o.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Sellers</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search shop or email…" className="input w-auto py-1 text-xs" />
            <button type="submit" className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-ink-700">Search</button>
          </form>
        </div>
        {sellers.length === 0 ? (
          <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-slate-400">No sellers match.</div>
        ) : (
          <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700 bg-ink-850">
            {sellers.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {s.shopName} {s.suspendedAt && <span className="chip bg-rose-500/15 text-[10px] text-rose-300">suspended</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.user.email} · {s.completedSalesCount} completed sales · payouts {s.payoutsEnabled ? "enabled" : "not enabled"}
                  </div>
                </div>
                <Link href={`/marketplace/seller/${s.userId}`} className="text-xs text-brand-400 hover:underline">Storefront →</Link>
                <SellerSuspendToggle userId={s.userId} suspended={!!s.suspendedAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Quick delist</h2>
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
          <DelistForm />
        </div>
      </section>
    </div>
  );
}
