import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadAnalytics } from "@/lib/analytics/vercel";
import { AnalyticsChart } from "@/components/admin/AnalyticsChart";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

// Every site's visits and buy clicks on one chart (2026-11-01, owner). Data from
// Vercel's public Web Analytics API: lib/analytics/vercel.ts says how.

export default async function AnalyticsPage({ searchParams }: { searchParams: { key?: string; fresh?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();
  const suffix = keyOk && !me?.isAdmin ? `key=${encodeURIComponent(token!)}` : "";

  const data = await loadAnalytics(searchParams.fresh === "1");
  const off = data.projects.filter((p) => p.status !== "ok");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href={`/admin${suffix ? `?${suffix}` : ""}`} className="text-xs text-brand-400 hover:underline">
            ← Admin
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Visitors, page views and buy clicks for every site, from Vercel Web Analytics.</p>
        </div>
        {data.status === "ok" && (
          <Link href={`/admin/analytics?fresh=1${suffix ? `&${suffix}` : ""}`} className="text-xs text-slate-500 hover:text-white">
            Read {new Date(data.fetchedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })} · Refresh
          </Link>
        )}
      </div>

      {data.status === "not-configured" && (
        <div className="mt-6 rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm text-slate-300">
          <p className="font-semibold text-gold">Not connected yet</p>
          <p className="mt-1">{data.detail}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
            <li>
              Vercel → Account Settings → Tokens → Create Token, scoped to the team that holds every site, named{" "}
              <code className="text-slate-300">riftcompare-analytics-read</code>.
            </li>
            <li>
              Project <code className="text-slate-300">riftcompare</code> → Settings → Environment Variables → add{" "}
              <code className="text-slate-300">VERCEL_ANALYTICS_TOKEN</code> (Production, Sensitive). Add{" "}
              <code className="text-slate-300">VERCEL_TEAM_ID</code> too if it is not there yet (Team → Settings → General).
            </li>
            <li>The page connects at the next production build (the daily release).</li>
          </ol>
        </div>
      )}

      {data.status === "error" && (
        <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-200">
          <p className="font-semibold">Vercel did not answer</p>
          <p className="mt-1 text-rose-200/80">{data.detail}</p>
        </div>
      )}

      {data.sites.length > 0 && (
        <div className="mt-6">
          <AnalyticsChart sites={data.sites} today={data.today} />
        </div>
      )}

      {data.status === "ok" && data.sites.length === 0 && <p className="mt-6 text-sm text-slate-400">Connected, but no project in the team has Web Analytics data yet.</p>}

      {data.projects.length > 0 && (
        <details className="mt-6 text-xs text-slate-500">
          <summary className="cursor-pointer">
            {data.projects.length} Vercel projects read{off.length ? `, ${off.length} without data` : ""}
          </summary>
          <ul className="mt-2 space-y-0.5">
            {data.projects.map((p) => (
              <li key={p.project}>
                <code className="text-slate-400">{p.project}</code>
                {" → "}
                {p.site.startsWith("project:") ? "its own line" : p.site}
                {p.status !== "ok" && <span className={p.status === "error" ? "text-rose-400" : ""}> · {p.detail}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
