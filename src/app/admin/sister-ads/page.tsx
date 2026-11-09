import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sisterSite } from "@/lib/sister-alerts/sites";
import { SisterAdActions } from "@/components/admin/SisterAdActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Paid featured listings", robots: { index: false, follow: false } };

// The sister sites' paid featured listings (lib/sister-ads/): waiting ones first,
// oldest first (a card hold lasts 7 days), each with the photo and the link as
// the seller typed them. Open the link and check it before approving: nothing
// illegal, no scams, no adult or counterfeit goods, no malware.
export default async function AdminSisterAdsPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();

  const rows = await prisma.sisterAd
    .findMany({ where: { status: { not: "awaiting_payment" } }, orderBy: { createdAt: "desc" }, take: 100 })
    .catch(() => []);
  const order = (s: string) => (s === "pending" ? 0 : s === "approved" ? 1 : 2);
  rows.sort((a, b) => order(a.status) - order(b.status) || (a.status === "pending" ? a.createdAt.getTime() - b.createdAt.getTime() : 0));
  const date = (d: Date | null) => (d ? d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "-");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold text-white">Paid featured listings</h1>
      <p className="mt-1 text-sm text-slate-400">
        US$100 a week. The card is only held until you press Approve and charge (then the dates start); Reject releases it. Open each link first: nothing illegal, no
        scams, counterfeits, adult goods or malware.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && <li className="text-sm text-slate-500">None yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="h-24 w-24 shrink-0 rounded bg-white object-contain" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip bg-ink-800 text-slate-300">{r.status}</span>
                  <span className="text-xs text-slate-400">{sisterSite(r.site)?.name ?? r.site} · {r.region} · {r.weeks} wk · US${r.amountCents / 100}</span>
                </div>
                <p className="mt-1 font-semibold text-white">{r.title}</p>
                {r.blurb && <p className="text-slate-300">{r.blurb}</p>}
                <p className="truncate text-xs">
                  <a href={r.destUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-400 hover:underline">{r.destUrl}</a>
                  {r.priceText ? ` · shows "${r.priceText}"` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {r.email} · paid {date(r.paidAt)} · live {date(r.startsAt)} to {date(r.endsAt)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
                <div className="mt-2">
                  <SisterAdActions id={r.id} status={r.status} adminKey={keyOk ? token! : ""} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
