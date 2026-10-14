// The shapes the ops monitor passes around. Pure types and two tiny helpers: no
// database, no network, no environment, so the browser-free admin page, the
// GitHub Actions script and the node tests all import it freely.
// DECISIONS.md, "The site watches itself", 2026-10-14.

/** ok / warn / crit are verdicts. `unknown` means the check could not run (a key is not set, an API was
 *  unreachable): it never raises or clears an alert, because "I could not look" is not "it is fine". */
export type Severity = "ok" | "warn" | "crit" | "unknown";

export type OpsArea = "databases" | "ebay" | "data" | "money" | "email" | "site" | "inbox";

export const AREA_LABEL: Record<OpsArea, string> = {
  databases: "Databases & limits",
  ebay: "eBay",
  data: "Prices & data",
  money: "Payments",
  email: "Email",
  site: "Site & deploys",
  inbox: "Inbox",
};

export const AREA_ORDER: OpsArea[] = ["databases", "ebay", "data", "money", "email", "site", "inbox"];

export interface CheckResult {
  /** Stable id: alert state is keyed on it. `area:thing`, e.g. "neon:operational". */
  id: string;
  area: OpsArea;
  /** Short label for the row: "Operational database transfer". */
  title: string;
  severity: Severity;
  /** One line a human reads first: "71% of 5 GB used, on pace to run out in 2.1 days". */
  summary: string;
  /** What to do about it, written for the owner. Shown only when severity is warn or crit. */
  action?: string;
  /** A number to draw as a bar: used / limit. */
  metric?: { value: number; limit: number; unit: string };
  checkedAt: string;
}

export interface InboxCounts {
  /** Contact messages since the owner last opened the inbox. */
  contact: number;
  /** Feedback with status NEW. */
  feedback: number;
  /** Store suggestions with status pending. */
  storeSuggestions: number;
  /** Wrong-price / wrong-card reports with status NEW. */
  priceReports: number;
  /** Support tickets with status OPEN. */
  support: number;
  total: number;
  /** ISO time of the oldest item still waiting, or null. */
  oldestAt: string | null;
}

export interface OpsReport {
  version: 1;
  generatedAt: string;
  results: CheckResult[];
  inbox: InboxCounts;
}

export const SEVERITY_RANK: Record<Severity, number> = { unknown: 0, ok: 0, warn: 1, crit: 2 };

export function worst(results: readonly { severity: Severity }[]): Severity {
  let w: Severity = "ok";
  for (const r of results) if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[w]) w = r.severity;
  return w;
}

export function countBy(results: readonly { severity: Severity }[]): Record<Severity, number> {
  const c: Record<Severity, number> = { ok: 0, warn: 0, crit: 0, unknown: 0 };
  for (const r of results) c[r.severity]++;
  return c;
}

export const emptyInbox = (): InboxCounts => ({
  contact: 0,
  feedback: 0,
  storeSuggestions: 0,
  priceReports: 0,
  support: 0,
  total: 0,
  oldestAt: null,
});
