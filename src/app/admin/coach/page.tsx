import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { COACH_CAP, COACH_READ_DATE, COACH_SOURCE, isFounderTap } from "@/lib/coach";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Deck Coach requests", robots: { index: false, follow: false } };

// The Deck Coach test's queue (lib/coach.ts): every request, newest first, with the
// reply address. Admin session only. Reports are written by hand and sent from the
// site's inbox; the go rule is read on COACH_READ_DATE.
export default async function AdminCoachPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();

  const rows = await prisma.feedback.findMany({
    where: { source: COACH_SOURCE },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, createdAt: true, message: true, email: true, userId: true },
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const founders = rows.filter((r) => isFounderTap(r.message)).length;
  const fmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 text-xs text-slate-500">
        <Link href="/admin" className="hover:text-slate-300">Admin</Link> / <span className="text-slate-300">Deck Coach</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Deck Coach requests</h1>
      <p className="mt-1 text-sm text-slate-400">
        {rows.length} decks · {founders} founder-price taps · report cap {COACH_CAP} · read {COACH_READ_DATE} (go: 100+ decks and 30+ taps; stop under 40 decks)
      </p>
      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="card-surface p-4">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>{fmt.format(r.createdAt)}</span>
              <span className="font-semibold text-white">{(r.userId && emailOf.get(r.userId)) || r.email || "no address"}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-xs text-slate-300">{r.message}</pre>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
      </div>
    </div>
  );
}
