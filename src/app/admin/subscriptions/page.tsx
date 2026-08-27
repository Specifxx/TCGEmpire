import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripeEnabled } from "@/lib/stripe";
import { fetchAllSubscriptions, computeSubscriptionMetrics, type SubscriptionMetrics } from "@/lib/subscription-metrics";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Subscription metrics",
  robots: { index: false, follow: false },
};

// The revenue/retention read on Premium — MRR, churn, LTV, cohort retention —
// straight from Stripe (the source of truth for plan/amount/history), separate
// from /admin/premium which tracks INTEREST (who clicked a CTA). You can't scale a
// subscription you can't see; this is that view.
export default async function SubscriptionMetricsPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();
  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  const configured = stripeEnabled();
  let metrics: SubscriptionMetrics | null = null;
  let capped = false;
  let dbActive: number | null = null;
  let error = false;

  if (configured) {
    try {
      const [{ rows, capped: cap }, dbCount] = await Promise.all([
        fetchAllSubscriptions(),
        prisma.user.count({ where: { premiumUntil: { gt: new Date() } } }).catch(() => null),
      ]);
      metrics = computeSubscriptionMetrics(rows, Date.now());
      capped = cap;
      dbActive = dbCount;
    } catch (e) {
      console.error("[admin/subscriptions] failed:", e);
      error = true;
    }
  }

  const cur = (metrics?.currency ?? "usd").toUpperCase();
  const money = (cents: number) => formatMoney(cents, cur);
  const pct = (v: number | null, dp = 1) => (v == null ? "—" : `${v.toFixed(dp)}%`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Subscription metrics</span>
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Subscription metrics</h1>
        <Link href={`/admin/premium${keySuffix}`} className="text-xs text-brand-400 hover:underline">
          Premium interest (clicks) →
        </Link>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        MRR, retention and churn for RiftCompare Premium, straight from Stripe. This is the revenue read; the{" "}
        <Link href={`/admin/premium${keySuffix}`} className="text-brand-400 hover:underline">interest page</Link>{" "}
        is the top-of-funnel read.
      </p>

      {!configured ? (
        <Note>Stripe isn&apos;t configured on this environment, so there are no subscriptions to report.</Note>
      ) : error ? (
        <Note>Couldn&apos;t load subscriptions from Stripe right now.</Note>
      ) : !metrics || metrics.total === 0 ? (
        <Note>No subscriptions yet — this fills in as Premium sign-ups land.</Note>
      ) : (
        <>
          {/* Headline money */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="MRR" value={money(metrics.mrrCents)} sub={`${money(metrics.arrCents)} ARR`} accent />
            <Stat label="Active subscribers" value={metrics.active.toLocaleString()} sub={dbActive != null ? `${dbActive.toLocaleString()} entitled in DB` : undefined} />
            <Stat label="Trialing" value={metrics.trialing.toLocaleString()} sub="not yet in MRR" />
            <Stat label="ARPU" value={money(metrics.arpuCents)} sub="per active / mo" />
          </div>

          {/* Retention money */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Monthly churn" value={pct(metrics.churnRatePct)} sub="estimate · last 30d" />
            <Stat label="Est. LTV" value={metrics.ltvCents == null ? "—" : money(metrics.ltvCents)} sub="ARPU ÷ churn" />
            <Stat label="New · 30d" value={metrics.new30.toLocaleString()} sub={`${metrics.new7.toLocaleString()} in 7d`} />
            <Stat label="Churned · 30d" value={metrics.churned30.toLocaleString()} sub={`net ${(metrics.new30 - metrics.churned30 >= 0 ? "+" : "")}${(metrics.new30 - metrics.churned30).toLocaleString()}`} />
          </div>

          {/* Plan mix + trial conversion */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <h2 className="text-sm font-semibold text-white">Plan mix (active)</h2>
              <div className="mt-3 flex items-end gap-4">
                <MixBar label="Monthly" n={metrics.monthlyActive} total={metrics.active} />
                <MixBar label="Annual" n={metrics.annualActive} total={metrics.active} gold />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Annual is {metrics.active > 0 ? Math.round((metrics.annualActive / metrics.active) * 100) : 0}% of active subs.
                Lifting this is the cheapest churn win — see the in-app annual-switch nudge.
              </p>
            </div>
            <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <h2 className="text-sm font-semibold text-white">Trial → paid</h2>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="num text-3xl font-extrabold text-white">{pct(metrics.trialConvPct, 0)}</span>
                <span className="text-xs text-slate-500">
                  {metrics.trialsConverted.toLocaleString()} of {metrics.trialsStarted.toLocaleString()} trials converted
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Trials whose window has ended and are now in a live paying state, over all trials ever started.
              </p>
            </div>
          </div>

          {/* Cohort retention */}
          <h2 className="mt-8 text-sm font-semibold text-white">Retention by signup month</h2>
          <p className="mb-2 text-xs text-slate-500">
            What share of each month&apos;s new subscriptions is still active (or trialing) today — the clearest read on
            whether the bucket holds.
          </p>
          <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Cohort</th>
                  <th className="px-3 py-2 text-right font-medium">Started</th>
                  <th className="px-3 py-2 text-right font-medium">Still active</th>
                  <th className="px-3 py-2 font-medium">Retention</th>
                </tr>
              </thead>
              <tbody>
                {metrics.cohorts.map((c) => (
                  <tr key={c.month} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/50">
                    <td className="px-3 py-2 tabular-nums text-slate-300">{c.month}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{c.started}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{c.active}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-800">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, c.retentionPct)}%` }} />
                        </div>
                        <span className="num text-xs tabular-nums text-slate-400">{c.retentionPct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Multi-currency footnote — only when it matters. */}
          {metrics.byCurrency.length > 1 && (
            <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
              <h2 className="text-sm font-semibold text-white">By currency</h2>
              <p className="mb-2 text-xs text-slate-500">
                Headline figures above are in {cur} (the most common). MRR is never summed across currencies.
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                {metrics.byCurrency.map((b) => (
                  <div key={b.currency} className="flex justify-between">
                    <span>{b.currency.toUpperCase()} · {b.active} active</span>
                    <span className="num tabular-nums">{formatMoney(b.mrrCents, b.currency.toUpperCase())}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-[11px] text-slate-600">
            Churn and LTV are estimates: monthly churn ≈ subs that ended in the last 30d over active-plus-churned, LTV ≈
            ARPU ÷ churn. Direction over precision on a small base.
            {capped && " Subscription list hit the page cap — figures cover the most recent pages only."}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-gold/40 bg-gold/5" : "border-ink-700 bg-ink-850"}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-extrabold ${accent ? "text-gold" : "text-white"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function MixBar({ label, n, total, gold }: { label: string; n: number; total: number; gold?: boolean }) {
  const share = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className="num tabular-nums text-slate-400">{n}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full rounded-full ${gold ? "bg-gold" : "bg-brand-500"}`} style={{ width: `${share}%` }} />
      </div>
      <div className="num mt-0.5 text-[10px] tabular-nums text-slate-500">{share}%</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">{children}</div>
  );
}
