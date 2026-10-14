import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLatestReport, SNAPSHOT_STALE_HOURS } from "@/lib/ops/snapshot";
import { getInboxCounts } from "@/lib/ops/inbox-counts";
import { AREA_LABEL, AREA_ORDER, SEVERITY_RANK, countBy, emptyInbox, worst, type CheckResult, type Severity } from "@/lib/ops/types";
import { gb, humanAge } from "@/lib/ops/thresholds";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Health & limits",
  robots: { index: false, follow: false },
};

const DOT: Record<Severity, string> = { ok: "bg-brand-400", warn: "bg-gold", crit: "bg-rose-500", unknown: "bg-slate-600" };
const BAR: Record<Severity, string> = { ok: "bg-brand-500", warn: "bg-gold", crit: "bg-rose-500", unknown: "bg-slate-600" };
const LABEL: Record<Severity, string> = { ok: "OK", warn: "Heads up", crit: "Needs action", unknown: "Not checked" };
const ACTIONS_URL = "https://github.com/Specifxx/TCGEmpire/actions/workflows/ops-monitor.yml";

function Bar({ r }: { r: CheckResult }) {
  if (!r.metric) return null;
  const pct = Math.min(100, Math.round((r.metric.value / r.metric.limit) * 100));
  const label = r.metric.unit === "bytes" ? `${gb(r.metric.value)} / ${gb(r.metric.limit)}` : `${r.metric.value.toLocaleString("en-US")} / ${r.metric.limit.toLocaleString("en-US")} ${r.metric.unit}`;
  return (
    <div className="mt-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full rounded-full ${BAR[r.severity]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{label} · {pct}%</div>
    </div>
  );
}

export default async function AdminHealthPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists
  const keySuffix = keyOk && !user?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  const [report, liveInbox] = await Promise.all([getLatestReport(), getInboxCounts().catch(() => emptyInbox())]);
  const now = Date.now();
  const ageH = report ? (now - Date.parse(report.generatedAt)) / 3_600_000 : null;
  const stale = ageH == null || ageH > SNAPSHOT_STALE_HOURS;
  const counts = report ? countBy(report.results) : null;
  const overall: Severity = report ? worst(report.results) : "unknown";
  const dateFmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

  const banner =
    !report
      ? { tone: "border-slate-600 bg-ink-850 text-slate-300", text: "No report yet. The monitor runs every three hours; the first report appears after its first run." }
      : stale
        ? { tone: "border-rose-500/50 bg-rose-500/10 text-rose-200", text: `The monitor has not reported for ${humanAge(ageH!)}. Checks may have stopped; open the workflow below and press Run.` }
        : overall === "crit"
          ? { tone: "border-rose-500/50 bg-rose-500/10 text-rose-200", text: `${counts!.crit} thing${counts!.crit === 1 ? "" : "s"} need${counts!.crit === 1 ? "s" : ""} action.` }
          : overall === "warn"
            ? { tone: "border-gold/50 bg-gold/10 text-gold", text: `${counts!.warn} thing${counts!.warn === 1 ? "" : "s"} to keep an eye on. Nothing is broken.` }
            : { tone: "border-brand-500/40 bg-brand-500/10 text-brand-300", text: "Everything is healthy." };

  const unknowns = report?.results.filter((r) => r.severity === "unknown") ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Health &amp; limits</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Health &amp; limits</h1>
      <p className="mt-1 text-sm text-slate-400">
        Checked every three hours from GitHub, independent of this site and its database. You are emailed only when something needs a look, plus a short all-clear every Monday.
      </p>

      <div className={`mt-5 rounded-xl border p-4 text-sm font-semibold ${banner.tone}`}>
        {banner.text}
        {report && (
          <div className="mt-1 text-xs font-normal opacity-80">
            Last checked {dateFmt.format(new Date(report.generatedAt))} ({humanAge(ageH!)} ago) ·{" "}
            <a href={ACTIONS_URL} className="underline" target="_blank" rel="noreferrer">run it now</a>
          </div>
        )}
      </div>

      <Link href={`/admin/messages${keySuffix}`} className="card-surface mt-4 flex items-center gap-3 p-4 transition-all hover:border-brand-500/60">
        <span className="text-lg" aria-hidden>✉️</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white">Inbox</div>
          <div className="text-xs text-slate-400">
            {liveInbox.total
              ? [liveInbox.contact && `${liveInbox.contact} contact`, liveInbox.feedback && `${liveInbox.feedback} feedback`, liveInbox.priceReports && `${liveInbox.priceReports} wrong-price`, liveInbox.storeSuggestions && `${liveInbox.storeSuggestions} store suggestions`, liveInbox.support && `${liveInbox.support} support`].filter(Boolean).join(" · ")
              : "Nothing waiting."}
          </div>
        </div>
        {liveInbox.total > 0 && <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white">{liveInbox.total} new</span>}
      </Link>

      {report &&
        AREA_ORDER.map((area) => {
          const rows = report.results.filter((r) => r.area === area).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
          if (!rows.length) return null;
          return (
            <section key={area} className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{AREA_LABEL[area]}</h2>
              <div className="mt-2 space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="card-surface p-3.5">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.severity]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="font-semibold text-white">{r.title}</span>
                          {r.severity !== "ok" && <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{LABEL[r.severity]}</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-slate-300">{r.summary}</p>
                        <Bar r={r} />
                        {r.action && (r.severity === "warn" || r.severity === "crit") && (
                          <p className="mt-2 rounded-lg bg-ink-900 p-2.5 text-xs leading-relaxed text-slate-200">
                            <strong className="text-brand-400">What to do:</strong> {r.action}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      {unknowns.length > 0 && (
        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          {unknowns.length} check{unknowns.length === 1 ? " is" : "s are"} not running (greyed above). Usually a key is missing from GitHub secrets; <code>docs/ops-monitor.md</code> lists each one. A check that cannot run never raises a false alarm.
        </p>
      )}
    </div>
  );
}
