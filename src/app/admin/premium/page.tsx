import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Premium interest",
  robots: { index: false, follow: false },
};

const SAMPLE = 2000; // aggregate the most recent N interest events.

type Agg = {
  userId: string;
  count: number;
  last: Date;
  sources: Set<string>;
  displayName: string;
  email: string;
  premiumUntil: Date | null;
};

export default async function PremiumInterestAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();

  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d30 = new Date(now.getTime() - 30 * 86400_000);

  let totals = { all: 0, e7: 0, e30: 0, checkout: 0 };
  let users: Agg[] = [];
  let anon = 0;
  let converted = 0;
  let error = false;
  try {
    const [all, e7, e30, checkout, recent] = await Promise.all([
      prisma.premiumClick.count(),
      prisma.premiumClick.count({ where: { createdAt: { gte: d7 } } }),
      prisma.premiumClick.count({ where: { createdAt: { gte: d30 } } }),
      prisma.premiumClick.count({ where: { source: "checkout" } }),
      prisma.premiumClick.findMany({
        orderBy: { createdAt: "desc" },
        take: SAMPLE,
        select: { userId: true, source: true, createdAt: true },
      }),
    ]);
    totals = { all, e7, e30, checkout };
    anon = recent.filter((r) => !r.userId).length;

    // Aggregate signed-in clicks per user.
    const byUser = new Map<string, { count: number; last: Date; sources: Set<string> }>();
    for (const r of recent) {
      if (!r.userId) continue;
      const cur = byUser.get(r.userId) ?? { count: 0, last: r.createdAt, sources: new Set<string>() };
      cur.count++;
      if (r.createdAt > cur.last) cur.last = r.createdAt;
      cur.sources.add(r.source);
      byUser.set(r.userId, cur);
    }
    const ids = [...byUser.keys()];
    if (ids.length) {
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, email: true, premiumUntil: true },
      });
      const umap = new Map(found.map((u) => [u.id, u]));
      users = ids
        .map((id) => {
          const a = byUser.get(id)!;
          const u = umap.get(id);
          if (!u) return null;
          return { userId: id, count: a.count, last: a.last, sources: a.sources, displayName: u.displayName, email: u.email, premiumUntil: u.premiumUntil };
        })
        .filter(Boolean) as Agg[];
      users.sort((a, b) => b.last.getTime() - a.last.getTime());
      converted = users.filter((u) => u.premiumUntil && u.premiumUntil > now).length;
    }
  } catch {
    error = true;
  }

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const num = (n: number) => n.toLocaleString();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Premium interest</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Premium interest</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Who clicked a Premium CTA (opened the upsell dialog or started checkout) — an interest signal ahead of, and
        independent of, actually subscribing.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clicks · all time" value={num(totals.all)} />
        <Stat label="Clicks · 30d" value={num(totals.e30)} sub={`${num(totals.e7)} in 7d`} />
        <Stat label="Started checkout" value={num(totals.checkout)} />
        <Stat label="Interested → Premium" value={num(converted)} sub="of recent signed-in" />
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load premium interest right now.
        </div>
      ) : users.length === 0 && anon === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          No premium clicks recorded yet.
        </div>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">
            {num(users.length)} signed-in {users.length === 1 ? "person" : "people"} clicked
            {anon > 0 && <> · {num(anon)} click{anon === 1 ? "" : "s"} from logged-out visitors</>}
            {totals.all > SAMPLE && <> (aggregated from the most recent {num(SAMPLE)} events)</>}.
          </p>
          {users.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2 font-medium">Where</th>
                    <th className="px-3 py-2 font-medium">Last clicked</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.userId} className="border-b border-ink-800 last:border-0 align-top hover:bg-ink-800/50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{u.displayName}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{num(u.count)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {[...u.sources].map((s) => (
                            <span key={s} className={`chip ${s === "checkout" ? "bg-gold/20 text-gold" : "bg-ink-800 text-slate-400"}`}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(u.last)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {u.premiumUntil && u.premiumUntil > now ? (
                          <span className="chip bg-brand-500/15 text-brand-300">✓ Premium</span>
                        ) : (
                          <span className="chip bg-ink-800 text-slate-500">not yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="num mt-1 text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
