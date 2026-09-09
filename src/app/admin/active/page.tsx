import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NOT_SEED_WHERE } from "@/lib/premium";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Active users",
  robots: { index: false, follow: false },
};

const TAKE = 200; // cap the list; use the search box to find someone specific.

// Rendered by getCurrentUser()'s throttled "last seen" touch (lib/auth.ts,
// ACTIVITY_TOUCH_INTERVAL_MS) — an active session updates this at most every
// 5 minutes, so "active now" below means "made a request in the last 5
// minutes", not a live websocket presence signal.
const WINDOWS = [
  { key: "now", label: "Active now", ms: 5 * 60_000 },
  { key: "24h", label: "Last 24h", ms: 24 * 3600_000 },
  { key: "7d", label: "Last 7d", ms: 7 * 86400_000 },
  { key: "30d", label: "Last 30d", ms: 30 * 86400_000 },
] as const;
type WindowKey = (typeof WINDOWS)[number]["key"];

export default async function ActiveUsersAdminPage({
  searchParams,
}: {
  searchParams: { key?: string; q?: string; w?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const q = (searchParams.q ?? "").trim();
  const win = WINDOWS.find((w) => w.key === searchParams.w) ?? WINDOWS[1]; // default: last 24h
  const keySuffix = keyOk && !me?.isAdmin ? `&key=${encodeURIComponent(token!)}` : "";

  const now = new Date();
  const windowStart = new Date(now.getTime() - win.ms);

  type Row = {
    id: string;
    email: string;
    displayName: string;
    lastSeenAt: Date | null;
    createdAt: Date;
    premiumUntil: Date | null;
    isAdmin: boolean;
  };
  let rows: Row[] = [];
  let counts = { now: 0, d1: 0, d7: 0, d30: 0, totalUsers: 0, everActive: 0 };
  let error = false;
  try {
    const notSeed = NOT_SEED_WHERE;
    const search = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const nowStart = new Date(now.getTime() - WINDOWS[0].ms);
    const d1Start = new Date(now.getTime() - WINDOWS[1].ms);
    const d7Start = new Date(now.getTime() - WINDOWS[2].ms);
    const d30Start = new Date(now.getTime() - WINDOWS[3].ms);
    const [list, activeNow, dau, wau, mau, totalUsers, everActive] = await Promise.all([
      prisma.user.findMany({
        where: { AND: [notSeed, search, { lastSeenAt: { gte: windowStart } }] },
        orderBy: { lastSeenAt: "desc" },
        take: TAKE,
        select: {
          id: true, email: true, displayName: true, lastSeenAt: true, createdAt: true,
          premiumUntil: true, isAdmin: true,
        },
      }),
      prisma.user.count({ where: { AND: [notSeed, { lastSeenAt: { gte: nowStart } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { lastSeenAt: { gte: d1Start } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { lastSeenAt: { gte: d7Start } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { lastSeenAt: { gte: d30Start } }] } }),
      prisma.user.count({ where: notSeed }),
      prisma.user.count({ where: { AND: [notSeed, { lastSeenAt: { not: null } }] } }),
    ]);
    rows = list;
    counts = { now: activeNow, d1: dau, d7: wau, d30: mau, totalUsers, everActive };
  } catch {
    error = true;
  }

  const num = (n: number) => n.toLocaleString();
  const fmtExact = (d: Date) =>
    new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix ? `?key=${encodeURIComponent(token!)}` : ""}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Active users</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Active users</h1>
      <p className="mt-1 text-sm text-slate-400">
        Who&apos;s using the site, from real authenticated requests — not a page-view count. A session&apos;s
        &quot;last active&quot; stamp updates at most every 5 minutes, so treat &quot;active now&quot; as a
        recent-request signal, not a live presence indicator.
      </p>

      {/* Summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active now" value={num(counts.now)} sub="last 5 min" />
        <Stat label="Daily active" value={num(counts.d1)} sub="last 24h" />
        <Stat label="Weekly active" value={num(counts.d7)} sub="last 7d" />
        <Stat label="Monthly active" value={num(counts.d30)} sub="last 30d" />
      </div>
      {!error && (
        <p className="mt-2 text-xs text-slate-500">
          {num(counts.everActive)} of {num(counts.totalUsers)} registered accounts have ever been seen active
          {counts.totalUsers > counts.everActive && " (the rest signed up but haven't returned since, or predate this tracking)"}.
        </p>
      )}

      {/* Window filters */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {WINDOWS.map((w) => {
          const p = new URLSearchParams();
          if (q) p.set("q", q);
          if (w.key !== "24h") p.set("w", w.key);
          if (keyOk && !me?.isAdmin) p.set("key", token!);
          const qs = p.toString();
          const active = win.key === w.key;
          return (
            <Link
              key={w.key}
              href={`/admin/active${qs ? `?${qs}` : ""}`}
              className={`chip border px-3 py-1.5 text-xs font-semibold ${
                active ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:border-brand-500/50"
              }`}
            >
              {w.label}
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <form className="mt-3" action="/admin/active" method="get">
        {keyOk && !me?.isAdmin && <input type="hidden" name="key" value={token!} />}
        {win.key !== "24h" && <input type="hidden" name="w" value={win.key} />}
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          <button type="submit" className="btn-primary text-sm">Search</button>
          {q &&
            (() => {
              const p = new URLSearchParams();
              if (win.key !== "24h") p.set("w", win.key);
              if (keyOk && !me?.isAdmin) p.set("key", token!);
              const qs = p.toString();
              return (
                <Link href={`/admin/active${qs ? `?${qs}` : ""}`} className="btn-ghost text-sm">
                  Clear
                </Link>
              );
            })()}
        </div>
      </form>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load activity right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          {q ? `No active accounts match “${q}” in this window.` : `No accounts active in this window.`}
        </div>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">
            Showing {num(rows.length)}
            {rows.length === TAKE && <> (capped at {TAKE} — narrow the window or search to see more)</>}, most recently
            active first.
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Last active</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                  <th className="px-3 py-2 font-medium">Premium</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const premiumActive = !!(u.premiumUntil && u.premiumUntil > now);
                  return (
                    <tr key={u.id} className="border-b border-ink-800/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-white">{u.displayName}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300" title={u.lastSeenAt ? fmtExact(u.lastSeenAt) : undefined}>
                        {u.lastSeenAt ? timeAgo(u.lastSeenAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtExact(u.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {premiumActive ? (
                          <span className="chip bg-gold/20 text-gold">premium</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
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
