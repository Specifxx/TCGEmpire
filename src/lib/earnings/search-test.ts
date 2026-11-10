import { credentials, get, listProjects } from "@/lib/analytics/vercel";
import { scrubSecrets } from "./sources";
import { siteForProject } from "./sites";
import { readStored, writeStored } from "./stored";
import { inRange, toDisplay, type SourceResult } from "./core";

// THE COMPARE SEARCH TEST'S NUMBERS (2026-11-10 to the 8 Dec gate; plan in project files ›
// compare-search/compare-search-mvp-plan-2026-11-10.html). compareempire.com/search sends Vercel Web
// Analytics events (its DECISIONS.md, 2026-11-10): `search` {region, results, from, q only when results=0},
// `search_click` {to: ce|family, from} and, from /search, a `buy_click` {page: "/search"} for the pinned eBay
// row (the only buy link on that page, always paid). The earnings refresh reads them for Compare Empire's
// project(s) through the same PUBLIC API as the analytics page and keeps one copy; Empire HQ and the Monday
// report show it. Search earnings are eBay sales whose customid starts `ce-search` or `ce-mcp`.
// The gate: search earnings above search's Vercel cost, and paid clicks per 100 searches at least half of
// DexCompare's paid clicks per 100 visits.

export const SEARCH_TEST_KEY = "search-test";
export const SEARCH_TAG = /^ce-(search|mcp)\b/i;

export interface SearchCounts {
  searches: number;
  empty: number;
  /** Clicks on a result (ours or a sister's). */
  resultClicks: number;
  /** Clicks on the pinned eBay row: paid. */
  paidClicks: number;
}
export interface SearchTest {
  status: "ok" | "not-configured" | "error";
  detail?: string;
  fetchedAt: number;
  d7: SearchCounts;
  d30: SearchCounts;
  /** Searches per sending site (`from`), last 30 days, biggest first. */
  bySite: { from: string; count: number }[];
  /** The words of searches nothing matched, last 30 days, most searched first. */
  noResult: { q: string; count: number }[];
}

const ZERO: SearchCounts = { searches: 0, empty: 0, resultClicks: 0, paidClicks: 0 };

/** A `by=eventData/<key>` answer as value → count. Pure. */
export function valueCounts(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const value = Object.entries(r).find(([k]) => k.toLowerCase().startsWith("eventdata"))?.[1];
    const key = value == null ? "" : String(value);
    out.set(key, (out.get(key) ?? 0) + (Number(r.count) || 0));
  }
  return out;
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((n, v) => n + v, 0);
const top = (m: Map<string, number>, n: number) =>
  [...m.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

/** Search earnings (eBay customids ce-search-*, ce-mcp-*) in `display` cents, last 7 and 30 days. Pure. */
export function searchEarnings(sources: readonly SourceResult[] | null, today: string, display = "AUD"): { d7: number; d30: number } {
  const out = { d7: 0, d30: 0 };
  for (const s of sources ?? []) {
    for (const t of s.tags ?? []) {
      if (!SEARCH_TAG.test(t.tag)) continue;
      const c = toDisplay(t.cents, t.currency, display);
      if (inRange(t.day, "7d", today)) out.d7 += c;
      if (inRange(t.day, "30d", today)) out.d30 += c;
    }
  }
  return out;
}

/** Paid clicks per 100 searches, or null with no searches. Pure. */
export const paidPer100 = (c: SearchCounts) => (c.searches ? Math.round((c.paidClicks / c.searches) * 1000) / 10 : null);

const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

export async function refreshSearchTest(): Promise<SearchTest> {
  const base: SearchTest = { status: "ok", fetchedAt: Date.now(), d7: { ...ZERO }, d30: { ...ZERO }, bySite: [], noResult: [] };
  const cred = credentials();
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN or VERCEL_BILLING_TOKEN and VERCEL_TEAM_ID are not set." };
  try {
    const projects = (await listProjects(cred.token, cred.team)).filter((p) => siteForProject(p.name) === "ce");
    if (!projects.length) return { ...base, status: "error", detail: "No Compare Empire project found in the team." };
    const until = day(0);
    const ask = async (projectId: string, since: string, event: string, key: string) =>
      valueCounts(
        await get(
          "/v1/query/web-analytics/events/aggregate",
          { teamId: cred.team, projectId, since, until, by: `eventData/${key}`, limit: "100", filter: `eventName eq '${event}'` },
          cred.token,
        ),
      );
    const merge = (maps: Map<string, number>[]) => {
      const m = new Map<string, number>();
      for (const x of maps) for (const [k, v] of x) m.set(k, (m.get(k) ?? 0) + v);
      return m;
    };
    const all = async (since: string, event: string, key: string) => merge(await Promise.all(projects.map((p) => ask(p.id, since, event, key))));
    const counts = async (since: string): Promise<SearchCounts> => {
      const [results, clicks, buys] = await Promise.all([all(since, "search", "results"), all(since, "search_click", "to"), all(since, "buy_click", "page")]);
      return { searches: sum(results), empty: results.get("0") ?? 0, resultClicks: sum(clicks), paidClicks: buys.get("/search") ?? 0 };
    };
    const [d7, d30, from, words] = await Promise.all([counts(day(-6)), counts(day(-29)), all(day(-29), "search", "from"), all(day(-29), "search", "q")]);
    return {
      ...base,
      d7,
      d30,
      bySite: top(from, 20).map(([f, count]) => ({ from: f, count })),
      noResult: top(words, 25).map(([q, count]) => ({ q, count })),
    };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}

/** Refresh and keep. A failed refresh never replaces a good copy. */
export async function storeSearchTest(): Promise<SearchTest> {
  const fresh = await refreshSearchTest();
  if (fresh.status === "ok") await writeStored(SEARCH_TEST_KEY, fresh);
  return fresh;
}

export async function loadSearchTest(): Promise<SearchTest | null> {
  return (await readStored<SearchTest>([SEARCH_TEST_KEY])).get(SEARCH_TEST_KEY) ?? null;
}

/** The weekly report's input: the stored numbers and search's own eBay earnings. Pure. */
export function searchTestInput(test: SearchTest | null, sources: readonly SourceResult[] | null, today: string) {
  return { test, earned: searchEarnings(sources, today) };
}
