import { prisma } from "@/lib/db";
import { rollUpByMonth } from "@/lib/creator-payout";
import type { EarningsRow } from "@/components/creators/CreatorEarnings";

/** Every creator's monthly earnings rows (the last 12 months), keyed by slug. */
export async function creatorEarnings(): Promise<Map<string, EarningsRow[]>> {
  const since = new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const [stats, months] = await Promise.all([
    prisma.creatorDailyStat.findMany({ where: { day: { gte: since } } }),
    prisma.creatorPayoutMonth.findMany(),
  ]);
  const totals = new Map(months.map((m) => [m.month, m]));
  const out = new Map<string, EarningsRow[]>();
  for (const [month, bySlug] of rollUpByMonth(stats)) {
    for (const [slug, s] of bySlug) {
      const t = totals.get(month);
      const row: EarningsRow = { month, ...s, totals: t ? { totalVisitors: t.totalVisitors, affiliateRevenueCents: t.affiliateRevenueCents, sharePct: t.sharePct, currency: t.currency } : null };
      out.set(slug, [...(out.get(slug) ?? []), row]);
    }
  }
  return out;
}
