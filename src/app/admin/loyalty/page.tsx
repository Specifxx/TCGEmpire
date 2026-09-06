import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NOT_SEED_WHERE } from "@/lib/premium";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Loyal users",
  robots: { index: false, follow: false },
};

const TOP_N = 25;

// "Loyal" here means demonstrated commitment we can actually measure —
// collection size and sustained Premium membership — NOT visit frequency,
// since the app has no login/session recency tracking anywhere (no
// lastSeenAt-style field on User). If that's wanted later it needs a new
// column + a stamp on session read, which doesn't exist today.
export default async function LoyaltyAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const now = new Date();
  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  type Collector = { userId: string; displayName: string; email: string; cards: number; since: Date };
  type PremiumMember = { userId: string; displayName: string; email: string; memberSince: Date; premiumUntil: Date };

  let collectors: Collector[] = [];
  let premiumMembers: PremiumMember[] = [];
  let error = false;

  try {
    const [collectorAgg, premiumRows] = await Promise.all([
      prisma.collectionCard.groupBy({
        by: ["userId"],
        _count: { _all: true },
        _min: { createdAt: true },
        orderBy: { _count: { userId: "desc" } },
        take: TOP_N,
      }),
      prisma.user.findMany({
        where: { AND: [NOT_SEED_WHERE, { premiumUntil: { gt: now } }] },
        orderBy: { createdAt: "asc" },
        take: TOP_N,
        select: { id: true, displayName: true, email: true, createdAt: true, premiumUntil: true },
      }),
    ]);

    const collectorIds = collectorAgg.map((c) => c.userId);
    const collectorUsers = await prisma.user.findMany({
      where: { id: { in: [...new Set(collectorIds)] } },
      select: { id: true, displayName: true, email: true },
    });
    const userById = new Map(collectorUsers.map((u) => [u.id, u]));

    collectors = collectorAgg
      .map((c) => {
        const u = userById.get(c.userId);
        if (!u) return null;
        return { userId: c.userId, displayName: u.displayName, email: u.email, cards: c._count._all, since: c._min.createdAt! };
      })
      .filter((x): x is Collector => x != null);

    premiumMembers = premiumRows.map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      memberSince: u.createdAt,
      premiumUntil: u.premiumUntil!,
    }));
  } catch (e) {
    console.error("[admin/loyalty] failed to load loyalty data:", e);
    error = true;
  }

  // Cross-signal callout: anyone showing up in 2+ lists is the clearest "most
  // loyal" signal we have — engaged across multiple parts of the product, not
  // just one big transaction.
  const categoriesByUser = new Map<string, { displayName: string; email: string; tags: string[] }>();
  const tag = (userId: string, displayName: string, email: string, label: string) => {
    const existing = categoriesByUser.get(userId);
    if (existing) existing.tags.push(label);
    else categoriesByUser.set(userId, { displayName, email, tags: [label] });
  };
  collectors.forEach((c) => tag(c.userId, c.displayName, c.email, "Collector"));
  premiumMembers.forEach((p) => tag(p.userId, p.displayName, p.email, "Premium"));
  const multiSignal = [...categoriesByUser.values()].filter((u) => u.tags.length >= 2).sort((a, b) => b.tags.length - a.tags.length);

  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const daysSince = (d: Date) => Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Loyal users</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">🏆 Loyal users</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        The users showing the most real, measurable commitment — collection size and sustained Premium membership.
        There&apos;s no login/visit-frequency tracking in the app today, so this is built entirely from collection and
        account data, not &ldquo;how often they show up.&rdquo;
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load loyalty data right now.
        </div>
      ) : (
        <>
          {multiSignal.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-lg font-semibold text-white">Most loyal — multiple signals</h2>
              <p className="mb-3 text-xs text-slate-500">Shows up in 2+ of the lists below. The strongest candidates for early access, thank-you outreach, or a loyalty perk.</p>
              <div className="overflow-x-auto rounded-xl border border-gold/30 bg-ink-850">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiSignal.map((u) => (
                      <tr key={u.email} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                        <td className="px-3 py-2">
                          <div className="font-medium text-white">{u.displayName}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {u.tags.map((t) => <span key={t} className="chip bg-gold/15 text-gold">{t}</span>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-8">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-white">Largest collections</h2>
              <span className="text-xs text-slate-500">cards tracked · top {TOP_N}</span>
            </div>
            {collectors.length === 0 ? (
              <Empty>No collections tracked yet.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 text-right font-medium">Cards tracked</th>
                      <th className="px-3 py-2 text-right font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectors.map((c, i) => (
                      <tr key={c.userId} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-white">{c.displayName}</div>
                          <div className="text-xs text-slate-500">{c.email}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-300">{c.cards}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500">{fmtDate(c.since)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-8">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-white">Longest-tenured active Premium members</h2>
              <span className="text-xs text-slate-500">oldest account still paying · top {TOP_N}</span>
            </div>
            {premiumMembers.length === 0 ? (
              <Empty>No active Premium members right now.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 text-right font-medium">Account age</th>
                      <th className="px-3 py-2 text-right font-medium">Premium until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiumMembers.map((p, i) => (
                      <tr key={p.userId} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-white">{p.displayName}</div>
                          <div className="text-xs text-slate-500">{p.email}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{daysSince(p.memberSince)}d</td>
                        <td className="px-3 py-2 text-right text-xs text-gold">{fmtDate(p.premiumUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 pb-3 pt-1 text-[11px] text-slate-600">
                  Account age is the best available proxy — subscription start date isn&apos;t stored separately, only the current expiry.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-sm text-slate-400">{children}</div>
  );
}
