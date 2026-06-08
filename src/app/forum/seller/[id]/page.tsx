import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatAUD } from "@/lib/format";
import { levelFor, rewardByKey } from "@/lib/points-config";

export const dynamic = "force-dynamic";

// User-generated profile — keep out of search.
export const metadata: Metadata = { title: "Seller", robots: { index: false, follow: false } };

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Post = Awaited<ReturnType<typeof getPosts>>[number];
async function getPosts(userId: string) {
  return prisma.forumPost.findMany({
    where: { userId, status: { in: ["OPEN", "SOLD"] } },
    orderBy: { createdAt: "desc" },
  });
}

interface Item { name: string; setCode: string | null; condition: string | null; qty: number; marketCents: number | null }

function PostRow({ p }: { p: Post }) {
  const items = (p.items as Item[] | null) ?? null;
  return (
    <li className="card-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip font-bold ${p.kind === "WTB" ? "bg-emerald-500/15 text-emerald-300" : "bg-gold/15 text-gold"}`}>
          {p.kind === "WTB" ? "WANT TO BUY" : "WANT TO SELL"}
        </span>
        {p.status === "SOLD" && (
          <span className="chip bg-rose-500/15 font-bold text-rose-300 ring-1 ring-rose-500/30">SOLD</span>
        )}
        {p.priceCents != null && <span className="chip bg-ink-800 font-bold text-accent">{formatAUD(p.priceCents)} asking</span>}
        {p.priceCents == null && p.marketCents != null && <span className="chip bg-ink-800 font-bold text-accent">≈ {formatAUD(p.marketCents)} market</span>}
        {(p.state || p.country) && (
          <span className="chip bg-ink-800 text-slate-300">{[p.state, p.country].filter(Boolean).join(", ")}</span>
        )}
        <span className="ml-auto text-xs text-slate-500">{timeAgo(p.createdAt)}</span>
      </div>
      <h3 className="mt-2 font-bold text-white">{p.title}</h3>
      {items && items.length > 0 && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/40 p-2">
          <ul className="divide-y divide-ink-800/70">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 py-1 text-sm">
                <span className="w-7 shrink-0 text-slate-500">{it.qty}×</span>
                <span className="min-w-0 flex-1 truncate text-slate-200">
                  {it.name}
                  {it.condition && it.condition !== "Any" ? <span className="text-xs text-slate-500"> · {it.condition}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{it.marketCents != null ? formatAUD(it.marketCents) : "—"}</span>
              </li>
            ))}
          </ul>
          {p.marketCents != null && (
            <div className="mt-1 flex items-center justify-between border-t border-ink-800 px-1 pt-1 text-xs">
              <span className="text-slate-500">Recommended (market) total</span>
              <span className="font-bold text-accent">{formatAUD(p.marketCents)}</span>
            </div>
          )}
        </div>
      )}
      {p.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>}
    </li>
  );
}

export default async function SellerPage({ params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, displayName: true, createdAt: true, lifetimePoints: true, equippedFlair: true, equippedBadge: true },
  });
  if (!user) notFound();

  const level = levelFor(user.lifetimePoints);
  const flair = user.equippedFlair ? rewardByKey(user.equippedFlair)?.display : null;
  const badgeEmoji = user.equippedBadge ? rewardByKey(user.equippedBadge)?.display : null;

  const posts = await getPosts(user.id);
  const wts = posts.filter((p) => p.kind === "WTS");
  const wtb = posts.filter((p) => p.kind === "WTB");
  const soldCount = posts.filter((p) => p.status === "SOLD").length;
  const contact = posts[0]?.contact ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/forum" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Back to forum
      </Link>

      <div className="card-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold text-white">{user.displayName}</h1>
          {badgeEmoji && <span className="text-xl" title="Badge">{badgeEmoji}</span>}
          <span className="chip font-bold" style={{ background: level.bg, color: level.color }} title={`${level.name} level`}>{level.name}</span>
          {flair && <span className="chip bg-brand-500/15 font-semibold text-brand-300">{flair}</span>}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {wts.length} selling · {wtb.length} buying
          {soldCount > 0 && <> · <span className="text-rose-300">{soldCount} sold</span></>} · member since{" "}
          {user.createdAt.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
        </p>
        {contact && (
          <p className="mt-2 text-sm text-slate-300">
            Contact: <span className="font-medium">{contact}</span>
          </p>
        )}
        {wts.length > 1 && (
          <p className="mt-2 text-xs text-slate-500">
            Buying several? Message {user.displayName} to combine these into one order and save on postage.
          </p>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="card-surface mt-6 grid place-items-center p-12 text-center text-slate-400">
          This seller has no listings right now.
        </div>
      ) : (
        <>
          {wts.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-lg font-bold text-white">Selling ({wts.length})</h2>
              <ul className="space-y-3">{wts.map((p) => <PostRow key={p.id} p={p} />)}</ul>
            </section>
          )}
          {wtb.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-lg font-bold text-white">Looking to buy ({wtb.length})</h2>
              <ul className="space-y-3">{wtb.map((p) => <PostRow key={p.id} p={p} />)}</ul>
            </section>
          )}
        </>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        RiftCompare hosts these community listings but is not a party to any trade. Deal carefully and meet/pay safely.
      </p>
    </div>
  );
}
