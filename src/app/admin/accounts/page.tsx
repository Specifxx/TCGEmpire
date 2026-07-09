import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountsExport, type ExportUser } from "@/components/admin/AccountsExport";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false, follow: false },
};

const TAKE = 500; // cap the list; use the search box to find older accounts.

export default async function AccountsAdminPage({
  searchParams,
}: {
  searchParams: { key?: string; q?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const q = (searchParams.q ?? "").trim();
  const keySuffix = keyOk && !me?.isAdmin ? `&key=${encodeURIComponent(token!)}` : "";

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d30 = new Date(now.getTime() - 30 * 86400_000);

  let rows: {
    id: string;
    email: string;
    displayName: string;
    emailVerified: Date | null;
    passwordHash: string | null;
    googleId: string | null;
    discordId: string | null;
    isAdmin: boolean;
    isVerifiedSeller: boolean;
    premiumUntil: Date | null;
    trialStartedAt: Date | null;
    lifetimePoints: number;
    createdAt: Date;
  }[] = [];
  let totals = { all: 0, verified: 0, premium: 0, new7: 0, new30: 0 };
  let error = false;
  try {
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined;
    const [list, all, verified, premium, new7, new30] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true, email: true, displayName: true, emailVerified: true, passwordHash: true,
          googleId: true, discordId: true, isAdmin: true, isVerifiedSeller: true,
          premiumUntil: true, trialStartedAt: true, lifetimePoints: true, createdAt: true,
        },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.user.count({ where: { premiumUntil: { gt: now } } }),
      prisma.user.count({ where: { createdAt: { gte: d7 } } }),
      prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    ]);
    rows = list;
    totals = { all, verified, premium, new7, new30 };
  } catch {
    error = true;
  }

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const num = (n: number) => n.toLocaleString();

  const exportUsers: ExportUser[] = rows.map((u) => ({
    name: u.displayName,
    email: u.email,
    registered: fmt(u.createdAt),
    verified: !!u.emailVerified,
    premium: !!(u.premiumUntil && u.premiumUntil > now),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix ? `?key=${encodeURIComponent(token!)}` : ""}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Accounts</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Accounts</h1>
      <p className="mt-1 text-sm text-slate-400">Every registered account, newest first. Admin-only, excluded from search.</p>

      {/* Summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total users" value={num(totals.all)} />
        <Stat label="Email-verified" value={num(totals.verified)} />
        <Stat label="Premium (active)" value={num(totals.premium)} />
        <Stat label="New · 30 days" value={num(totals.new30)} sub={`${num(totals.new7)} in 7d`} />
      </div>

      {/* Export */}
      {!error && rows.length > 0 && (
        <div className="mt-5 rounded-xl border border-ink-700 bg-ink-850 p-3">
          <AccountsExport users={exportUsers} />
        </div>
      )}

      {/* Search */}
      <form className="mt-4" action="/admin/accounts" method="get">
        {keyOk && !me?.isAdmin && <input type="hidden" name="key" value={token!} />}
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          <button type="submit" className="btn-primary text-sm">Search</button>
          {q && (
            <Link href={`/admin/accounts${keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : ""}`} className="btn-ghost text-sm">
              Clear
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load accounts right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          {q ? `No accounts match “${q}”.` : "No accounts yet."}
        </div>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">
            Showing {num(rows.length)}
            {!q && totals.all > rows.length && <> of {num(totals.all)} (most recent {TAKE} — search to find older accounts)</>}.
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                  <th className="px-3 py-2 font-medium">Verified</th>
                  <th className="px-3 py-2 font-medium">Sign-in</th>
                  <th className="px-3 py-2 font-medium">Premium</th>
                  <th className="px-3 py-2 text-right font-medium">Shards</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const methods = [
                    u.googleId ? "Google" : null,
                    u.discordId ? "Discord" : null,
                    u.passwordHash ? "Password" : null,
                  ].filter(Boolean) as string[];
                  const premiumActive = u.premiumUntil && u.premiumUntil > now;
                  return (
                    <tr key={u.id} className="border-b border-ink-800 last:border-0 align-top hover:bg-ink-800/50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{u.displayName}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(u.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {u.emailVerified ? (
                          <span className="text-brand-300">✓ {fmt(u.emailVerified)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {methods.length ? (
                            methods.map((m) => <span key={m} className="chip bg-ink-800 text-slate-400">{m}</span>)
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {premiumActive ? (
                          <span className="chip bg-gold/20 text-gold">until {fmt(u.premiumUntil)}</span>
                        ) : u.premiumUntil ? (
                          <span className="chip bg-ink-800 text-slate-500">lapsed</span>
                        ) : u.trialStartedAt ? (
                          <span className="chip bg-ink-800 text-slate-500">trial used</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-300">{num(u.lifetimePoints)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {u.isAdmin && <span className="chip bg-brand-500/15 text-brand-300">admin</span>}
                          {u.isVerifiedSeller && <span className="chip bg-ink-800 text-slate-400">seller</span>}
                          {!u.isAdmin && !u.isVerifiedSeller && <span className="text-slate-600">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
