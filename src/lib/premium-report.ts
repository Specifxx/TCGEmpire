// The PREMIUM section of the private growth report (Premium team, 2026-11-26;
// /mnt/project-files/ops/premium/playbook.md). The team's two numbers (new
// Premium starts a week, paying subscribers) were readable only on
// /admin/subscriptions behind the owner's sign-in; the growth report already
// reaches the business inbox the agents read, so the counts ride in it.
// Counts and money totals only: never an email, a name or a customer id.
import type { SubscriptionMetrics } from "./subscription-metrics";
import { formatMoney } from "./format";

export function premiumReportSection(
  m: SubscriptionMetrics | null,
  opts: { entitled: number | null; capped?: boolean; error?: boolean } = { entitled: null },
): string {
  const title = "PREMIUM (Stripe, every site; counts only)";
  if (opts.error) return `${title}\n  Could not read Stripe this run.`;
  if (!m) return `${title}\n  Not connected (STRIPE_SECRET_KEY).`;
  const cur = m.currency.toUpperCase();
  const pct = (v: number | null) => (v == null ? "n/a" : `${v.toFixed(0)}%`);
  return [
    title,
    `  Paying now: ${m.active} (monthly ${m.monthlyActive}, yearly ${m.annualActive}) | in trial: ${m.trialing}`,
    `  New subscriptions, last 7 days: ${m.new7} | last 30 days: ${m.new30} | ended, last 30 days: ${m.churned30}`,
    `  Trials started: ${m.trialsStarted} | converted: ${m.trialsConverted} (${pct(m.trialConvPct)})`,
    `  MRR: ${formatMoney(m.mrrCents, cur)} | ARR: ${formatMoney(m.arrCents, cur)}`,
    ...(opts.entitled != null ? [`  Accounts with Premium today (incl. trials, comps, promos): ${opts.entitled}`] : []),
    ...(opts.capped ? ["  (Stripe list capped: counts are a floor)"] : []),
  ].join("\n");
}
