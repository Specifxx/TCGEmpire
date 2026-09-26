import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminDeckImport, AdminDeckToggle } from "@/components/admin/AdminDeckImport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Decks",
  robots: { index: false, follow: false },
};

// Admin-only (same gate as /admin/messages): import tournament lists as JSON
// and hide or restore any published deck (2026-09-26).
export default async function AdminDecksPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();
  const adminKey = keyOk && !user?.isAdmin ? token! : "";

  const decks = await prisma.publishedDeck
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, slug: true, title: true, legendName: true, authorName: true, source: true, status: true, createdAt: true },
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-extrabold text-white">Published decks</h1>
      <AdminDeckImport adminKey={adminKey} />
      <section className="card-surface overflow-hidden">
        <h2 className="border-b border-ink-800 p-4 font-bold text-white">{decks.length} decks</h2>
        <ul className="divide-y divide-ink-800">
          {decks.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1">
                <Link href={`/decks/${d.slug}`} className="font-semibold text-white hover:underline">
                  {d.title}
                </Link>
                <span className="block text-xs text-slate-500">
                  {d.legendName} · {d.authorName ?? "—"} · {d.source} · {d.status} · {d.createdAt.toISOString().slice(0, 10)}
                </span>
              </span>
              <AdminDeckToggle id={d.id} status={d.status} adminKey={adminKey} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
