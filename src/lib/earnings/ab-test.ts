import { credentials, get, listProjects } from "@/lib/analytics/vercel";
import { scrubSecrets } from "./sources";
import { siteForProject } from "./sites";
import { readStored, writeStored } from "./stored";
import { valueCounts } from "./search-test";

// THE QUICK VIEW'S A/B TESTS ON DEXCOMPARE AND MTG COMPARE (owner, 2026-11-14: "we need to do some A/B testing to determine what
// is the best way for us to earn more revenue"; each site's DECISIONS.md, 2026-11-14, and its src/lib/ab.ts). Three 50/50 splits
// inside the quick view (drawn in the browser, in no page's HTML), 20 November to 3 December 2026:
//   order  US only: eBay's pinned row then TCGplayer's (a), against TCGplayer's priced row first (b).
//   mini   DexCompare, phones only: the small eBay + TCGplayer pair under the price rows (a), against above them (b).
//   cta    TCGplayer's priced row's button says "View deal" (a), against "Buy now" (b).
// The sites send Web Analytics events with ONE property, k = "<region>:<order><mini><cta>" ("us:ab-"; "-" where a test does not
// apply to the visit): ab_seen once a visit, then once a visit each ab_paid (a click on any paid link) and the kind of link
// (ab_tcg, ab_ebay, ab_amazon, ab_store, ab_mini_tcg, ab_mini_ebay). So every count is a number of visits, and a result is a
// share of the visits that saw. The earnings refresh reads them through the same PUBLIC API as the analytics page and keeps one
// copy; the Monday report and Empire HQ print it. The rules were fixed before any number existed: no verdict before the last
// day, two-sided two-proportion test, p under 0.05, else the control stays.

export const AB_TEST_KEY = "ab-test";
/** The first and last whole day (UTC) the sites split and send. */
export const AB_FROM = "2026-11-20";
export const AB_TO = "2026-12-03";
/** The report prints the tests until this day (the Monday after the last one), then drops the section. */
export const AB_SHOWN_UNTIL = "2026-12-14";

export const AB_EVENTS = ["ab_seen", "ab_paid", "ab_tcg", "ab_ebay", "ab_amazon", "ab_store", "ab_mini_tcg", "ab_mini_ebay"] as const;
export type AbEvent = (typeof AB_EVENTS)[number];
export type AbTestName = "order" | "mini" | "cta";

/** What each test changes, the events it is read on (the first is the one that decides), and the sites it runs on. */
export const AB_TESTS: { name: AbTestName; what: string; sites: string[]; read: AbEvent[] }[] = [
  { name: "order", what: "US: TCGplayer's row pinned above eBay's (B) or under it (A)", sites: ["dex", "mtg"], read: ["ab_tcg", "ab_ebay", "ab_paid"] },
  { name: "mini", what: "phones: the small eBay + TCGplayer pair above the price rows (B) or under them (A)", sites: ["dex"], read: ["ab_paid", "ab_mini_tcg", "ab_mini_ebay", "ab_tcg", "ab_ebay"] },
  { name: "cta", what: "TCGplayer's button says \"Buy now\" (B) or \"View deal\" (A)", sites: ["dex", "mtg"], read: ["ab_tcg", "ab_paid"] },
];

const LABEL: Record<AbEvent, string> = {
  ab_seen: "visits",
  ab_paid: "any paid click",
  ab_tcg: "TCGplayer click",
  ab_ebay: "eBay click",
  ab_amazon: "Amazon click",
  ab_store: "store click",
  ab_mini_tcg: "TCGplayer tile click",
  ab_mini_ebay: "eBay tile click",
};

export interface AbSite {
  key: string;
  /** event → k → visits. */
  counts: Partial<Record<AbEvent, Record<string, number>>>;
}
export interface AbTest {
  status: "ok" | "not-configured" | "error";
  detail?: string;
  fetchedAt: number;
  sites: AbSite[];
}

const SLOT_AT: Record<AbTestName, number> = { order: 0, mini: 1, cta: 2 };

/** A key's arm in a test: "a", "b" or null (the test did not apply to the visit, or not a key of ours). Pure. */
export function armOfKey(k: string, test: AbTestName): "a" | "b" | null {
  const v = /^[a-z]{2}:([ab-]{3})$/.exec(k)?.[1][SLOT_AT[test]];
  return v === "a" || v === "b" ? v : null;
}

/** Sum a k → visits table into a test's two arms. Pure. */
export function splitByArm(counts: Record<string, number> | undefined, test: AbTestName): { a: number; b: number } {
  const out = { a: 0, b: 0 };
  for (const [k, n] of Object.entries(counts ?? {})) {
    const arm = armOfKey(k, test);
    if (arm) out[arm] += n;
  }
  return out;
}

/** Φ(x), Abramowitz and Stegun 7.1.26 (error under 1.5e-7). Pure. */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Two-proportion z-test (pooled), two-sided: b's share against a's. Null with an empty arm. Pure. */
export function compare(a: { hits: number; n: number }, b: { hits: number; n: number }): { rateA: number; rateB: number; lift: number | null; p: number } | null {
  if (a.n <= 0 || b.n <= 0) return null;
  const rateA = a.hits / a.n;
  const rateB = b.hits / b.n;
  const pool = (a.hits + b.hits) / (a.n + b.n);
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  return { rateA, rateB, lift: rateA > 0 ? rateB / rateA - 1 : null, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

const SITE_LABEL: Record<string, string> = { dex: "DexCompare", mtg: "MTG Compare" };
const num = (v: number) => v.toLocaleString("en-US");
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * The Monday report's and Empire HQ's lines, plain text. Nothing before the first day or after AB_SHOWN_UNTIL. While the tests
 * run the lines say so and give no verdict (the rule: no stopping early); from the day after the last one each test's first
 * event decides. Pure.
 */
export function abTestLines(test: AbTest | null, today: string): string[] {
  if (today < AB_FROM || today > AB_SHOWN_UNTIL) return [];
  if (!test) return ["Not collected yet (the earnings refresh reads it every three hours)."];
  if (test.status !== "ok") return [`Not read: ${test.detail ?? test.status}.`];
  const done = today > AB_TO;
  const lines: string[] = [
    done
      ? `Finished (${AB_FROM} to ${AB_TO}). A test is won only at p under 0.05 on its first measure; otherwise the control stays.`
      : `Running, ${AB_FROM} to ${AB_TO}: numbers so far, no verdict before the last day.`,
  ];
  for (const t of AB_TESTS) {
    for (const key of t.sites) {
      const site = test.sites.find((s) => s.key === key);
      const seen = splitByArm(site?.counts.ab_seen, t.name);
      const head = `${SITE_LABEL[key] ?? key}, ${t.name} (${t.what}): visits A ${num(seen.a)}, B ${num(seen.b)}.`;
      if (!seen.a || !seen.b) {
        lines.push(`${head} No visits in both arms yet.`);
        continue;
      }
      const parts: string[] = [];
      let verdict = "";
      t.read.forEach((ev, i) => {
        const hits = splitByArm(site?.counts[ev], t.name);
        const r = compare({ hits: hits.a, n: seen.a }, { hits: hits.b, n: seen.b });
        if (!r) return;
        parts.push(`${LABEL[ev]} A ${pc(r.rateA)} (${num(hits.a)}), B ${pc(r.rateB)} (${num(hits.b)})${r.lift == null ? "" : `, ${r.lift >= 0 ? "+" : ""}${Math.round(r.lift * 100)}%`}, p ${r.p.toFixed(3)}`);
        if (i === 0 && done) verdict = r.p < 0.05 ? (r.rateB > r.rateA ? " RESULT: B wins." : " RESULT: A (the control) wins.") : " RESULT: no difference found, the control stays.";
      });
      lines.push(`${head} ${parts.join("; ")}.${verdict}`);
    }
  }
  return lines;
}

export async function refreshAbTest(): Promise<AbTest> {
  const base: AbTest = { status: "ok", fetchedAt: Date.now(), sites: [] };
  const cred = credentials();
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN or VERCEL_BILLING_TOKEN and VERCEL_TEAM_ID are not set." };
  try {
    const wanted = [...new Set(AB_TESTS.flatMap((t) => t.sites))];
    const projects = (await listProjects(cred.token, cred.team)).map((p) => ({ ...p, site: siteForProject(p.name) })).filter((p) => wanted.includes(p.site));
    if (!projects.length) return { ...base, status: "error", detail: "No DexCompare or MTG Compare project found in the team." };
    const sites = new Map<string, AbSite>(wanted.map((key) => [key, { key, counts: {} }]));
    await Promise.all(
      projects.flatMap((p) =>
        AB_EVENTS.map(async (event) => {
          const m = valueCounts(
            await get("/v1/query/web-analytics/events/aggregate", { teamId: cred.team, projectId: p.id, since: AB_FROM, until: AB_TO, by: "eventData/k", limit: "100", filter: `eventName eq '${event}'` }, cred.token),
          );
          const into = ((sites.get(p.site) as AbSite).counts[event] ??= {});
          for (const [k, v] of m) if (k) into[k] = (into[k] ?? 0) + v;
        }),
      ),
    );
    return { ...base, sites: [...sites.values()] };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Refresh and keep, only while there is something to read (first day to the last report). A failed refresh never replaces a good copy. */
export async function storeAbTest(): Promise<{ status: AbTest["status"] | "idle" }> {
  const d = today();
  if (d < AB_FROM || d > AB_SHOWN_UNTIL) return { status: "idle" };
  const fresh = await refreshAbTest();
  if (fresh.status === "ok") await writeStored(AB_TEST_KEY, fresh);
  return { status: fresh.status };
}

export async function loadAbTest(): Promise<AbTest | null> {
  return (await readStored<AbTest>([AB_TEST_KEY])).get(AB_TEST_KEY) ?? null;
}
