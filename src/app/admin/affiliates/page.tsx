import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { AFFILIATE_COMMISSION_PERCENT, AFFILIATE_PERCENT_OFF } from "@/lib/creator-affiliate-code";
import { AddAffiliateForm, AffiliateRowActions, ApplicationActions } from "@/components/admin/AffiliateActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creator codes",
  robots: { index: false, follow: false },
};

// /admin/affiliates (2026-10-16): the creator code programme. Applications from
// /creators/apply, each creator's code with its sign-ups, what their subscribers
// have paid, and the commission owed (one AffiliateCommission row per paid
// invoice, written by the Stripe webhook). Commission is paid by hand; "Mark
// paid" records that. lib/creator-affiliate.ts explains the flow.
export default async function AdminAffiliatesPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();
  const adminKey = keyOk ? token! : "";
  const keySuffix = keyOk && !user?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  const [pending, affiliates, sums, recent] = await Promise.all([
    prisma.affiliateApplication.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.affiliate.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, email: true, code: true, active: true, stripePromotionCodeId: true, createdAt: true, _count: { select: { referrals: true } } },
    }),
    prisma.affiliateCommission.groupBy({
      by: ["affiliateId", "paidOut", "currency"],
      _sum: { commissionCents: true, amountPaidCents: true },
      _count: { _all: true },
      orderBy: { affiliateId: "asc" },
    }),
    prisma.affiliateCommission.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, amountPaidCents: true, commissionCents: true, currency: true, paidOut: true, stripeInvoiceId: true, affiliate: { select: { code: true } } },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" });
  const money = (cents: number, currency: string) => formatMoney(cents, currency.toUpperCase());
  const byAffiliate = new Map<string, { owed: Map<string, number>; paid: Map<string, number>; revenue: Map<string, number>; payments: number }>();
  for (const s of sums) {
    const e = byAffiliate.get(s.affiliateId) ?? { owed: new Map(), paid: new Map(), revenue: new Map(), payments: 0 };
    const target = s.paidOut ? e.paid : e.owed;
    target.set(s.currency, (target.get(s.currency) ?? 0) + (s._sum.commissionCents ?? 0));
    e.revenue.set(s.currency, (e.revenue.get(s.currency) ?? 0) + (s._sum.amountPaidCents ?? 0));
    e.payments += s._count._all;
    byAffiliate.set(s.affiliateId, e);
  }
  const fmtMap = (m: Map<string, number> | undefined) =>
    m && [...m.values()].some((v) => v > 0) ? [...m.entries()].filter(([, v]) => v > 0).map(([c, v]) => money(v, c)).join(" + ") : null;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm">
        <Link href={`/admin${keySuffix}`} className="text-brand-400 hover:underline">← Admin</Link>
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-white">Creator codes</h1>
      <p className="mt-1 text-sm text-slate-400">
        Subscribers get {AFFILIATE_PERCENT_OFF}% off; creators earn {AFFILIATE_COMMISSION_PERCENT}% of every payment made with their code. The public page is{" "}
        <Link href="/creators/apply" className="text-brand-400 hover:underline">/creators/apply</Link>.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-extrabold text-white">Applications waiting ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">None right now.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((a) => (
              <div key={a.id} className="card-surface rounded-xl border border-ink-700 p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-white">
                    {a.name} <span className="font-normal text-slate-400">· {a.platform}{a.audience ? ` · ${a.audience}` : ""}</span>
                  </p>
                  <span className="text-xs text-slate-500">{dateFmt.format(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-slate-300">
                  <a href={`mailto:${a.email}`} className="text-brand-400 hover:underline">{a.email}</a> ·{" "}
                  <a href={a.channelUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-400 hover:underline">{a.channelUrl}</a>
                </p>
                {a.message && <p className="mt-2 whitespace-pre-wrap text-slate-400">{a.message}</p>}
                <ApplicationActions id={a.id} suggested={a.preferredCode ?? a.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)} adminKey={adminKey} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-extrabold text-white">Creators ({affiliates.length})</h2>
        <div className="mt-3">
          <AddAffiliateForm adminKey={adminKey} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Creator</th>
                <th className="py-2 pr-3">Code &amp; link</th>
                <th className="py-2 pr-3 text-right">Sign-ups</th>
                <th className="py-2 pr-3 text-right">Payments</th>
                <th className="py-2 pr-3 text-right">Owed</th>
                <th className="py-2 pr-3 text-right">Paid out</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a) => {
                const t = byAffiliate.get(a.id);
                const owed = fmtMap(t?.owed);
                return (
                  <tr key={a.id} className="border-b border-ink-800 align-top">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-white">{a.name}</p>
                      <a href={`mailto:${a.email}`} className="text-xs text-slate-400 hover:underline">{a.email}</a>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className={`font-mono font-bold ${a.active ? "text-gold" : "text-slate-500 line-through"}`}>{a.code}</p>
                      <p className="text-xs text-slate-500">{SITE_URL.replace(/^https?:\/\//, "")}/r/{a.code}</p>
                      {!a.stripePromotionCodeId && <p className="text-xs text-gold">Not on Stripe&apos;s checkout page yet</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-slate-200">{a._count.referrals}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-200">{t?.payments ?? 0}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-white">{owed ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-400">{fmtMap(t?.paid) ?? "—"}</td>
                    <td className="py-2.5">
                      <AffiliateRowActions id={a.id} active={a.active} synced={!!a.stripePromotionCodeId} owedLabel={owed} adminKey={adminKey} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-extrabold text-white">Latest payments with a creator code</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3 text-right">Subscriber paid</th>
                  <th className="py-2 pr-3 text-right">Commission</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} className="border-b border-ink-800">
                    <td className="py-2 pr-3 text-slate-400">{dateFmt.format(c.createdAt)}</td>
                    <td className="py-2 pr-3 font-mono text-gold">{c.affiliate.code}</td>
                    <td className="py-2 pr-3 text-right text-slate-200">{money(c.amountPaidCents, c.currency)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-white">{money(c.commissionCents, c.currency)}</td>
                    <td className="py-2 text-xs text-slate-400">{c.paidOut ? "Paid out" : "Owed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
