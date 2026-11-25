import { addDays, expandCost, toDisplay, type CostEntry, type TagDay } from "./core";
import { creatorMark, hasMark } from "@/lib/paid-visit";

// PAID CREATOR DEALS: WHAT EACH CREATOR COST AND WHAT THEIR VISITORS EARNED (owner,
// 2026-11-20: "Let's do it" to the boardroom's move N6). DECISIONS.md, "Pay-per-click
// creators".
//
// • The deal: a creator is paid only per TRACKED BUY CLICK (a visitor who arrived on the
//   creator's tagged link and then opened a store, eBay, TCGplayer or Amazon link), at
//   `rateCents` each, up to `trialCapCents` in the first TRIAL_DAYS days; or through a
//   Premium creator code (20% commission, already its own ledger in /admin/affiliates).
//   The whole programme spends at most PROGRAMME_MONTHLY_CAP_CENTS (A$300) a month.
// • Paid is REAL: the hand-entered cost entries (Costs, category "Creators") whose label
//   names the deal's id in brackets, e.g. "Creator payout [pokechamp]". Every payment is a
//   cost entry with its receipt, the project's rule, so the panel and the profit line agree.
// • Earned is REAL, never estimated: TCGplayer, eBay and Amazon sales whose sub-id carries
//   the creator's marker (`cr` + six letters of their utm_campaign, added on the way out by
//   lib/paid-visit.ts), from the deal's start.
// • Buy clicks and visitors are the analytics' own figures (Vercel / GA4 events by
//   utm_campaign), posted by the daily check to /api/admin/earnings/creator-stats, like
//   the ad tests' figures.
// • The kill rule is code (verdictForDeal): on day TRIAL_DAYS a creator who has not earned
//   KEEP_ROI (1.5x) of what they were paid is cut, and a creator past their trial cap
//   stops accruing until the verdict.

export interface CreatorDeal {
  /** Short id, also the bracket tag in cost labels: "[pokechamp]". */
  id: string;
  /** Their handle as they show it, "@pokechamp__". */
  handle: string;
  platform: "Instagram" | "TikTok" | "YouTube" | "Discord" | "Website" | "X";
  /** Sites the link points at, by label ("DexCompare"). */
  sites: string[];
  /** utm_campaign on every link we gave them; the marker comes from it. */
  utmCampaign: string;
  /** First day (Sydney) their tagged link counts. */
  start: string;
  /** Paid per tracked buy click, in `currency` cents. */
  rateCents: number;
  /** Most we pay in the trial. */
  trialCapCents: number;
  currency: string;
  /** "cut" once the verdict says so (or they leave); "keep" after a passed trial. */
  status: "trial" | "keep" | "cut";
}

export const TRIAL_DAYS = 21;
export const KEEP_ROI = 1.5;
/** The programme's ceiling (owner, 2026-11-20): A$300 a month across every creator. */
export const PROGRAMME_MONTHLY_CAP_CENTS = 30_000;
/** The default offer: A$0.04 per tracked buy click (A$40 per 1,000), A$25 at most in the trial. */
export const DEFAULT_RATE_CENTS = 4;
export const DEFAULT_TRIAL_CAP_CENTS = 2_500;
export const COST_CATEGORY = "Creators";

// One line per signed creator. A deal is added only after the creator says yes in writing.
export const CREATOR_DEALS: readonly CreatorDeal[] = [];

export const markOf = (d: Pick<CreatorDeal, "utmCampaign">): string => creatorMark(d.utmCampaign) ?? "";

/** The creator's own link, tagged. */
export function dealLink(siteUrl: string, d: Pick<CreatorDeal, "platform" | "utmCampaign">, path = "/"): string {
  const u = new URL(path, siteUrl);
  u.searchParams.set("utm_source", d.platform.toLowerCase());
  u.searchParams.set("utm_medium", "creator");
  u.searchParams.set("utm_campaign", d.utmCampaign);
  return u.toString();
}

export interface CreatorStats {
  asOf: string;
  buyClicks: number | null;
  visitors: number | null;
}

export const CREATOR_STATS_KEY = "creator-stats";

const int = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n) : null;
};

/** Pure: validate posted figures; unknown deals and bad numbers are dropped. */
export function parseCreatorStats(body: unknown, deals: readonly CreatorDeal[] = CREATOR_DEALS, now = new Date()): Record<string, CreatorStats> {
  const out: Record<string, CreatorStats> = {};
  const src = (body && typeof body === "object" ? (body as Record<string, unknown>).stats : null) as Record<string, unknown> | null;
  if (!src || typeof src !== "object") return out;
  for (const d of deals) {
    const r = src[d.id] as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") continue;
    const asOf = Date.parse(String(r.asOf ?? ""));
    out[d.id] = {
      asOf: new Date(Number.isFinite(asOf) ? asOf : now.getTime()).toISOString(),
      buyClicks: int(r.buyClicks),
      visitors: int(r.visitors),
    };
  }
  return out;
}

/** Pure: does a cost entry pay this deal? Category "Creators" and "[id]" in the label. */
export const paysDeal = (c: Pick<CostEntry, "label" | "category">, id: string): boolean =>
  c.category.trim().toLowerCase() === COST_CATEGORY.toLowerCase() && c.label.toLowerCase().includes(`[${id.toLowerCase()}]`);

/** Pure: what was paid to a deal up to `today`, in `display`. */
export function paidTo(d: CreatorDeal, costs: readonly CostEntry[], today: string, display: string): number {
  let cents = 0;
  for (const c of costs) if (paysDeal(c, d.id)) for (const day of expandCost(c, today)) cents += toDisplay(day.cents, day.currency, display);
  return cents;
}

/** Pure: everything paid to creators (any "Creators" cost) in the calendar month of `today`, in `display`. */
export function programmeSpentThisMonth(costs: readonly CostEntry[], today: string, display: string): number {
  const month = today.slice(0, 7);
  let cents = 0;
  for (const c of costs) {
    if (c.category.trim().toLowerCase() !== COST_CATEGORY.toLowerCase()) continue;
    for (const day of expandCost(c, today)) if (day.day.startsWith(month)) cents += toDisplay(day.cents, day.currency, display);
  }
  return cents;
}

export interface DealEarned {
  cents: number;
  pendingCents: number;
  sales: number;
}

/** Pure: the sales a creator's visitors made (any site, any network), from the deal's start, in `display`. */
export function earnedByDeal(d: CreatorDeal, tagSources: readonly (readonly TagDay[])[], display: string): DealEarned {
  const mark = markOf(d);
  let cents = 0;
  let pendingCents = 0;
  let sales = 0;
  if (!mark) return { cents, pendingCents, sales };
  for (const rows of tagSources) {
    for (const r of rows) {
      if (r.day < d.start || !hasMark(r.tag, mark)) continue;
      cents += toDisplay(r.cents, r.currency, display);
      pendingCents += toDisplay(r.pendingCents, r.currency, display);
      sales += r.sales;
    }
  }
  return { cents, pendingCents, sales };
}

/** Pure: what the deal has earned the creator so far (clicks × rate, capped in the trial), in the deal's currency. */
export function accruedCents(d: CreatorDeal, buyClicks: number | null): number {
  const raw = (buyClicks ?? 0) * d.rateCents;
  return d.status === "keep" ? raw : Math.min(raw, d.trialCapCents);
}

/** Days since the deal started (day 1 is its first day). */
export function dealDay(d: Pick<CreatorDeal, "start">, today: string): number {
  if (today < d.start) return 0;
  let n = 1;
  while (addDays(d.start, n) <= today && n < 10_000) n++;
  return n;
}

export type DealVerdictKey = "cut" | "keep" | "trial" | "on-track" | "behind";
export interface DealVerdict {
  key: DealVerdictKey;
  label: string;
  /** Earned per dollar paid (1.5 = A$1.50 back per A$1), null before anything is paid. */
  roi: number | null;
}

/** Pure: the kill rule. Amounts in one currency. */
export function verdictForDeal(d: CreatorDeal, day: number, paidCents: number, owedCents: number, earnedCents: number): DealVerdict {
  const cost = paidCents + owedCents;
  const roi = cost > 0 ? earnedCents / cost : null;
  if (d.status === "cut") return { key: "cut", label: "Cut", roi };
  if (d.status === "keep") return roi != null && roi < KEEP_ROI ? { key: "behind", label: `Kept, but under ${KEEP_ROI}x: review`, roi } : { key: "keep", label: "Kept", roi };
  if (day >= TRIAL_DAYS) {
    return cost === 0 || (roi ?? 0) >= KEEP_ROI
      ? { key: "keep", label: `Day ${TRIAL_DAYS}: ${KEEP_ROI}x reached, keep`, roi }
      : { key: "cut", label: `Day ${TRIAL_DAYS}: under ${KEEP_ROI}x, cut`, roi };
  }
  if (cost === 0) return { key: "trial", label: `Trial day ${day} of ${TRIAL_DAYS}`, roi };
  return (roi ?? 0) >= KEEP_ROI
    ? { key: "on-track", label: `Trial day ${day}: on track`, roi }
    : { key: "behind", label: `Trial day ${day}: behind ${KEEP_ROI}x`, roi };
}

export interface CreatorDealRow {
  deal: CreatorDeal;
  mark: string;
  day: number;
  stats: CreatorStats | null;
  earned: DealEarned;
  /** In `display`. */
  paid: number;
  /** Accrued but not yet paid, in `display` (never negative). */
  owed: number;
  verdict: DealVerdict;
}

/** Pure: one row per deal, everything in `display`. */
export function creatorDealRows(
  stats: Record<string, CreatorStats> | null | undefined,
  tagSources: readonly (readonly TagDay[])[],
  costs: readonly CostEntry[],
  today: string,
  display: string,
  deals: readonly CreatorDeal[] = CREATOR_DEALS,
): CreatorDealRow[] {
  return deals.map((deal) => {
    const s = stats?.[deal.id] ?? null;
    const earned = earnedByDeal(deal, tagSources, display);
    const paid = paidTo(deal, costs, today, display);
    const owed = Math.max(0, toDisplay(accruedCents(deal, s?.buyClicks ?? null), deal.currency, display) - paid);
    const day = dealDay(deal, today);
    return { deal, mark: markOf(deal), day, stats: s, earned, paid, owed, verdict: verdictForDeal(deal, day, paid, owed, earned.cents) };
  });
}
