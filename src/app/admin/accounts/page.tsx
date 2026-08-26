import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountsExport, type ExportUser } from "@/components/admin/AccountsExport";
import { NOT_SEED_WHERE } from "@/lib/premium";

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
  searchParams: { key?: string; q?: string; f?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const q = (searchParams.q ?? "").trim();
  const filter = searchParams.f === "premium" || searchParams.f === "verified" ? searchParams.f : null;
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
    premiumUntil: Date | null;
    trialStartedAt: Date | null;
    createdAt: Date;
  }[] = [];
  let totals = { all: 0, verified: 0, premium: 0, new7: 0, new30: 0 };
  // Signups-over-time + attribution, so "did last week's change move signups"
  // is answerable from this page instead of being two bare integers (7d/30d).
  let daily: { day: string; count: number }[] = [];
  let bySource: [string, number][] = [];
  let unclaimedAlertEmails = 0;
  let error = false;
  try {
    // Never count synthetic seed accounts (dev-reset personas + the marketplace test
    // buyer) as users — they'd inflate the count and pollute the email export.
    const notSeed = NOT_SEED_WHERE;
    const search = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    // Quick filters: premium = active entitlement right now; verified = confirmed email.
    const quick =
      filter === "premium" ? { premiumUntil: { gt: now } } : filter === "verified" ? { emailVerified: { not: null } } : {};
    const where = { AND: [notSeed, search, quick] };
    const [list, all, verified, premium, new7, new30, recent30, anonEmails] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true, email: true, displayName: true, emailVerified: true, passwordHash: true,
          googleId: true, discordId: true, isAdmin: true,
          premiumUntil: true, trialStartedAt: true, createdAt: true,
        },
      }),
      prisma.user.count({ where: notSeed }),
      prisma.user.count({ where: { AND: [notSeed, { emailVerified: { not: null } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { premiumUntil: { gt: now } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { createdAt: { gte: d7 } }] } }),
      prisma.user.count({ where: { AND: [notSeed, { createdAt: { gte: d30 } }] } }),
      // Raw createdAt+signupSource for the last 30 days — bucketed by UTC day in
      // JS below rather than a raw SQL date_trunc, so this stays plain Prisma.
      prisma.user.findMany({
        where: { AND: [notSeed, { createdAt: { gte: d30 } }] },
        select: { createdAt: true, signupSource: true },
      }),
      // Distinct emails watching prices with NO account — the standing pool
      // claimAlertsForUser() adopts on signup. Shrinking = conversion working.
      //
      // COUNT(DISTINCT ...), not findMany({ distinct }): Prisma dedupes in the
      // CLIENT, so that form selects every matching row and ships it here just to
      // read .length. See the note on demandSnapshotDays() in lib/demand-snapshot.ts
      // — same bug, and it was the largest row-returning statement on the database.
      // Only the count is ever rendered, so only the count is fetched.
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT email) AS n FROM "PriceAlert" WHERE "userId" IS NULL
      `,
    ]);
    rows = list;
    totals = { all, verified, premium, new7, new30 };
    unclaimedAlertEmails = Number(anonEmails[0]?.n ?? 0);
    // Bucket by UTC day, zero-filling so a quiet day renders as a gap, not a
    // shorter x-axis (30 entries, oldest first).
    const byDay = new Map<string, number>();
    for (const u of recent30) {
      const key = u.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    daily = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(now.getTime() - (29 - i) * 86400_000).toISOString().slice(0, 10);
      return { day, count: byDay.get(day) ?? 0 };
    });
    const srcCounts = new Map<string, number>();
    for (const u of recent30) {
      const s = u.signupSource ?? "(untracked)";
      srcCounts.set(s, (srcCounts.get(s) ?? 0) + 1);
    }
    bySource = [...srcCounts.entries()].sort((a, b) => b[1] - a[1]);
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
        <Stat
          label="Watching, no account"
          value={num(unclaimedAlertEmails)}
          sub="distinct alert emails — adopted on signup"
        />
      </div>

      {/* Signups over time + where they came from. The bar strip answers "did
          last week's change move signups"; the source table answers "which
          sign-in surface converts" (User.signupSource, stamped by the OAuth
          callback from the CTA-set cookie — null for pre-instrumentation and
          direct-/login accounts). */}
      {!error && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Signups · last 30 days</div>
            <div className="text-xs text-slate-400">
              <span className="num font-bold text-white">{num(totals.new30)}</span> total ·{" "}
              <span className="num font-bold text-white">{num(totals.new7)}</span> in 7d
            </div>
          </div>
          <div className="mt-3 flex h-16 items-end gap-[2px]" aria-hidden>
            {daily.map(({ day, count }) => {
              const max = Math.max(1, ...daily.map((d) => d.count));
              return (
                <div
                  key={day}
                  title={`${day}: ${count}`}
                  className={`flex-1 rounded-t ${count > 0 ? "bg-brand-500/80" : "bg-ink-700"}`}
                  style={{ height: count > 0 ? `${Math.max(12, (count / max) * 100)}%` : "3px" }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-600">
            <span>{daily[0]?.day}</span>
            <span>{daily[daily.length - 1]?.day}</span>
          </div>
          {bySource.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bySource.map(([src, count]) => (
                <span key={src} className="chip bg-ink-800 text-slate-400">
                  {src} · <span className="num font-bold text-slate-200">{num(count)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export */}
      {!error && rows.length > 0 && (
        <div className="mt-5 space-y-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
          <AccountsExport users={exportUsers} />
          <p className="text-xs text-slate-500">
            Seed accounts (@tcgempire.au, test@test.com) are already hidden from this list and the export.
          </p>
        </div>
      )}

      {/* Quick filters */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {([
          [null, "All"],
          ["premium", "◆ Premium"],
          ["verified", "✓ Verified"],
        ] as const).map(([f, label]) => {
          const p = new URLSearchParams();
          if (q) p.set("q", q);
          if (f) p.set("f", f);
          if (keyOk && !me?.isAdmin) p.set("key", token!);
          const qs = p.toString();
          const active = filter === f || (!filter && f === null);
          return (
            <Link
              key={label}
              href={`/admin/accounts${qs ? `?${qs}` : ""}`}
              className={`chip border px-3 py-1.5 text-xs font-semibold ${
                active ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:border-brand-500/50"
              } ${f === "premium" && active ? "border-gold bg-gold/15 text-gold" : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <form className="mt-3" action="/admin/accounts" method="get">
        {keyOk && !me?.isAdmin && <input type="hidden" name="key" value={token!} />}
        {filter && <input type="hidden" name="f" value={filter} />}
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
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {u.isAdmin ? <span className="chip bg-brand-500/15 text-brand-300">admin</span> : <span className="text-slate-600">—</span>}
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
