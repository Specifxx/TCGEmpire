import { prisma } from "@/lib/db";
import { addDays, anthropicCostDays, dayIn, expandCost, mapLimit, mergeDays, windows, type CostEntry, type CostRecurrence, type DayAmount } from "./core";
import { EARNINGS_SINCE, scrubSecrets, overdueDetail } from "./sources";
import { readStored, writeStored } from "./stored";
import { projectDays, vercelCharges, type ProjectCharge } from "./sites";

// The earnings dashboard's costs (2026-10-25, owner: "add costs on the website …
// Vercel Premium plan … Anthropic plan … for as long as the site has been alive … an
// ability to add costs manually … Reddit ads or Meta ads … one-off … around $200
// on ads in total"). DECISIONS.md, "Costs and profit on the earnings dashboard".
//
// Two kinds of cost line:
//   • automatic — Anthropic API usage, from the Admin API's Cost report
//     (ANTHROPIC_ADMIN_API_KEY). It covers API usage only; a claude.ai Pro/Max
//     subscription is not in any API.
//   • automatic — Vercel, from the team's FOCUS billing export (2026-10-30;
//     VERCEL_BILLING_TOKEN + VERCEL_TEAM_ID), per project and day, so the
//     dashboard can show cost per site (lib/earnings/sites.ts). It covers the
//     last VERCEL_DAYS days; before that, the "Vercel invoice" entries count.
//   • entries — the ManualCost table: once, or monthly/yearly from a start date
//     to an optional end date (a plan change is "Stop" on the old entry and a new
//     one). Domains bought through Vercel stay entries.
//
// One entry is pre-filled once (SEEDS): the ~US$200 of Reddit/Meta ads the owner
// mentioned. Anthropic plans, domains and Vercel before the API's window are
// entered from their real invoices (the owner fills them with a Claude in Chrome
// prompt; docs/earnings-dashboard-setup.md), so no estimate is seeded for them. A removed
// entry keeps its row (removedAt), so a seed is never re-added once deleted.

export interface CostLine {
  key: string; // "anthropic-api" or "entry:<id>"
  label: string;
  category: string;
  status: "ok" | "not-configured" | "error";
  detail?: string;
  days: DayAmount[];
  entry?: CostEntry & { note: string | null };
  /** Vercel only: the same charges per project, for cost per site. */
  projects?: ProjectCharge[];
}

const SEEDS: { seedKey: string; label: string; category: string; amountCents: number; currency: string; startDay: string; recurrence: CostRecurrence; note: string }[] = [
  {
    seedKey: "ads-reddit-meta-2026",
    label: "Reddit + Meta ads",
    category: "Ads",
    amountCents: 20000,
    currency: "USD",
    startDay: "2026-10-15",
    recurrence: "once",
    note: "Approximate total so far, as one entry.",
  },
];

let seeded = false;
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  await prisma.manualCost.createMany({ data: SEEDS, skipDuplicates: true }).catch((e) => console.error("[costs] seed failed:", e));
  seeded = true;
}

// ── Automatic lines: stored like the earnings sources (lib/earnings/stored.ts) ─
// The page reads the stored line; the refresh cron and "Refresh" ask the API.
// A line remembers when it was fetched so the ops monitor can tell a stopped cron.
type StoredLine = CostLine & { fetchedAt?: number };
const AUTO_KEYS = ["cost:anthropic-api", "cost:vercel"] as const;

async function autoLine(
  storeKey: (typeof AUTO_KEYS)[number],
  base: { key: string; label: string; category: string },
  fresh: boolean,
  stored: Map<string, StoredLine>,
  fetchLine: () => Promise<Omit<CostLine, "key" | "label" | "category" | "status">>,
): Promise<StoredLine> {
  const kept = stored.get(storeKey);
  if (!fresh && kept && Array.isArray(kept.days)) return kept;
  let line: StoredLine;
  try {
    line = { ...base, status: "ok", ...(await fetchLine()), fetchedAt: Date.now() };
  } catch (e) {
    console.error(`[costs] ${base.key} failed:`, e);
    const detail = e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed";
    // The last good figures stay, marked as an error.
    line = kept?.days.length ? { ...kept, status: "error", detail } : { ...base, status: "error", detail, days: [], fetchedAt: Date.now() };
  }
  await writeStored(storeKey, line);
  return line;
}

// ── Anthropic API usage ──────────────────────────────────────────────────────
async function anthropicLine(fresh: boolean, stored: Map<string, StoredLine>): Promise<StoredLine> {
  const base = { key: "anthropic-api", label: "Anthropic API usage", category: "AI" };
  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!key) {
    return {
      ...base,
      status: "not-configured",
      detail: "Set ANTHROPIC_ADMIN_API_KEY (Claude Console → Settings → Admin keys) for API usage. A claude.ai Pro/Max plan has no API: add it below as a monthly cost.",
      days: [],
    };
  }
  return autoLine("cost:anthropic-api", base, fresh, stored, async () => {
    const headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "RiftCompare-earnings/1.0 (https://riftcompare.com)" };
    const perWindow = await mapLimit(windows(EARNINGS_SINCE, dayIn(Date.now()), 31), 4, async ([from, to]) => {
      const days: DayAmount[] = [];
      let page: string | null = null;
      for (let i = 0; i < 20; i++) {
        const q = new URLSearchParams({ starting_at: `${from}T00:00:00Z`, ending_at: `${to}T23:59:59Z`, bucket_width: "1d", limit: "31" });
        if (page) q.set("page", page);
        const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, { headers, cache: "no-store", signal: AbortSignal.timeout(25_000) });
        const text = await r.text();
        if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`);
        const json = JSON.parse(text) as { has_more?: boolean; next_page?: string | null };
        days.push(...anthropicCostDays(json));
        if (!json.has_more || !json.next_page) break;
        page = json.next_page;
      }
      return days;
    });
    return { days: mergeDays(perWindow.flat()), detail: "API usage only, from the Admin API." };
  });
}

// ── Vercel usage and plan, per project ──────────────────────────────────────
// GET /v1/billing/charges (FOCUS v1.3 JSONL, one line per SKU, project and day;
// at most a year per request). 120 days in 31-day requests keeps each response
// a few MB. The token needs only a Billing (or Viewer-like) role on the team.
export const VERCEL_DAYS = 120;

async function vercelLine(fresh: boolean, stored: Map<string, StoredLine>): Promise<StoredLine> {
  const base = { key: "vercel", label: "Vercel (per project)", category: "Hosting" };
  const token = process.env.VERCEL_BILLING_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  if (!token || !team) {
    return {
      ...base,
      status: "not-configured",
      detail: "Set VERCEL_BILLING_TOKEN (Vercel → Account Settings → Tokens, scoped to the team) and VERCEL_TEAM_ID for Vercel cost per site.",
      days: [],
    };
  }
  return autoLine("cost:vercel", base, fresh, stored, async () => {
    const today = dayIn(Date.now(), "UTC");
    const from = addDays(today, -(VERCEL_DAYS - 1));
    const perWindow = await mapLimit(windows(from, today, 31), 4, async ([a, b]) => {
      const q = new URLSearchParams({ teamId: team, from: `${a}T00:00:00Z`, to: `${addDays(b, 1)}T00:00:00Z` });
      const r = await fetch(`https://api.vercel.com/v1/billing/charges?${q}`, {
        headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "gzip" },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      return vercelCharges(text);
    });
    const projects: ProjectCharge[] = perWindow.flat();
    return { days: projectDays(projects), projects, detail: `Last ${VERCEL_DAYS} days from the billing API (domains excluded: enter those by hand).` };
  });
}

/** A hand-entered Vercel invoice (not a domain) that the billing API now covers from `from` on. */
export const isVercelInvoice = (label: string) => /\bvercel\b/i.test(label) && !/domain/i.test(label);

/** Every cost line: the automatic ones, then each live entry (oldest start first). */
export async function loadCosts(fresh = false): Promise<CostLine[]> {
  await ensureSeeded();
  const today = dayIn(Date.now());
  const stored = await readStored<StoredLine>(AUTO_KEYS);
  const [auto, vercel, rows] = await Promise.all([
    anthropicLine(fresh, stored),
    vercelLine(fresh, stored),
    prisma.manualCost
      .findMany({
        where: { removedAt: null },
        orderBy: { startDay: "asc" },
        take: 500,
        select: { id: true, label: true, category: true, amountCents: true, currency: true, startDay: true, recurrence: true, endDay: true, note: true },
      })
      .catch(() => []),
  ]);
  // Once the API answers, it is the record of Vercel's plan and usage for the days it
  // covers; a "Vercel invoice" entry then counts only for the days before it.
  const apiFrom = vercel.status === "ok" ? addDays(dayIn(Date.now(), "UTC"), -(VERCEL_DAYS - 1)) : null;
  const entries: CostLine[] = rows.map((r) => {
    const entry = { ...r, recurrence: (["once", "monthly", "yearly"].includes(r.recurrence) ? r.recurrence : "once") as CostRecurrence };
    let days = expandCost(entry, today);
    if (apiFrom && isVercelInvoice(r.label)) days = days.filter((d) => d.day < apiFrom);
    return { key: `entry:${r.id}`, label: r.label, category: r.category, status: "ok" as const, days, entry };
  });
  return [auto, vercel, ...entries];
}

/** For the ops monitor: the automatic cost sources' status only. */
export async function costsHealth(): Promise<{ key: string; status: CostLine["status"]; detail?: string }[]> {
  const stored = await readStored<StoredLine>(AUTO_KEYS);
  const lines = await Promise.all([anthropicLine(false, stored), vercelLine(false, stored)]);
  return lines.map((a) => {
    const overdue = a.status === "ok" && a.fetchedAt ? overdueDetail(a.fetchedAt) : undefined;
    if (overdue) return { key: a.key, status: "error" as const, detail: overdue };
    return { key: a.key, status: a.status, detail: a.status === "error" ? a.detail : undefined };
  });
}
