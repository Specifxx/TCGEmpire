import { addDays, tagGroup, toDisplay, type TagDay } from "./core";
import { hasMark } from "@/lib/paid-visit";

// AD TESTS: WHAT EACH PAID AD COST AND WHAT ITS VISITORS EARNED (2026-11-14, owner: "with
// the ads, we got to make sure that we keep track to see if they actually are giving
// us ROI"). DECISIONS.md, "Ad tests on the earnings dashboard".
//
// • Earned is REAL, never estimated: the sales whose affiliate sub-id carries the ad's
//   marker (`fbad`, added on the way out by lib/paid-visit.ts on Rift, Dex and the card
//   engine), from the same TCGplayer, eBay and Amazon tag data the dashboard already
//   keeps, within the test's dates plus ATTRIBUTION_DAYS (networks report late and a
//   visitor can buy a day after the click).
// • Spend, impressions, link clicks and visits are the ad network's and Vercel's own
//   figures, stored in one OpsSnapshot row (`earnings:ad-stats`) by POST
//   /api/admin/earnings/ad-stats. Meta has no key on this account, so a daily scheduled
//   check reads Ads Manager and Vercel Analytics and posts them; the panel says how old
//   they are.
// • The verdict is a rule, not a feeling (verdictFor): an ad that has spent A$20 and
//   earned under a tenth of it is "Losing: pause" (the scheduled check pauses it), under
//   half is "Losing", and so on.

export interface AdTest {
  id: string;
  name: string;
  /** Affiliate tag group (tagGroup key): rc, dex, cyberpunk … */
  site: string;
  siteLabel: string;
  network: "Meta" | "Reddit" | "Google";
  /** The sub-id marker paid-visit.ts adds for this network. */
  mark: string;
  utmCampaign: string;
  countries: string;
  start: string; // YYYY-MM-DD (Sydney)
  end: string; // last day it runs, inclusive
  budgetCents: number;
  currency: string;
}

/** Sales up to this many days after the last ad day still count (late reports, next-day buys). */
export const ATTRIBUTION_DAYS = 3;

export const AD_TESTS: readonly AdTest[] = [
  { id: "rift-test-2026-11", name: "RiftCompare 7-day Meta test", site: "rc", siteLabel: "RiftCompare", network: "Meta", mark: "fbad", utmCampaign: "rift-test-2026-11", countries: "AU", start: "2026-11-14", end: "2026-11-21", budgetCents: 3500, currency: "AUD" },
  { id: "dex-test-2026-11", name: "DexCompare 7-day Meta test", site: "dex", siteLabel: "DexCompare", network: "Meta", mark: "fbad", utmCampaign: "dex-test-2026-11", countries: "US", start: "2026-11-14", end: "2026-11-21", budgetCents: 3500, currency: "AUD" },
  { id: "cyberpunk-test-2026-11", name: "Cyberpunk Compare 7-day Meta test", site: "cyberpunk", siteLabel: "Cyberpunk Compare", network: "Meta", mark: "fbad", utmCampaign: "cyberpunk-test-2026-11", countries: "US, CA, UK", start: "2026-11-14", end: "2026-11-21", budgetCents: 3500, currency: "AUD" },
];

/** The ad network's and Vercel's figures for one test, as last posted. */
export interface AdStats {
  asOf: string; // ISO time the figures were read
  spendCents: number;
  currency: string;
  impressions: number | null;
  linkClicks: number | null;
  /** Vercel Analytics visitors with this test's utm_campaign. */
  visitors: number | null;
  /** The ad's delivery state in the network ("Active", "Paused", "Completed" …). */
  delivery: string | null;
}

export const AD_STATS_KEY = "ad-stats";

const int = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Pure: validate a posted stats object; unknown tests and bad numbers are dropped. */
export function parseAdStats(body: unknown, now = new Date()): Record<string, AdStats> {
  const out: Record<string, AdStats> = {};
  const src = (body && typeof body === "object" ? (body as Record<string, unknown>).stats : null) as Record<string, unknown> | null;
  if (!src || typeof src !== "object") return out;
  for (const t of AD_TESTS) {
    const r = src[t.id] as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") continue;
    const spend = Number(r.spend);
    if (!Number.isFinite(spend) || spend < 0 || spend > 10_000) continue;
    const currency = String(r.currency ?? t.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    const asOf = Date.parse(String(r.asOf ?? ""));
    out[t.id] = {
      asOf: new Date(Number.isFinite(asOf) ? asOf : now.getTime()).toISOString(),
      spendCents: Math.round(spend * 100),
      currency,
      impressions: int(r.impressions),
      linkClicks: int(r.linkClicks),
      visitors: int(r.visitors),
      delivery: r.delivery ? String(r.delivery).slice(0, 40) : null,
    };
  }
  return out;
}

export interface AdEarned {
  cents: number;
  pendingCents: number;
  sales: number;
  /** Each tagged sale's tag, so the panel can show where it came from. */
  tags: { tag: string; cents: number; sales: number }[];
}

/** Pure: the sales a test's visitors made, from every tagged source, in `display`. */
export function earnedBy(test: AdTest, tagSources: readonly (readonly TagDay[])[], display: string): AdEarned {
  const last = addDays(test.end, ATTRIBUTION_DAYS);
  const byTag = new Map<string, { tag: string; cents: number; sales: number }>();
  let cents = 0;
  let pendingCents = 0;
  let sales = 0;
  for (const rows of tagSources) {
    for (const r of rows) {
      if (r.day < test.start || r.day > last) continue;
      if (tagGroup(r.tag).key !== test.site || !hasMark(r.tag, test.mark)) continue;
      const c = toDisplay(r.cents, r.currency, display);
      cents += c;
      pendingCents += toDisplay(r.pendingCents, r.currency, display);
      sales += r.sales;
      const e = byTag.get(r.tag) ?? { tag: r.tag, cents: 0, sales: 0 };
      e.cents += c;
      e.sales += r.sales;
      byTag.set(r.tag, e);
    }
  }
  return { cents, pendingCents, sales, tags: [...byTag.values()].sort((a, b) => b.cents - a.cents) };
}

export type VerdictKey = "no-data" | "too-early" | "pause" | "losing" | "close" | "profit";
export interface Verdict {
  key: VerdictKey;
  label: string;
  /** Earned per dollar spent (0.25 = 25c back per $1), null without spend. */
  roi: number | null;
}

/** Spend (in the test's currency) before any verdict is given. */
export const MIN_SPEND_FOR_VERDICT = 1000;
/** Spend after which an ad that earned under PAUSE_ROI of it is paused. */
export const PAUSE_AFTER_SPEND = 2000;
export const PAUSE_ROI = 0.1;

/** Pure: the rule the panel and the daily check both apply. Amounts in one currency. */
export function verdictFor(spendCents: number | null, earnedCents: number): Verdict {
  if (spendCents == null) return { key: "no-data", label: "No ad figures yet", roi: null };
  const roi = spendCents > 0 ? earnedCents / spendCents : null;
  if (spendCents < MIN_SPEND_FOR_VERDICT) return { key: "too-early", label: "Too early to judge", roi };
  if (roi != null && roi >= 1) return { key: "profit", label: "Paying for itself", roi };
  if (roi != null && roi >= 0.5) return { key: "close", label: "Losing a little", roi };
  if (spendCents >= PAUSE_AFTER_SPEND && (roi ?? 0) < PAUSE_ROI) return { key: "pause", label: "Losing clearly: pause", roi };
  return { key: "losing", label: "Losing", roi };
}

export interface AdTestRow {
  test: AdTest;
  stats: AdStats | null;
  earned: AdEarned;
  /** Spend in `display`, null without stats. */
  spend: number | null;
  verdict: Verdict;
  /** Earned per link click and cost per link click, in `display` cents. */
  earnedPerClick: number | null;
  costPerClick: number | null;
}

/** Pure: one row per test, everything in `display`. */
export function adTestRows(stats: Record<string, AdStats> | null | undefined, tagSources: readonly (readonly TagDay[])[], display: string): AdTestRow[] {
  return AD_TESTS.map((test) => {
    const s = stats?.[test.id] ?? null;
    const earned = earnedBy(test, tagSources, display);
    const spend = s ? toDisplay(s.spendCents, s.currency, display) : null;
    const clicks = s?.linkClicks ?? null;
    return {
      test,
      stats: s,
      earned,
      spend,
      verdict: verdictFor(s ? toDisplay(s.spendCents, s.currency, display) : null, earned.cents),
      earnedPerClick: clicks ? earned.cents / clicks : null,
      costPerClick: clicks && spend != null ? spend / clicks : null,
    };
  });
}
