// EMPIRE HQ: the health of every site, from what each one publishes or what can
// be probed from outside. PURE: lib/hq/collect.ts fetches, this judges.
// DECISIONS.md, "Empire HQ and the one Monday report" (2026-11-02).
//
// THE STATUS FILE every sister monitor writes (ops-status branch, status.json):
//   { v: 1, site, at: ISO, overall: "ok"|"warn"|"fail", checks: [{ name, status, detail }] }
// Public, like the Actions log it comes from: status and the monitor's own sentences only.
import type { CheckResult, Severity } from "../ops/types";
import { HQ_SITES, actionsUrl, type HqJob, type HqSite } from "./sites";

export interface HqProblem {
  name: string;
  severity: Severity;
  detail: string;
}

export interface SiteHealth {
  key: string;
  severity: Severity;
  /** When the facts were read (the monitor's own time, or the probe's). */
  at: string | null;
  source: "monitor" | "probe" | "self";
  /** Amber and red items, worst first. */
  problems: HqProblem[];
  /** One line for the row: "All 6 checks ok", "monitor silent for 2 days". */
  summary: string;
  /** Where to look. */
  link: string | null;
}

export interface HqSnapshot {
  v: 1;
  at: string;
  sites: SiteHealth[];
}

const RANK: Record<Severity, number> = { unknown: 0, ok: 1, warn: 2, crit: 3 };
const worse = (a: Severity, b: Severity): Severity => (RANK[b] > RANK[a] ? b : a);
const H = 3_600_000;

/** The monitors say ok / warn / fail (/ unknown); HQ speaks the ops monitor's ok / warn / crit. */
export function toSeverity(s: unknown): Severity {
  const v = String(s ?? "").toLowerCase();
  if (v === "ok") return "ok";
  if (v === "warn" || v === "warning") return "warn";
  if (v === "fail" || v === "crit" || v === "critical" || v === "error") return "crit";
  return "unknown";
}

const clip = (s: unknown, n = 240) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export interface ParsedStatus {
  at: string;
  overall: Severity;
  checks: HqProblem[];
}

/** Read a status file defensively: anything malformed is null (shown as "unknown", never a false ok). */
export function parseStatusFile(raw: string | null | undefined): ParsedStatus | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { v?: unknown; at?: unknown; overall?: unknown; checks?: unknown };
    if (j.v !== 1 || typeof j.at !== "string" || Number.isNaN(Date.parse(j.at)) || !Array.isArray(j.checks)) return null;
    const checks: HqProblem[] = (j.checks as { name?: unknown; label?: unknown; status?: unknown; severity?: unknown; detail?: unknown; summary?: unknown }[])
      .slice(0, 60)
      .map((c) => ({ name: clip(c.name ?? c.label, 80), severity: toSeverity(c.status ?? c.severity), detail: clip(c.detail ?? c.summary) }));
    let overall: Severity = "ok";
    for (const c of checks) overall = worse(overall, c.severity);
    if (!checks.length) overall = toSeverity(j.overall);
    return { at: j.at, overall, checks };
  } catch {
    return null;
  }
}

const sortProblems = (ps: HqProblem[]) => ps.filter((p) => p.severity === "warn" || p.severity === "crit").sort((a, b) => RANK[b.severity] - RANK[a.severity]);

/** A monitor that has not reported for this long has stopped (GitHub pauses idle schedules, a workflow breaks…). */
export const monitorStaleH = (everyH: number) => Math.max(24, everyH * 3);

export function healthFromStatus(site: HqSite, raw: string | null, now: Date): SiteHealth {
  const link = site.monitor ? actionsUrl(site, site.monitor.workflow) : null;
  const p = parseStatusFile(raw);
  if (!p) {
    return { key: site.key, severity: "unknown", at: null, source: "monitor", problems: [], summary: "No status published yet (it appears after the monitor's next run).", link };
  }
  const ageH = (now.getTime() - Date.parse(p.at)) / H;
  const problems = sortProblems(p.checks);
  if (site.monitor && ageH > monitorStaleH(site.monitor.everyH)) {
    problems.unshift({ name: "Monitor", severity: "crit", detail: `The site's monitor has not reported for ${Math.round(ageH / 24) >= 2 ? `${Math.round(ageH / 24)} days` : `${Math.round(ageH)} hours`}.` });
    return { key: site.key, severity: "crit", at: p.at, source: "monitor", problems, summary: "Its monitor has stopped reporting.", link };
  }
  const n = p.checks.filter((c) => c.severity !== "unknown").length;
  const summary = problems.length ? `${problems.length} of ${n} checks flagged` : `All ${n} checks ok`;
  return { key: site.key, severity: p.overall, at: p.at, source: "monitor", problems, summary, link };
}

export interface RunLite {
  conclusion: string | null;
  createdAt: string;
}

/** A workflow's health from its newest completed runs (newest first). */
export function judgeJob(job: HqJob, runs: readonly RunLite[] | null, now: Date): HqProblem {
  if (!runs) return { name: job.label, severity: "unknown", detail: "Could not read its runs." };
  if (!runs.length) return { name: job.label, severity: "unknown", detail: "No completed run yet." };
  const ageH = (now.getTime() - Date.parse(runs[0].createdAt)) / H;
  const failed = (r?: RunLite) => !!r && r.conclusion !== "success" && r.conclusion !== "skipped" && r.conclusion !== "neutral";
  if (failed(runs[0]) && failed(runs[1])) return { name: job.label, severity: "crit", detail: "Failed twice in a row." };
  if (ageH > job.maxAgeH * 2) return { name: job.label, severity: "crit", detail: `Has not run for ${Math.round(ageH)} hours.` };
  if (failed(runs[0])) return { name: job.label, severity: "warn", detail: "The latest run failed." };
  if (ageH > job.maxAgeH) return { name: job.label, severity: "warn", detail: `Latest run ${Math.round(ageH)} hours ago.` };
  return { name: job.label, severity: "ok", detail: `Ran ${Math.max(1, Math.round(ageH))}h ago.` };
}

/** HTTP status of the home page (null = could not connect). */
export function judgeLive(status: number | null | undefined): HqProblem {
  if (status === undefined) return { name: "Live site", severity: "unknown", detail: "Not probed." };
  if (status === null || status === 0) return { name: "Live site", severity: "crit", detail: "The home page did not answer." };
  if (status >= 200 && status < 400) return { name: "Live site", severity: "ok", detail: `HTTP ${status}` };
  return { name: "Live site", severity: status >= 500 || status === 404 ? "crit" : "warn", detail: `HTTP ${status}` };
}

export function healthFromProbe(site: HqSite, live: number | null | undefined, runs: Record<string, RunLite[] | null>, now: Date): SiteHealth {
  const checks = [judgeLive(live), ...(site.jobs ?? []).map((j) => judgeJob(j, runs[j.file] ?? null, now))];
  let severity: Severity = "unknown";
  for (const c of checks) severity = worse(severity, c.severity);
  const problems = sortProblems(checks);
  const known = checks.filter((c) => c.severity !== "unknown").length;
  return {
    key: site.key,
    severity,
    at: now.toISOString(),
    source: "probe",
    problems,
    summary: problems.length ? `${problems.length} of ${known} checks flagged (no monitor of its own)` : `Live site and ${known - 1} job${known - 1 === 1 ? "" : "s"} ok (no monitor of its own)`,
    link: site.jobs?.[0] ? actionsUrl(site, site.jobs[0].file) : site.url,
  };
}

/** RiftCompare's row, from its own monitor's report. */
export function healthFromReport(report: { generatedAt: string; results: readonly CheckResult[] } | null, now: Date, staleH: number): SiteHealth {
  if (!report) return { key: "rc", severity: "unknown", at: null, source: "self", problems: [], summary: "No report yet.", link: "/admin/health" };
  // Its "sites" checks are the sisters' (hqChecks), shown on their own rows.
  report = { ...report, results: report.results.filter((r) => r.area !== "sites") };
  const problems = sortProblems(report.results.map((r) => ({ name: r.title, severity: r.severity, detail: r.summary })));
  const ageH = (now.getTime() - Date.parse(report.generatedAt)) / H;
  if (ageH > staleH) return { key: "rc", severity: "crit", at: report.generatedAt, source: "self", problems, summary: `The monitor has not reported for ${Math.round(ageH)} hours.`, link: "/admin/health" };
  let severity: Severity = "ok";
  for (const r of report.results) severity = worse(severity, r.severity);
  const n = report.results.filter((r) => r.severity !== "unknown").length;
  return { key: "rc", severity, at: report.generatedAt, source: "self", problems, summary: problems.length ? `${problems.length} of ${n} checks flagged` : `All ${n} checks ok`, link: "/admin/health" };
}

/**
 * What RiftCompare's monitor adds to its own checks, so RED reaches the owner for
 * the sites that cannot mail themselves: a sister whose monitor went silent, and a
 * site without a monitor whose home page or import job is down. A sister with a
 * working monitor mails its own red (a failed run), so only its silence is here.
 * Amber never mails (state.ts): it waits for HQ and the Monday report.
 */
export function hqChecks(sites: readonly SiteHealth[], now: Date): CheckResult[] {
  const out: CheckResult[] = [];
  const at = now.toISOString();
  for (const h of sites) {
    const site = HQ_SITES.find((s) => s.key === h.key);
    if (!site || site.rift) continue;
    if (h.source === "monitor") {
      const silent = h.problems.find((p) => p.name === "Monitor" && p.severity === "crit");
      out.push({
        id: `hq:${site.key}:monitor`,
        area: "sites",
        title: `${site.label}: its monitor`,
        severity: silent ? "crit" : h.at ? "ok" : "unknown",
        summary: silent ? silent.detail : h.at ? "Reporting." : h.summary,
        ...(silent ? { action: `Open ${h.link} and press "Run workflow". If GitHub paused the schedule (60 days without a commit), re-enable it there.` } : {}),
        checkedAt: at,
      });
      continue;
    }
    const red = h.problems.filter((p) => p.severity === "crit");
    out.push({
      id: `hq:${site.key}:probe`,
      area: "sites",
      title: `${site.label}: site and jobs`,
      severity: red.length ? "crit" : h.severity === "unknown" ? "unknown" : "ok",
      summary: red.length ? red.map((p) => `${p.name}: ${p.detail}`).join(" ") : h.summary,
      ...(red.length ? { action: `Look at ${h.link}. Paste this to Claude: "${site.label} is down or its import stopped; find out why and fix it."` } : {}),
      checkedAt: at,
    });
  }
  return out;
}

/** Parse the stored snapshot defensively. */
export function parseHqSnapshot(j: unknown): HqSnapshot | null {
  const s = j as HqSnapshot | null | undefined;
  if (!s || s.v !== 1 || !Array.isArray(s.sites)) return null;
  return s;
}
