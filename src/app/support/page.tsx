import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SupportForm, type SupportOrderOption } from "@/components/SupportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with a RiftCompare Marketplace order, payment, or account issue.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage() {
  const user = await getCurrentUser();

  let orders: SupportOrderOption[] = [];
  if (user) {
    const rows = await prisma.order.findMany({
      where: { kind: "MARKETPLACE", OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, orderNumber: true, marketplaceListingId: true },
    });
    const listingIds = rows.map((r) => r.marketplaceListingId).filter((x): x is string => !!x);
    const listings = listingIds.length
      ? await prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, card: { select: { name: true } } } })
      : [];
    const byListing = new Map(listings.map((l) => [l.id, l.card.name]));
    orders = rows.map((r) => ({
      id: r.id,
      label: `${r.orderNumber != null ? `RC-${r.orderNumber}` : r.id.slice(0, 8)} — ${r.marketplaceListingId ? byListing.get(r.marketplaceListingId) ?? "item" : "item"}`,
    }));
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 font-display text-2xl font-extrabold text-white">🆘 Support</h1>
      <p className="mb-4 text-sm text-slate-400">
        Problem with a marketplace order, payment, or your account? Send us a message and we'll reply by email —
        usually within a day or two.
      </p>
      <SupportForm defaultName={user?.displayName} defaultEmail={user?.email} orders={orders} />
    </div>
  );
}
