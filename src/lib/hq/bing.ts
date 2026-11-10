// Bing, every site, for the Monday report (SEO indexing plan SEO-3, 2026-11-10).
// scripts/bing-sites.ts (bing-sites.yml, Mondays 07:50 UTC) commits data/hq/bing-sites.json to main; the weekly route
// reads it raw, like the owner-steps queue. Public numbers only. A missing or unreadable file means no section.
import { OWNER_REPO } from "./sites";

export const BING_RAW_URL = `https://raw.githubusercontent.com/${OWNER_REPO}/TCGEmpire/main/data/hq/bing-sites.json`;

export interface BingRow {
  host: string;
  indexed: string;
  crawled: string;
  errors: string;
  impr: string;
  clicks: string;
}

/** Defensive parse: a bad row is dropped, never a crash. */
export function parseBing(j: unknown): { generatedAt: string; rows: BingRow[] } | null {
  const sites = (j as { generatedAt?: unknown; sites?: unknown } | null)?.sites;
  if (!Array.isArray(sites)) return null;
  const s = (v: unknown) => String(v ?? "?").slice(0, 40);
  const rows = (sites as Record<string, unknown>[])
    .filter((r) => typeof r?.host === "string" && r.host)
    .map((r) => ({ host: s(r.host), indexed: s(r.indexed), crawled: s(r.crawled), errors: s(r.errors), impr: s(r.impr), clicks: s(r.clicks) }));
  return { generatedAt: String((j as { generatedAt?: unknown }).generatedAt ?? "").slice(0, 10), rows };
}

/** One line per site: "host: 12 indexed, 40 crawled, 0 errors, 5 impressions / 0 clicks (28 days)". Pure. */
export function bingLines(r: { generatedAt: string; rows: readonly BingRow[] } | null): string[] {
  if (!r || !r.rows.length) return [];
  return r.rows.map((x) => `${x.host}: ${x.indexed} indexed, ${x.crawled} crawled, ${x.errors} errors, ${x.impr} impressions / ${x.clicks} clicks (28 days)`);
}

export async function loadBing(): Promise<{ generatedAt: string; rows: BingRow[] } | null> {
  try {
    const res = await fetch(BING_RAW_URL, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    return res.ok ? parseBing(await res.json()) : null;
  } catch {
    return null;
  }
}

// ── Bing URL submission for the small sites (scripts/bing-submit.ts, bing-submit.yml daily; 2026-11-10) ──

export const BING_SUBMIT_RAW_URL = `https://raw.githubusercontent.com/${OWNER_REPO}/TCGEmpire/main/data/hq/bing-submit.json`;

export interface BingSubmitSite {
  host: string;
  indexed: number | null;
  submitted: number;
  status: string;
}
export interface BingSubmitHistory {
  date: string;
  host: string;
  indexed: number | null;
  submitted: number;
}
export interface BingSubmit {
  generatedAt: string;
  status: string;
  sites: BingSubmitSite[];
  history: BingSubmitHistory[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Defensive parse: a bad row is dropped, never a crash. */
export function parseBingSubmit(j: unknown): BingSubmit | null {
  const o = j as { generatedAt?: unknown; status?: unknown; sites?: unknown; history?: unknown } | null;
  if (!o || !Array.isArray(o.sites)) return null;
  const str = (v: unknown, n = 160) => String(v ?? "").slice(0, n);
  const sites = (o.sites as Record<string, unknown>[])
    .filter((r) => typeof r?.host === "string" && r.host)
    .map((r) => ({ host: str(r.host, 60), indexed: num(r.indexed), submitted: num(r.submitted) ?? 0, status: str(r.status) }));
  const history = (Array.isArray(o.history) ? (o.history as Record<string, unknown>[]) : [])
    .filter((r) => typeof r?.host === "string" && typeof r?.date === "string")
    .map((r) => ({ date: str(r.date, 10), host: str(r.host, 60), indexed: num(r.indexed), submitted: num(r.submitted) ?? 0 }));
  return { generatedAt: str(o.generatedAt, 30), status: str(o.status), sites, history };
}

/**
 * One line per small site for the Monday report: "kaeyoung.com: 0 → 6 pages in Bing this week, 700 URLs submitted
 * (submitted)". The week is the 7 days up to the file's date. Pure.
 */
export function bingSubmitLines(b: BingSubmit | null): string[] {
  if (!b || !b.sites.length) return [];
  const end = Date.parse(b.generatedAt.slice(0, 10));
  const inWeek = (d: string) => Number.isFinite(end) && end - Date.parse(d) < 7 * 86_400_000 && Date.parse(d) <= end;
  return b.sites.map((s) => {
    const week = b.history.filter((h) => h.host === s.host && inWeek(h.date)).sort((a, z) => a.date.localeCompare(z.date));
    const first = week.find((h) => h.indexed != null)?.indexed;
    const sent = week.reduce((a, h) => a + h.submitted, 0);
    const now = s.indexed == null ? "?" : String(s.indexed);
    const trend = first != null && s.indexed != null && first !== s.indexed ? `${first} → ${now}` : now;
    return `${s.host}: ${trend} pages in Bing, ${sent} URLs submitted in 7 days (${s.status || "no status"})`;
  });
}

export async function loadBingSubmit(): Promise<BingSubmit | null> {
  try {
    const res = await fetch(BING_SUBMIT_RAW_URL, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    return res.ok ? parseBingSubmit(await res.json()) : null;
  } catch {
    return null;
  }
}
