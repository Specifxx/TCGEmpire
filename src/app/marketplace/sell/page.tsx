import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SellerDashboard } from "@/components/SellerDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seller dashboard", robots: { index: false } };

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/marketplace/sell");
  if (!user.isVerifiedSeller) redirect("/marketplace");
  return <SellerDashboard />;
}
