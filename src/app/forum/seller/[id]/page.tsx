import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatAUD } from "@/lib/format";

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
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
}

function PostRow({ p }: { p: Post }) {
  return (
    <li className="card-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip font-bold ${p.kind === "WTB" ? "bg-emerald-500/15 text-emerald-300" : "bg-gold/15 text-gold"}`}>
          {p.kind === "WTB" ? "WANT TO BUY" : "WANT TO SELL"}
        </span>
        {p.setCode && <span className="chip bg-ink-800 text-slate-300">{p.setCode}</span>}
        {p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>}
        {p.priceCents != null && <span className="chip bg-ink-800 font-bold text-accent">{formatAUD(p.priceCents)}</span>}
        <span className="ml-auto text-xs text-slate-500">{timeAgo(p.createdAt)}</span>
      </div>
      <h3 className="mt-2 font-bold text-white">{p.title}</h3>
      {p.cardName && <p className="text-xs text-brand-400">{p.cardName}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>
    </li>
  );
}

export default async function SellerPage({ params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, displayName: true, createdAt: true },
  });
  if (!user) notFound();

  const posts = await getPosts(user.id);
  const wts = posts.filter((p) => p.kind === "WTS");
  const wtb = posts.filter((p) => p.kind === "WTB");
  const contact = posts[0]?.contact ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/forum" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Back to forum
      </Link>

      <div className="card-surface p-5">
        <h1 className="text-2xl font-extrabold text-white">{user.displayName}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {wts.length} selling · {wtb.length} buying · member since{" "}
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
          This seller has no open listings right now.
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
        RiftCompareAU hosts these community listings but is not a party to any trade. Deal carefully and meet/pay safely.
      </p>
    </div>
  );
}
