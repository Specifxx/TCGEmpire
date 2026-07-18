import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { DisputedOrderActions, SellerSuspendToggle, DelistForm } from "@/components/AdminMarketplaceActions";

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Marketplace admin</h1>
        <p className="text-sm text-slate-400">Disputed orders, seller suspensions, and quick delisting.</p>
      </div>

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
