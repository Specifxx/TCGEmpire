import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SellerFunds } from "@/components/SellerFunds";
import { MarketplaceBetaBadge } from "@/components/MarketplaceBetaBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seller funds — Marketplace",
  robots: { index: false, follow: false }, // hidden back-office, never indexed
};

export default async function MarketplaceFundsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/marketplace/funds");
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-slate-300">Marketplace</Link>
        <span>/</span>
        <span className="text-slate-300">Seller funds</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold text-white">💰 Seller funds</h1>
        <MarketplaceBetaBadge subject="Seller funds bug: " />
      </div>
      <SellerFunds />
    </div>
  );
}
