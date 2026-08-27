// Subscription analytics for RiftCompare Premium — the numbers you cannot scale a
// subscription without: MRR/ARR, active vs trialing, plan mix, new vs churned,
// an estimated monthly churn rate, a rough LTV, trial→paid conversion, and a
// signup-month cohort-retention table.
//
// STRIPE IS THE SOURCE OF TRUTH here, not User.premiumUntil — only Stripe knows
// the plan, the amount, the currency, and the real cancel/renew history. The
// impure fetch (fetchAllSubscriptions) is kept out of the pure compute
// (computeSubscriptionMetrics) so the maths is unit-testable without a live
// account.

import type Stripe from "stripe";
import { stripe } from "./stripe";

// A Stripe subscription flattened to just what the metrics need — the shape the
// pure function below operates on, so a test can build rows by hand.
export interface SubRow {
  status: Stripe.Subscription.Status;
  interval: "day" | "week" | "month" | "year" | null;
  unitAmount: number; // minor units (cents), per `currency`
  currency: string; // lowercase ISO, e.g. "usd"
  createdMs: number;
  canceledAtMs: number | null;
  endedAtMs: number | null;
  trialEndMs: number | null;
}

const DAY = 86_400_000;

// Normalise one Stripe subscription (with its price expanded) to a SubRow.
export function toSubRow(sub: Stripe.Subscription): SubRow {
  const item = sub.items?.data?.[0];
  const price = item?.price as Stripe.Price | undefined;
  return {
    status: sub.status,
    interval: (price?.recurring?.interval as SubRow["interval"]) ?? null,
    unitAmount: price?.unit_amount ?? 0,
    currency: (price?.currency ?? "usd").toLowerCase(),
    createdMs: sub.created * 1000,
    canceledAtMs: sub.canceled_at ? sub.canceled_at * 1000 : null,
    endedAtMs: sub.ended_at ? sub.ended_at * 1000 : null,
    trialEndMs: sub.trial_end ? sub.trial_end * 1000 : null,
  };
}

// Per-copy monthly value, so a yearly plan contributes 1/12 of its price to MRR.
export function monthlyValueCents(row: Pick<SubRow, "interval" | "unitAmount">): number {
  switch (row.interval) {
    case "year":
      return Math.round(row.unitAmount / 12);
    case "month":
      return row.unitAmount;
    case "week":
      return Math.round((row.unitAmount * 52) / 12);
    case "day":
      return Math.round((row.unitAmount * 365) / 12);
    default:
      return 0;
  }
}

export interface CurrencyBlock {
  currency: string;
  active: number;
  monthlyActive: number;
  annualActive: number;
  mrrCents: number;
}

export interface CohortRow {
  month: string; // "YYYY-MM"
  started: number;
  active: number;
  retentionPct: number;
}

export interface SubscriptionMetrics {
  total: number; // rows considered
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  new7: number;
  new30: number;
  churned30: number;
  churnRatePct: number | null; // monthly, estimate; null when there's nothing to divide by
  // Money is reported in the DOMINANT currency (most active subs). Mixed-currency
  // accounts also get the full per-currency breakdown so nothing is silently
  // summed across currencies.
  currency: string;
  mrrCents: number;
  arrCents: number;
  arpuCents: number;
  monthlyActive: number;
  annualActive: number;
  ltvCents: number | null; // ARPU / churn — estimate; null when churn is 0/unknown
  trialsStarted: number;
  trialsConverted: number;
  trialConvPct: number | null;
  byCurrency: CurrencyBlock[];
  cohorts: CohortRow[];
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// True for a subscription that is live right now (billing or in a paid-committed
// state). `trialing` is counted separately, not as active MRR.
function isActive(s: Stripe.Subscription.Status): boolean {
  return s === "active" || s === "past_due";
}

export function computeSubscriptionMetrics(rows: SubRow[], nowMs: number, cohortMonths = 12): SubscriptionMetrics {
  const active = rows.filter((r) => isActive(r.status));
  const trialing = rows.filter((r) => r.status === "trialing");

  // Money, grouped by currency so nothing is added across currencies.
  const curMap = new Map<string, CurrencyBlock>();
  for (const r of active) {
    const b =
      curMap.get(r.currency) ??
      { currency: r.currency, active: 0, monthlyActive: 0, annualActive: 0, mrrCents: 0 };
    b.active += 1;
    if (r.interval === "year") b.annualActive += 1;
    else if (r.interval === "month") b.monthlyActive += 1;
    b.mrrCents += monthlyValueCents(r);
    curMap.set(r.currency, b);
  }
  const byCurrency = [...curMap.values()].sort((a, b) => b.active - a.active);
  const head = byCurrency[0] ?? { currency: "usd", active: 0, monthlyActive: 0, annualActive: 0, mrrCents: 0 };

  const new7 = rows.filter((r) => nowMs - r.createdMs <= 7 * DAY).length;
  const new30 = rows.filter((r) => nowMs - r.createdMs <= 30 * DAY).length;

  // Churned in the last 30d: a subscription that reached a terminal state
  // (canceled/ended) within the window. Uses whichever terminal stamp it has.
  const churned30 = rows.filter((r) => {
    const end = r.endedAtMs ?? (r.status === "canceled" ? r.canceledAtMs : null);
    return end != null && nowMs - end <= 30 * DAY;
  }).length;

  // Monthly churn ≈ churned / (still-active + churned). A denominator of 0 (no
  // subs at all) yields null rather than a fake 0%.
  const churnDenom = head.active + churned30;
  const churnRatePct = churnDenom > 0 ? (churned30 / churnDenom) * 100 : null;

  const arpuCents = head.active > 0 ? Math.round(head.mrrCents / head.active) : 0;
  const ltvCents = churnRatePct && churnRatePct > 0 ? Math.round(arpuCents / (churnRatePct / 100)) : null;

  // Trial → paid: of the subs that ever had a trial, how many made it to a live
  // paying state after the trial ended.
  const trialed = rows.filter((r) => r.trialEndMs != null);
  const trialsStarted = trialed.length;
  const trialsConverted = trialed.filter((r) => r.trialEndMs! <= nowMs && isActive(r.status)).length;
  const trialConvPct = trialsStarted > 0 ? (trialsConverted / trialsStarted) * 100 : null;

  // Cohort retention by signup month — the single clearest read on whether the
  // bucket holds.
  const cohortMap = new Map<string, { started: number; active: number }>();
  for (const r of rows) {
    const k = monthKey(r.createdMs);
    const c = cohortMap.get(k) ?? { started: 0, active: 0 };
    c.started += 1;
    if (isActive(r.status) || r.status === "trialing") c.active += 1;
    cohortMap.set(k, c);
  }
  const cohorts: CohortRow[] = [...cohortMap.entries()]
    .map(([month, c]) => ({ month, started: c.started, active: c.active, retentionPct: c.started > 0 ? (c.active / c.started) * 100 : 0 }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, cohortMonths);

  return {
    total: rows.length,
    active: head.active,
    trialing: trialing.length,
    pastDue: rows.filter((r) => r.status === "past_due").length,
    canceled: rows.filter((r) => r.status === "canceled").length,
    new7,
    new30,
    churned30,
    churnRatePct,
    currency: head.currency,
    mrrCents: head.mrrCents,
    arrCents: head.mrrCents * 12,
    arpuCents,
    monthlyActive: head.monthlyActive,
    annualActive: head.annualActive,
    ltvCents,
    trialsStarted,
    trialsConverted,
    trialConvPct,
    byCurrency,
    cohorts,
  };
}

// Impure: page through every subscription in the account (price expanded so the
// plan/amount are present). Capped so a runaway account can't hang the admin
// page; the cap is reported to the caller.
export async function fetchAllSubscriptions(maxPages = 20): Promise<{ rows: SubRow[]; capped: boolean }> {
  const rows: SubRow[] = [];
  let startingAfter: string | undefined;
  let capped = false;
  for (let i = 0; i < maxPages; i++) {
    const page: Stripe.ApiList<Stripe.Subscription> = await stripe().subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const sub of page.data) rows.push(toSubRow(sub));
    if (!page.has_more || page.data.length === 0) return { rows, capped };
    startingAfter = page.data[page.data.length - 1].id;
    if (i === maxPages - 1) capped = true;
  }
  return { rows, capped };
}
