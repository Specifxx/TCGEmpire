import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadGrowth, type Series, type TargetRow } from "@/lib/admin-growth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Growth",
  robots: { index: false, follow: false },
};

// The owner's growth view (2026-10-27). Week against week, never day against
// day: lib/admin-growth.ts says why. Every number is measured, nothing estimated.

function fmt(s: Series, v: number | null): string {
  if (v == null) return "–";
  return s.unit === "money" ? `A$${(v / 100).toFixed(2)}` : Math.round(v).toLocaleString("en-US");
}

function Change({ s }: { s: Series }) {
  if (s.last7 == null || s.prev7 == null) return <span className="text-xs text-slate-500">not enough data yet</span>;
  if (s.prev7 === 0) return <span className="text-xs text-slate-500">new this week</span>;
  const pct = ((s.last7 - s.prev7) / s.prev7) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-sm font-bold ${up ? "text-up" : "text-rose-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% <span className="font-normal text-slate-500">vs the week before</span>
    </span>
  );
}

function Bars({ s }: { s: Series }) {
  const max = Math.max(1, ...s.points.map((p) => p.v ?? 0));
  const w = 100 / s.points.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-24 w-full" role="img" aria-label={`${s.label}, last ${s.points.length} days`}>
      {s.points.map((p, i) => {
        const h = p.v == null ? 0 : (p.v / max) * 38;
        const recent = i >= s.points.length - 8;
        return (
          <rect key={p.d} x={i * w + w * 0.12} y={40 - h} width={w * 0.76} height={Math.max(h, p.v ? 0.6 : 0)} className={recent ? "fill-gold" : "fill-brand-500/60"}>
            <title>{`${p.d}: ${fmt(s, p.v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Card({ s }: { s: Series }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">{s.label}</h2>
        <Change s={s} />
      </div>
      <div className="mt-1 text-2xl font-extrabold text-white">
        {fmt(s, s.last7)} <span className="text-sm font-normal text-slate-500">last 7 days · {fmt(s, s.prev7)} the week before</span>
      </div>
      <Bars s={s} />
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{s.points[0]?.d}</span>
        <span>{s.note}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function Targets({ rows }: { rows: TargetRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <h2 className="font-semibold text-white">This week against the target</h2>
      <p className="mt-1 text-xs text-slate-500">Google clicks, the last 7 settled days against the 7 before. Sister sites +15% a week (doubles in five weeks), RiftCompare holds until the Legacy previews, every site together +5%.</p>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr><th className="py-1 pr-3">Signal</th><th className="py-1 pr-3 text-right">Last 7 days</th><th className="py-1 pr-3 text-right">Week before</th><th className="py-1 pr-3 text-right">Change</th><th className="py-1 pr-3 text-right">Target</th><th className="py-1 text-right">On track</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.last7 != null && r.prev7 ? ((r.last7 - r.prev7) / r.prev7) * 100 : null;
            return (
              <tr key={r.key} className="border-t border-ink-800">
                <td className="py-1 pr-3 text-slate-200">{r.label}</td>
                <td className="py-1 pr-3 text-right text-slate-300">{r.last7?.toLocaleString("en-AU") ?? "–"}</td>
                <td className="py-1 pr-3 text-right text-slate-300">{r.prev7?.toLocaleString("en-AU") ?? "–"}</td>
                <td className="py-1 pr-3 text-right text-slate-300">{pct == null ? "–" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}</td>
                <td className="py-1 pr-3 text-right text-slate-300">{r.pct ? `+${r.pct}%` : "hold"}</td>
                <td className={`py-1 text-right font-bold ${r.met == null ? "text-slate-500" : r.met ? "text-up" : "text-rose-400"}`}>{r.met == null ? "not enough data" : r.met ? "yes" : "no"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function GrowthPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();

  const { series, earningsBySource, targets, gscUpdatedAt, splits, errors } = await loadGrowth();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-400 hover:underline">← Admin</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-white">Growth</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        The last 28 days, a bar a day (gold is the last week). Read the week-on-week change, not one day against the next:
        single days swing with the weekday, a post or a set launch, and affiliate networks keep adding sales for days afterwards.
      </p>
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Targets rows={targets} />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {series.map((s) => (
          <Card key={s.key} s={s} />
        ))}
      </div>
      {earningsBySource.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-bold text-white">Earnings by source</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {earningsBySource.map((s) => (
              <Card key={s.key} s={s} />
            ))}
          </div>
        </>
      )}
      {splits.map(({ site, queries }) => (
        <section key={site} className="mt-10">
          <h2 className="text-lg font-bold text-white">Pages competing in Google · {site}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Searches where two or more of our pages each get a real share, so Google splits between them instead of
            ranking one strongly (last 28 settled days). Each one is a candidate to fold into a single page.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="py-1 pr-3">Search</th><th className="py-1 pr-3">Our page</th><th className="py-1 pr-3 text-right">Impr.</th><th className="py-1 pr-3 text-right">Clicks</th><th className="py-1 text-right">Pos.</th></tr>
              </thead>
              <tbody>
                {queries.map((q) =>
                  q.pages.map((p, i) => (
                    <tr key={`${q.query}|${p.page}`} className={i === 0 ? "border-t border-ink-800" : ""}>
                      <td className="py-1 pr-3 text-slate-200">{i === 0 ? `${q.query} (${q.impr.toLocaleString("en-AU")})` : ""}</td>
                      <td className="py-1 pr-3 text-slate-400">{p.page}</td>
                      <td className="py-1 pr-3 text-right text-slate-300">{p.impr.toLocaleString("en-AU")}</td>
                      <td className="py-1 pr-3 text-right text-slate-300">{p.clicks}</td>
                      <td className="py-1 text-right text-slate-300">{p.pos.toFixed(1)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="mt-8 text-xs text-slate-500">
        Google clicks updated {gscUpdatedAt ? new Date(gscUpdatedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "never"}.
        Earnings detail and tags: <Link href="/admin/earnings" className="text-brand-400 hover:underline">/admin/earnings</Link>.
      </p>
    </div>
  );
}
