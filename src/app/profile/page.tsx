import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPointsState } from "@/lib/points";
import { SHARD } from "@/lib/points-config";
import { formatAUD } from "@/lib/format";
import { LogoutButton, ResendVerifyButton } from "@/components/ProfileActions";
import { MyCollection } from "@/components/MyCollection";

export const dynamic = "force-dynamic";

const KIND_BADGE: Record<string, string> = {
  WTB: "bg-emerald-500/15 text-emerald-300",
  WTS: "bg-gold/15 text-gold",
  DISCUSSION: "bg-sky-500/15 text-sky-300",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const [posts, account, points] = await Promise.all([
    prisma.forumPost.findMany({ where: { userId: user.id, status: "OPEN" }, orderBy: { createdAt: "desc" } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { googleId: true, discordId: true, passwordHash: true } }),
    getPointsState(user.id),
  ]);
  const wts = posts.filter((p) => p.kind === "WTS").length;
  const wtb = posts.filter((p) => p.kind === "WTB").length;

  const methods = [
    { label: "Password", on: !!account?.passwordHash },
    { label: "Google", on: !!account?.googleId },
    { label: "Discord", on: !!account?.discordId },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-2xl font-black text-white">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-white">{user.displayName}</h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* Shards / rewards summary */}
      {points && (
        <Link href="/rewards" className="card-surface mt-5 flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:border-brand-500/50">
          <div className="flex items-center gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black"
              style={{ background: points.level.bg, color: points.level.color, boxShadow: `inset 0 0 0 1.5px ${points.level.color}55` }}
            >
              {SHARD.glyph}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white">{points.level.name}</h2>
                {points.streakDays > 0 && <span className="chip bg-orange-500/15 text-orange-300">🔥 {points.streakDays}d</span>}
                {points.canCheckIn && <span className="chip bg-brand-500/15 text-brand-300">Check in today</span>}
              </div>
              <p className="text-sm text-slate-400">
                {SHARD.glyph} <span className="font-semibold text-accent">{points.points.toLocaleString()}</span> {SHARD.name}
                {points.next && <span className="text-slate-500"> · {points.progress.remaining.toLocaleString()} to {points.next.name}</span>}
              </p>
            </div>
          </div>
          <span className="btn-ghost">Open rewards →</span>
        </Link>
      )}

      {/* My Collection — cards the user owns, valued live (separate from wishlist) */}
      <MyCollection />

      {/* Account & security */}
      <div className="card-surface mt-5 p-5">
        <h2 className="font-bold text-white">Account &amp; security</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 pb-3 text-sm">
          <span className="text-slate-400">Email</span>
          {user.emailVerified ? (
            <span className="chip bg-brand-500/15 text-brand-300">✓ Verified</span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="chip bg-gold/15 text-gold">Not confirmed</span>
              <ResendVerifyButton />
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-400">Sign-in methods</span>
          <span className="flex gap-1.5">
            {methods.map((m) => (
              <span key={m.label} className={`chip ${m.on ? "bg-ink-800 text-slate-200" : "bg-ink-900 text-slate-600"}`}>
                {m.on ? "✓ " : ""}{m.label}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Link more sign-in options any time from the <Link href="/login" className="text-brand-400 hover:underline">sign-in page</Link>, or manage your{" "}
          <Link href="/wishlist" className="text-brand-400 hover:underline">wishlist</Link>.
        </p>
      </div>

      <div className="card-surface mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Your Forum listings</h2>
            <p className="text-sm text-slate-400">
              {posts.length} open · {wts} selling · {wtb} buying
            </p>
          </div>
          <div className="flex gap-2">
            {posts.length > 0 && (
              <Link href={`/forum/seller/${user.id}`} className="btn-ghost">Public page</Link>
            )}
            <Link href="/forum" className="btn-primary">Go to Forum →</Link>
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            You have no open listings. Head to the Forum to post a buy/sell listing or start a
            discussion.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-800">
            {posts.map((p) => {
              const price = p.priceCents ?? p.marketCents;
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className={`chip font-bold ${KIND_BADGE[p.kind] ?? "bg-ink-800 text-slate-300"}`}>{p.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{p.title}</span>
                  {price != null && <span className="shrink-0 text-sm font-semibold text-accent">{formatAUD(price)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
