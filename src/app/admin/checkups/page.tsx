import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CHECKUP_CAP, CHECKUP_READ_DATE, CHECKUP_SOURCE, isFounderTick } from "@/lib/checkup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Collection check-ups", robots: { index: false, follow: false } };

// The check-up test's queue (lib/checkup.ts): every request from every site, newest first,
// with its reply address. Admin session only.
export default async function AdminCheckupsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();

  const rows = await prisma.feedback.findMany({
    where: { source: CHECKUP_SOURCE },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, createdAt: true, message: true, email: true, userId: true, site: true },
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const ticks = rows.filter((r) => isFounderTick(r.message)).length;
  const bySite = rows.reduce<Record<string, number>>((m, r) => ((m[r.site] = (m[r.site] ?? 0) + 1), m), {});
  const fmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 text-xs text-slate-500">
        <Link href="/admin" className="hover:text-slate-300">Admin</Link> / <span className="text-slate-300">Check-ups</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Collection check-ups</h1>
      <p className="mt-1 text-sm text-slate-400">
        {rows.length} requests · {ticks} founder-price ticks · {Object.entries(bySite).map(([k, v]) => `${k} ${v}`).join(" · ") || "none yet"} ·
        write up to {CHECKUP_CAP} · read {CHECKUP_READ_DATE} (go: 60+ requests and 25+ ticks; stop under 20)
      </p>
      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="card-surface p-4">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>{fmt.format(r.createdAt)}</span>
              <span className="font-semibold text-white">{(r.userId && emailOf.get(r.userId)) || r.email || "no address"}</span>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">{r.message}</pre>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
      </div>
    </div>
  );
}
