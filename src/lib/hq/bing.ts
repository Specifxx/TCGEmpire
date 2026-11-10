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
