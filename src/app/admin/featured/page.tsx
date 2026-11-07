import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FeaturedAdminActions } from "@/components/admin/FeaturedAdminActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Featured listings",
  robots: { index: false, follow: false },
};

// Members' featured listings (lib/featured/): what is live, waiting or refused,
// with a Remove for anything that should not be on /featured.
export default async function AdminFeaturedPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();

  const rows = await prisma.featuredSubmission
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, userId: true, itemId: true, host: true, status: true, reason: true, title: true, seller: true, createdAt: true, checkedAt: true },
    })
    .catch(() => []);
  const emails = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } }).catch(() => [])).map((u) => [u.id, u.email]),
  );
  const date = (d: Date | null) => (d ? d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "never");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold text-white">Featured listings</h1>
      <p className="mt-1 text-sm text-slate-400">Premium members&apos; own eBay listings. Checked with eBay every four hours by the auction sweep; live ones are on /featured.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {rows.length === 0 && <li className="text-sm text-slate-500">None yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-ink-800 text-slate-300">{r.status}</span>
              <a href={`https://www.${r.host}/itm/${r.itemId}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-white hover:underline">
                {r.title ?? r.itemId}
              </a>
              <FeaturedAdminActions id={r.id} adminKey={keyOk ? token! : ""} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {emails.get(r.userId) ?? r.userId} · seller {r.seller ?? "?"} · added {date(r.createdAt)} · checked {date(r.checkedAt)}
              {r.reason ? ` · ${r.reason}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
