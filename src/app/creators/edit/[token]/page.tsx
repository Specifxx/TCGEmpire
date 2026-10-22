import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CREATORS } from "@/lib/content/creators";
import { DEFAULT_SHARE_PCT } from "@/lib/creator-payout";
import { applyEdit } from "@/lib/content/creator-edit";
import { hashEditToken } from "@/lib/creator-edit-token";
import { CreatorEarnings } from "@/components/creators/CreatorEarnings";
import { creatorEarnings } from "@/lib/creator-earnings-server";
import { SITE_URL } from "@/lib/site";
import { CreatorProfileForm } from "@/components/creators/CreatorProfileForm";

// A creator's private edit link (made at /admin/creators). Never indexed or cached.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit your creator card", robots: { index: false, follow: false } };

export default async function CreatorEditPage({ params }: { params: { token: string } }) {
  const row = await prisma.creatorProfileEdit.findUnique({ where: { editTokenHash: hashEditToken(params.token) } }).catch(() => null);
  const base = row && CREATORS.find((c) => c.slug === row.slug);
  if (!row || !base) notFound();
  const creator = applyEdit(base, row);
  const earnings = (await creatorEarnings().catch(() => new Map())).get(base.slug) ?? [];
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Edit your creator card</h1>
      <p className="mt-2 text-sm text-slate-400">
        Hi {creator.name}. Whatever you save here shows on riftcompare.com/creators. Keep this link private: anyone with it can edit your card.
        Want a new photo or name change? Just message us.
      </p>
      <section className="mt-6 rounded-xl border border-ink-700 p-4">
        <h2 className="font-bold text-white">Your traffic and earnings</h2>
        <p className="mt-1 text-sm text-slate-400">
          Share this link in your bio and videos: <code className="text-white">{SITE_URL}/c/{base.slug}</code> (add{" "}
          <code>?to=/radiance-preorders</code> or any page to land there). Each month you get {DEFAULT_SHARE_PCT}% of our affiliate profit
          from your share of our visitors. Visitors are counted once per browser per 30 days; the payout appears once the month is closed.
        </p>
        <div className="mt-3"><CreatorEarnings rows={earnings} /></div>
      </section>
      <div className="mt-6">
        <CreatorProfileForm token={params.token} creator={creator} />
      </div>
    </main>
  );
}
