import { prisma } from "@/lib/db";
import { anthropicCostDays, dayIn, expandCost, mergeDays, windows, type CostEntry, type CostRecurrence, type DayAmount } from "./core";
import { EARNINGS_SINCE, scrubSecrets } from "./sources";

// The earnings dashboard's costs (2026-10-25, owner: "add costs on the website …
// Vercel Pro plan … Anthropic plan … for as long as the site has been alive … an
// ability to add costs manually … Reddit ads or Meta ads … one-off … around $200
// on ads in total"). DECISIONS.md, "Costs and profit on the earnings dashboard".
//
// Two kinds of cost line:
//   • automatic — Anthropic API usage, from the Admin API's Cost report
//     (ANTHROPIC_ADMIN_API_KEY). It covers API usage only; a claude.ai Pro/Max
//     subscription is not in any API.
//   • entries — the ManualCost table: once, or monthly/yearly from a start date
//     to an optional end date (a plan change is "Stop" on the old entry and a new
//     one). Vercel has no billing API for a team's own plan, so Vercel Pro is an
//     entry too.
//
// Two entries are pre-filled once (SEEDS), from what the owner said: Vercel Pro
// since the repository's first commit (2026-06-05, as far back as its history
// goes) and the ~US$200 of Reddit/Meta ads as one entry. A removed entry keeps
// its row (removedAt), so a seed is never re-added after the owner deletes it.

export interface CostLine {
  key: string; // "anthropic-api" or "entry:<id>"
  label: string;
  category: string;
  status: "ok" | "not-configured" | "error";
  detail?: string;
  days: DayAmount[];
  entry?: CostEntry & { note: string | null };
}

const SEEDS: { seedKey: string; label: string; category: string; amountCents: number; currency: string; startDay: string; recurrence: CostRecurrence; note: string }[] = [
  {
    seedKey: "vercel-pro",
    label: "Vercel Pro",
    category: "Hosting",
    amountCents: 2000,
    currency: "USD",
    startDay: "2026-06-05",
    recurrence: "monthly",
    note: "US$20/month per seat, from the site's first commit. Edit if your Vercel invoices differ (extra seats or usage).",
  },
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

// ── Anthropic API usage ──────────────────────────────────────────────────────
const TTL_MS = 30 * 60_000;
let anthropicMemo: { at: number; line: CostLine } | null = null;

async function anthropicLine(fresh: boolean): Promise<CostLine> {
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
  if (!fresh && anthropicMemo && Date.now() - anthropicMemo.at < TTL_MS) return anthropicMemo.line;
  try {
    const days: DayAmount[] = [];
    const headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "RiftCompare-earnings/1.0 (https://riftcompare.com)" };
    for (const [from, to] of windows(EARNINGS_SINCE, dayIn(Date.now()), 31)) {
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
    }
    const line: CostLine = { ...base, status: "ok", days: mergeDays(days), detail: "API usage only, from the Admin API." };
    anthropicMemo = { at: Date.now(), line };
    return line;
  } catch (e) {
    console.error("[costs] anthropic failed:", e);
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed", days: anthropicMemo?.line.days ?? [] };
  }
}

/** Every cost line: the automatic one, then each live entry (oldest start first). */
export async function loadCosts(fresh = false): Promise<CostLine[]> {
  await ensureSeeded();
  const today = dayIn(Date.now());
  const [auto, rows] = await Promise.all([
    anthropicLine(fresh),
    prisma.manualCost
      .findMany({
        where: { removedAt: null },
        orderBy: { startDay: "asc" },
        take: 500,
        select: { id: true, label: true, category: true, amountCents: true, currency: true, startDay: true, recurrence: true, endDay: true, note: true },
      })
      .catch(() => []),
  ]);
  const entries: CostLine[] = rows.map((r) => {
    const entry = { ...r, recurrence: (["once", "monthly", "yearly"].includes(r.recurrence) ? r.recurrence : "once") as CostRecurrence };
    return { key: `entry:${r.id}`, label: r.label, category: r.category, status: "ok" as const, days: expandCost(entry, today), entry };
  });
  return [auto, ...entries];
}

/** For the ops monitor: the automatic cost source's status only. */
export async function costsHealth(): Promise<{ key: string; status: CostLine["status"]; detail?: string }> {
  const a = await anthropicLine(false);
  return { key: "anthropic-api", status: a.status, detail: a.status === "error" ? a.detail : undefined };
}

export function forgetCosts(): void {
  anthropicMemo = null;
}
