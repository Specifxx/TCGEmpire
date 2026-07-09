import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Feedback",
  robots: { index: false, follow: false },
};

export default async function FeedbackAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();

  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  let rows: { id: string; userId: string; message: string; rating: number | null; createdAt: Date }[] = [];
  let umap = new Map<string, { displayName: string; email: string }>();
  let total = 0;
  let error = false;
  try {
    [rows, total] = await Promise.all([
      prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.feedback.count(),
    ]);
    const ids = [...new Set(rows.map((r) => r.userId))];
    if (ids.length) {
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true } });
      umap = new Map(users.map((u) => [u.id, { displayName: u.displayName, email: u.email }]));
    }
  } catch {
    error = true;
  }

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Feedback</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Feedback</h1>
      <p className="mt-1 text-sm text-slate-400">
        Submitted via the <Link href="/feedback" className="text-brand-400 hover:underline">on-site feedback form</Link>.
        {total > 0 && <> {total.toLocaleString()} total.</>}
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load feedback right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          No feedback yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const u = umap.get(r.userId);
            return (
              <div key={r.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{u?.displayName ?? "Unknown user"}</span>
                  {u?.email && <span className="text-xs text-slate-500">{u.email}</span>}
                  {r.rating != null && (
                    <span className="chip bg-gold/15 text-gold" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}<span className="text-gold/30">{"★".repeat(5 - r.rating)}</span>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">{fmt(r.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
