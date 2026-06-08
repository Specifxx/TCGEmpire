import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { AdminRedemptions } from "@/components/AdminRedemptions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Redemptions",
  robots: { index: false, follow: false },
};

// Admin-only queue of personalised "experience" reward redemptions to action.
export default async function AdminRedemptionsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold text-white">Experience redemptions</h1>
      <p className="mb-5 text-sm text-slate-400">
        Personalised rewards members have redeemed with Shards. Reach out by email to fulfil each one, then mark it done.
      </p>
      <AdminRedemptions />
    </div>
  );
}
