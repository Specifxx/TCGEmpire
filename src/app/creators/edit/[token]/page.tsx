import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CREATORS } from "@/lib/content/creators";
import { applyEdit } from "@/lib/content/creator-edit";
import { hashEditToken } from "@/lib/creator-edit-token";
import { CreatorProfileForm } from "@/components/creators/CreatorProfileForm";

// A creator's private edit link (made at /admin/creators). Never indexed or cached.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit your creator card", robots: { index: false, follow: false } };

export default async function CreatorEditPage({ params }: { params: { token: string } }) {
  const row = await prisma.creatorProfileEdit.findUnique({ where: { editTokenHash: hashEditToken(params.token) } }).catch(() => null);
  const base = row && CREATORS.find((c) => c.slug === row.slug);
  if (!row || !base) notFound();
  const creator = applyEdit(base, row);
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Edit your creator card</h1>
      <p className="mt-2 text-sm text-slate-400">
        Hi {creator.name}. Whatever you save here shows on riftcompare.com/creators. Keep this link private: anyone with it can edit your card.
        Want a new photo or name change? Just message us.
      </p>
      <div className="mt-6">
        <CreatorProfileForm token={params.token} creator={creator} />
      </div>
    </main>
  );
}
