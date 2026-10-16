// The two emails the monitor sends the owner: an ALERT when something needs a look,
// and a weekly DIGEST that says "all fine" (so silence is never ambiguous: no digest
// on Monday morning means the monitor itself has stopped).
//
// PURE. Every dynamic string goes through escapeHtml; the plain-text part carries the
// same content. Nothing here holds a secret and no check puts one in a summary.
import { emailShell, escapeHtml } from "../email";
import { AREA_LABEL, AREA_ORDER, SEVERITY_RANK, countBy, type CheckResult, type InboxCounts, type OpsReport, type Severity } from "./types";
import type { AlertPlan } from "./state";
import { SITE } from "./deps";

export interface BuiltOpsEmail {
  subject: string;
  html: string;
  text: string;
}

const COLOR: Record<Severity, string> = { ok: "#34d17e", warn: "#eab308", crit: "#ef4444", unknown: "#6b7585" };
const WORD: Record<Severity, string> = { ok: "OK", warn: "Heads up", crit: "Needs action", unknown: "Not checked" };

const HEALTH_URL = `${SITE}/admin/health`;
const INBOX_URL = `${SITE}/admin/messages`;

function footer(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;line-height:1.6;color:#6b7585">
    Sent by the RiftCompare health monitor to the site owner. <a href="${HEALTH_URL}" style="color:#9aa4b2;text-decoration:underline">Open the health dashboard</a>.
  </td></tr>`;
}

const dot = (s: Severity) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLOR[s]};margin-right:8px"></span>`;

function item(r: CheckResult, label?: string): string {
  const tag = label ? `<span style="font-size:11px;font-weight:700;color:${COLOR[r.severity]};text-transform:uppercase;letter-spacing:.04em">${escapeHtml(label)}</span><br/>` : "";
  return `<tr><td style="padding:8px 32px 4px">
    <div style="border:1px solid #233047;border-left:3px solid ${COLOR[r.severity]};border-radius:10px;padding:12px 14px">
      ${tag}<div style="font-size:15px;font-weight:700;color:#fff">${escapeHtml(r.title)}</div>
      <div style="margin-top:4px;font-size:14px;line-height:1.55;color:#b8c0cc">${escapeHtml(r.summary)}</div>
      ${r.action ? `<div style="margin-top:8px;font-size:13px;line-height:1.55;color:#e6ebf2;background:#0b0e14;border-radius:8px;padding:9px 11px"><strong style="color:#f29733">What to do:</strong> ${escapeHtml(r.action)}</div>` : ""}
    </div>
  </td></tr>`;
}

function itemText(r: CheckResult, label?: string): string {
  return [`${label ? `[${label}] ` : ""}${r.title}`, `  ${r.summary}`, r.action ? `  What to do: ${r.action}` : ""].filter(Boolean).join("\n");
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildAlertEmail(plan: AlertPlan): BuiltOpsEmail {
  const urgent = [...plan.problems, ...plan.escalations, ...plan.reminders];
  const crit = urgent.filter((r) => r.severity === "crit");
  const lead = crit[0] ?? urgent[0];
  const rest = urgent.length - 1;

  let subject: string;
  if (lead) {
    const verb = crit.length ? "needs attention" : "heads up";
    subject = `RiftCompare ${verb}: ${lead.title}${rest > 0 ? ` (+${rest} more)` : ""}`;
  } else {
    const names = plan.recoveries.map((r) => r.title);
    subject = `RiftCompare: back to normal — ${names[0]}${names.length > 1 ? ` (+${names.length - 1} more)` : ""}`;
  }

  const sections: { heading: string; rows: CheckResult[]; label: string }[] = [
    { heading: "New problems", rows: plan.problems, label: "New" },
    { heading: "Got worse", rows: plan.escalations, label: "Worse" },
    { heading: "Still open", rows: plan.reminders, label: "Still open" },
  ];

  let inner = `<tr><td style="padding:8px 32px 6px;font-size:14px;line-height:1.6;color:#b8c0cc">${
    urgent.length
      ? `${plural(urgent.length, "thing")} to look at${crit.length ? "" : " (nothing is broken yet)"}. Each one says what to do; if in doubt, forward this email to Claude.`
      : "Everything that was flagged earlier is healthy again."
  }</td></tr>`;
  for (const s of sections) for (const r of s.rows) inner += item(r, s.label);
  if (plan.recoveries.length) {
    inner += `<tr><td style="padding:12px 32px 4px;font-size:13px;color:#b8c0cc"><strong style="color:#34d17e">Back to normal:</strong> ${plan.recoveries.map((r) => escapeHtml(r.title)).join(", ")}</td></tr>`;
  }
  inner += `<tr><td style="padding:12px 32px 22px"><a href="${HEALTH_URL}" style="display:inline-block;background:#ef7d00;color:#1e3043;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open the health dashboard →</a></td></tr>`;

  const text = [
    urgent.length ? `${plural(urgent.length, "thing")} to look at.` : "Everything flagged earlier is healthy again.",
    "",
    ...sections.flatMap((s) => s.rows.map((r) => itemText(r, s.label) + "\n")),
    plan.recoveries.length ? `Back to normal: ${plan.recoveries.map((r) => r.title).join(", ")}\n` : "",
    `Dashboard: ${HEALTH_URL}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const heading = urgent.length ? (crit.length ? "Something needs your attention" : "A heads up") : "Back to normal";
  return { subject, html: emailShell(heading, inner, footer(), lead ? lead.summary : "Resolved"), text };
}

function inboxLine(i: InboxCounts): string {
  if (!i.total) return "Nothing waiting.";
  return [
    i.contact && plural(i.contact, "contact message"),
    i.feedback && `${i.feedback} feedback`,
    i.priceReports && plural(i.priceReports, "wrong-price report"),
    i.storeSuggestions && plural(i.storeSuggestions, "store suggestion"),
    i.support && plural(i.support, "support ticket"),
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildDigestEmail(report: OpsReport): BuiltOpsEmail {
  const counts = countBy(report.results);
  const problems = report.results.filter((r) => SEVERITY_RANK[r.severity] > 0);
  const subject =
    counts.crit > 0
      ? `RiftCompare weekly check: ${plural(counts.crit, "problem")} need attention`
      : counts.warn > 0
        ? `RiftCompare weekly check: ${plural(counts.warn, "thing")} to watch`
        : "RiftCompare weekly check: all healthy";

  let inner = `<tr><td style="padding:8px 32px 6px;font-size:14px;line-height:1.6;color:#b8c0cc">${
    problems.length
      ? `${plural(counts.ok, "check")} healthy, ${plural(problems.length, "check")} flagged.`
      : `All ${counts.ok} checks are healthy. This email arrives every week; if one ever doesn't, the monitor has stopped.`
  }</td></tr>`;
  for (const r of problems) inner += item(r);

  for (const area of AREA_ORDER) {
    const rows = report.results.filter((r) => r.area === area);
    if (!rows.length) continue;
    inner += `<tr><td style="padding:14px 32px 2px;font-size:11px;font-weight:700;color:#6b7585;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(AREA_LABEL[area])}</td></tr>`;
    for (const r of rows) {
      inner += `<tr><td style="padding:3px 32px;font-size:13px;line-height:1.5;color:#b8c0cc">${dot(r.severity)}<strong style="color:#e6ebf2">${escapeHtml(r.title)}</strong> — ${escapeHtml(r.summary)}</td></tr>`;
    }
  }
  inner += `<tr><td style="padding:14px 32px 4px;font-size:13px;color:#b8c0cc"><strong style="color:#e6ebf2">Inbox:</strong> ${escapeHtml(inboxLine(report.inbox))} <a href="${INBOX_URL}" style="color:#f29733">Open</a></td></tr>`;
  inner += `<tr><td style="padding:12px 32px 22px"><a href="${HEALTH_URL}" style="display:inline-block;background:#ef7d00;color:#1e3043;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open the health dashboard →</a></td></tr>`;

  const text = [
    problems.length ? `${plural(problems.length, "check")} flagged, ${counts.ok} healthy.` : `All ${counts.ok} checks are healthy.`,
    "",
    ...problems.map((r) => itemText(r) + "\n"),
    ...AREA_ORDER.flatMap((a) => {
      const rows = report.results.filter((r) => r.area === a);
      return rows.length ? [AREA_LABEL[a].toUpperCase(), ...rows.map((r) => `  [${WORD[r.severity]}] ${r.title}: ${r.summary}`), ""] : [];
    }),
    `Inbox: ${inboxLine(report.inbox)}`,
    `Dashboard: ${HEALTH_URL}`,
  ].join("\n");

  return { subject, html: emailShell("Weekly health check", inner, footer(), problems.length ? `${problems.length} flagged` : "All healthy"), text };
}
