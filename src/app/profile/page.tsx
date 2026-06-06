import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatAUD } from "@/lib/format";
import { LogoutButton } from "@/components/ProfileActions";

export const dynamic = "force-dynamic";

const KIND_BADGE: Record<string, string> = {
  WTB: "bg-emerald-500/15 text-emerald-300",
  WTS: "bg-gold/15 text-gold",
  DISCUSSION: "bg-sky-500/15 text-sky-300",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const posts = await prisma.forumPost.findMany({
    where: { userId: user.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  const wts = posts.filter((p) => p.kind === "WTS").length;
  const wtb = posts.filter((p) => p.kind === "WTB").length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-2xl font-black text-white">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">{user.displayName}</h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <LogoutButton />
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
