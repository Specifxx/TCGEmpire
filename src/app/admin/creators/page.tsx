import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { featuredCreators } from "@/lib/content/creators";
import { CreatorEditLinkButton } from "@/components/admin/CreatorEditLinkButton";

export const dynamic = "force-dynamic";

// Private edit links for listed creators (lib/content/creator-edit.ts). Send a creator
// their link; they edit their own blurb, links, tip page, tags and region.
export default async function AdminCreatorsPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();
  const rows = await prisma.creatorProfileEdit.findMany({ select: { slug: true, editedAt: true, createdAt: true } });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-white">Creators</h1>
      <p className="mt-1 text-sm text-slate-400">Make a private link and send it to the creator. A new link replaces the old one. Adding a creator is still an entry in lib/content/creators.ts.</p>
      <ul className="mt-6 divide-y divide-ink-800">
        {featuredCreators().map((c) => {
          const r = bySlug.get(c.slug);
          return (
            <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <div className="font-semibold text-white">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {r?.editedAt ? `Edited by them ${r.editedAt.toISOString().slice(0, 10)}` : r ? "Link sent, not edited yet" : "No link yet"}
                </div>
              </div>
              <CreatorEditLinkButton slug={c.slug} adminKey={keyOk ? token! : ""} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
