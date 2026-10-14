// What the monitor remembers between runs, and the rules for when it emails.
// PURE: scripts/ops-monitor.ts loads and saves the JSON (GitHub Actions cache, so it
// does not depend on the database it is watching) and sends the mail.
//
// THE RULE THAT MATTERS: an email is planned from what the owner has been TOLD, not from
// what changed since the last run. A check that is critical but has never been emailed
// about is a new problem, whether it turned critical a minute ago or three runs ago. So a
// run whose mail failed to send plans the same mail again next time, instead of the
// problem going unmentioned forever.
import type { CheckResult, Severity } from "./types";
import { SEVERITY_RANK } from "./types";
import type { TransferSample } from "./thresholds";

type Verdict = "ok" | "warn" | "crit";
type Told = "warn" | "crit" | null;

export interface CheckState {
  sev: Verdict;
  /** ISO time the check last changed verdict. */
  since: string;
  /** The worst verdict the owner has been emailed about for the current problem. */
  emailedSev: Told;
  lastEmailedAt: string | null;
}

export interface OpsState {
  v: 1;
  checks: Record<string, CheckState>;
  /** Neon endpoint id ("ep-young-surf-ayw7zkrh") → project id, so the project list is walked once. */
  neonProjects: Record<string, string>;
  samples: Record<string, TransferSample[]>;
  lastDigestAt: string | null;
}

export const emptyState = (): OpsState => ({ v: 1, checks: {}, neonProjects: {}, samples: {}, lastDigestAt: null });

/** Parse a saved state defensively: a corrupt or older file starts clean rather than crashing the monitor. */
export function parseState(raw: string | null | undefined): OpsState {
  if (!raw) return emptyState();
  try {
    const j = JSON.parse(raw);
    if (!j || j.v !== 1 || typeof j.checks !== "object") return emptyState();
    return {
      v: 1,
      checks: j.checks ?? {},
      neonProjects: j.neonProjects ?? {},
      samples: j.samples ?? {},
      lastDigestAt: typeof j.lastDigestAt === "string" ? j.lastDigestAt : null,
    };
  } catch {
    return emptyState();
  }
}

export interface AlertPlan {
  /** First mention of a problem. */
  problems: CheckResult[];
  /** Already mentioned at a lower level; now worse. */
  escalations: CheckResult[];
  /** Still open after long enough to say so again. */
  reminders: CheckResult[];
  /** Mentioned before, healthy now. */
  recoveries: { id: string; title: string; since: string }[];
}

export const REMIND_CRIT_HOURS = 24;
export const REMIND_WARN_HOURS = 72;

const HOUR_MS = 3_600_000;

export const planIsEmpty = (p: AlertPlan) => !p.problems.length && !p.escalations.length && !p.reminders.length && !p.recoveries.length;

/** Does this plan contain something that must reach the owner (a recovery alone can wait a run)? */
export const planIsUrgent = (p: AlertPlan) => p.problems.length + p.escalations.length + p.reminders.length > 0;

export function decide(prev: OpsState, results: readonly CheckResult[], now: Date): { next: OpsState; plan: AlertPlan } {
  const next: OpsState = { ...prev, checks: { ...prev.checks } };
  const plan: AlertPlan = { problems: [], escalations: [], reminders: [], recoveries: [] };

  for (const r of results) {
    // "I could not look" changes nothing: not an alert, not a recovery.
    if (r.severity === "unknown") continue;

    const cur = r.severity as Verdict;
    const before = prev.checks[r.id];
    const told: Told = before?.emailedSev ?? null;
    const changed = !before || before.sev !== cur;

    const state: CheckState = {
      sev: cur,
      since: changed ? now.toISOString() : before!.since,
      emailedSev: told,
      lastEmailedAt: before?.lastEmailedAt ?? null,
    };
    next.checks[r.id] = state;

    if (cur === "ok") {
      if (told) plan.recoveries.push({ id: r.id, title: r.title, since: before?.since ?? now.toISOString() });
      continue;
    }

    if (!told) {
      plan.problems.push(r);
    } else if (SEVERITY_RANK[cur] > SEVERITY_RANK[told]) {
      plan.escalations.push(r);
    } else if (SEVERITY_RANK[cur] < SEVERITY_RANK[told]) {
      // crit → warn: they were told it was worse; no new mail, and the next escalation is measured from here.
      state.emailedSev = cur;
    } else {
      const every = (cur === "crit" ? REMIND_CRIT_HOURS : REMIND_WARN_HOURS) * HOUR_MS;
      const last = state.lastEmailedAt ? Date.parse(state.lastEmailedAt) : 0;
      if (now.getTime() - last >= every) plan.reminders.push(r);
    }
  }
  return { next, plan };
}

/** Record that the mail for this plan was delivered. Never called when sending failed. */
export function markDelivered(state: OpsState, plan: AlertPlan, now: Date): OpsState {
  const checks = { ...state.checks };
  for (const r of [...plan.problems, ...plan.escalations, ...plan.reminders]) {
    const c = checks[r.id];
    if (!c) continue;
    checks[r.id] = { ...c, emailedSev: c.sev === "ok" ? null : (c.sev as Told), lastEmailedAt: now.toISOString() };
  }
  for (const rec of plan.recoveries) {
    const c = checks[rec.id];
    if (c) checks[rec.id] = { ...c, emailedSev: null, lastEmailedAt: now.toISOString() };
  }
  return { ...state, checks };
}

/** The weekly digest is due when forced, or when the last one is over six and a half days old. */
export function digestDue(state: OpsState, now: Date, forced: boolean): boolean {
  if (forced) return true;
  if (!state.lastDigestAt) return false; // the first scheduled digest is the Sunday cron's, not a surprise on day one
  return now.getTime() - Date.parse(state.lastDigestAt) >= 6.5 * 24 * HOUR_MS;
}

/** The worst verdict across a set, for the subject line. */
export function worstOf(rs: readonly { severity: Severity }[]): Severity {
  let w: Severity = "ok";
  for (const r of rs) if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[w]) w = r.severity;
  return w;
}
