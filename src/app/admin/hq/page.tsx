import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { humanAge } from "@/lib/ops/thresholds";
import type { Severity } from "@/lib/ops/types";
import { loadHq } from "@/lib/hq/load";
import type { Week } from "@/lib/hq/view";
import { pctChange } from "@/lib/hq/view";
import { GROWTH_TARGETS } from "@/lib/admin-growth";
import { StepDone } from "./StepDone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Empire HQ",
  robots: { index: false, follow: false },
};

// EMPIRE HQ (owner, 2026-11-02, the control tower): every site on one page, a row
// each: Google clicks against the week's target, earnings by affiliate tag, health
// from each site's own monitor, and the owner's queued steps. The same rows are the
// Monday report (lib/hq/weekly-email.ts). DECISIONS.md, "Empire HQ and the one
// Monday report". Admin only, uncached.

const DOT: Record<Severity, string> = { ok: "bg-brand-400", warn: "bg-gold", crit: "bg-rose-500", unknown: "bg-slate-600" };
const WORD: Record<Severity, string> = { ok: "OK", warn: "Heads up", crit: "Needs action", unknown: "Not checked" };
const money = (c: number | null) => (c == null ? "–" : formatMoney(c, "AUD"));
const n = (v: number | null) => (v == null ? "–" : v.toLocaleString("en-AU"));

function Change({ w }: { w: Week }) {
  const p = pctChange(w);
  if (p == null) return <span className="text-slate-500">{w.prev7 === 0 && w.last7 ? "new" : ""}</span>;
  return <span className={p >= 0 ? "text-up" : "text-rose-400"}>{p > 0 ? "+" : ""}{p}%</span>;
}

function Target({ label, w, target }: { label: string; w: Week; target: number }) {
  const met = w.last7 == null || w.prev7 == null ? null : w.last7 >= w.prev7 * (1 + target / 100);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label} · target {target ? `+${target}%` : "hold"}</div>
      <div className="mt-1 text-xl font-extrabold text-white">
        {n(w.last7)} <span className="text-sm font-normal text-slate-400">vs {n(w.prev7)}</span> <span className="text-sm"><Change w={w} /></span>
      </div>
      <div className={`text-xs font-bold ${met == null ? "text-slate-500" : met ? "text-up" : "text-rose-400"}`}>{met == null ? "not enough data yet" : met ? "on target" : "below target"}</div>
    </div>
  );
}

export default async function HqPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();

  const hq = await loadHq();
  const now = Date.now();
  const open = hq.steps.filter((s) => !s.doneAt);
  const done = hq.steps.filter((s) => s.doneAt);
  const label = (key: string) => (key === "all" ? "Every site" : hq.rows.find((r) => r.site.key === key)?.site.label ?? key);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-400 hover:underline">← Admin</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-white">Empire HQ</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        Every site on one page. Red problems are emailed the moment they happen; everything else waits for the one Monday report, which is this page.
        Google clicks are the last 7 settled days{hq.gscEnd ? ` (to ${hq.gscEnd})` : ""}; earnings are the last 7 full days ({hq.earningsDays[0]} to {hq.earningsDays[1]}), AUD incl. pending.
        {hq.collectedAt ? ` Sister health read ${humanAge((now - Date.parse(hq.collectedAt)) / 3_600_000)} ago.` : ""}
      </p>
      {hq.errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-300">
          {hq.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Target label="Sister sites" w={hq.totals.sisters} target={GROWTH_TARGETS.sisters.pct} />
        <Target label="RiftCompare" w={hq.totals.rift} target={GROWTH_TARGETS.rift.pct} />
        <Target label="Every site" w={hq.totals.all} target={GROWTH_TARGETS.family.pct} />
      </div>

      <section id="steps" className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-4">
        <h2 className="font-semibold text-white">Needs you {open.length ? `(${open.length})` : ""}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Steps only you can do. They are joined into one Chrome batch each Monday (project files › chrome-queue); press Done when finished.
        </p>
        {open.length === 0 && <p className="mt-3 text-sm text-slate-300">Nothing waiting.</p>}
        <ul className="mt-3 space-y-2">
          {open.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-800 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">{s.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">{label(s.site)} · waiting since {s.added || "–"}{s.why ? ` · ${s.why}` : ""}</div>
                {s.prompt && <div className="mt-0.5 break-all text-[11px] text-slate-500">Prompt: project files › {s.prompt}</div>}
              </div>
              <StepDone id={s.id} done={false} />
            </li>
          ))}
        </ul>
        {done.length > 0 && (
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer">Recently done ({done.length})</summary>
            <ul className="mt-2 space-y-1">
              {done.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span>✓ {s.title} · {s.doneAt}</span>
                  <StepDone id={s.id} done />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="mt-6 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850 p-4">
        <h2 className="font-semibold text-white">Every site</h2>
        <table className="mt-3 w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-3">Site</th>
              <th className="py-1 pr-3 text-right">Google clicks</th>
              <th className="py-1 pr-3 text-right">Target</th>
              <th className="py-1 pr-3 text-right">Earned 7d</th>
              <th className="py-1 pr-3 text-right">Week before</th>
              {hq.costsConnected && <th className="py-1 pr-3 text-right">Vercel 7d</th>}
              <th className="py-1">Health</th>
            </tr>
          </thead>
          <tbody>
            {hq.rows.map((r) => (
              <tr key={r.site.key} className="border-t border-ink-800 align-top">
                <td className="py-2 pr-3">
                  <a href={r.site.url} className="font-semibold text-slate-100 hover:underline" rel="noreferrer">{r.site.label}</a>
                  {r.openSteps > 0 && <div className="text-[11px] text-gold">{r.openSteps} step{r.openSteps === 1 ? "" : "s"} for you</div>}
                </td>
                <td className="py-2 pr-3 text-right text-slate-300">
                  {n(r.clicks.last7)} <span className="text-xs text-slate-500">vs {n(r.clicks.prev7)}</span> <span className="text-xs"><Change w={r.clicks} /></span>
                </td>
                <td className={`py-2 pr-3 text-right text-xs font-bold ${r.met == null ? "text-slate-500" : r.met ? "text-up" : "text-rose-400"}`}>
                  {r.targetPct ? `+${r.targetPct}%` : "hold"} {r.met == null ? "" : r.met ? "✓" : "✗"}
                </td>
                <td className="py-2 pr-3 text-right text-slate-200">{money(r.earned.last7)}</td>
                <td className="py-2 pr-3 text-right text-slate-400">{money(r.earned.prev7)}</td>
                {hq.costsConnected && <td className="py-2 pr-3 text-right text-slate-400">{money(r.cost7)}</td>}
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.health.severity]}`} />
                    <span className="text-xs font-semibold text-slate-200">{WORD[r.health.severity]}</span>
                    {r.health.link && (
                      <a href={r.health.link} className="text-[11px] text-brand-400 hover:underline" rel="noreferrer">open</a>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{r.health.summary}</div>
                  {r.health.problems.slice(0, 4).map((p) => (
                    <div key={p.name + p.detail} className="mt-0.5 text-[11px] text-slate-500">
                      <span className={p.severity === "crit" ? "text-rose-400" : "text-gold"}>●</span> {p.name}: {p.detail}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">
          Earnings: eBay and TCGplayer by each link&apos;s tag; Stripe and ads count to RiftCompare; untagged sales (mostly the eBay app) are on /admin/earnings.
          {hq.costsConnected ? "" : " Vercel cost per site appears once the billing token is set (a step above)."} Health: each site&apos;s own monitor, or for a site without one, its home page and import jobs.
        </p>
      </section>
    </div>
  );
}
