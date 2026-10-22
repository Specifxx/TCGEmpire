import { creatorPayoutCents, formatMoney } from "@/lib/creator-payout";

export interface EarningsRow {
  month: string;
  visits: number;
  buyClicks: number;
  totals: { totalVisitors: number; affiliateRevenueCents: number; sharePct: number; currency: string } | null;
}

// A creator's traffic and payout by month. Shown to the creator on their private
// edit page and to the owner at /admin/creators.
export function CreatorEarnings({ rows }: { rows: EarningsRow[] }) {
  if (!rows.length) return <p className="text-sm text-slate-400">No visitors through your link yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="py-1">Month (UTC)</th>
          <th>Visitors</th>
          <th>Buy clicks</th>
          <th>Share of traffic</th>
          <th>Payout</th>
        </tr>
      </thead>
      <tbody className="text-slate-200">
        {rows.map((r) => (
          <tr key={r.month} className="border-t border-ink-800">
            <td className="py-1.5">{r.month}</td>
            <td className="num">{r.visits.toLocaleString()}</td>
            <td className="num">{r.buyClicks.toLocaleString()}</td>
            <td className="num">{r.totals?.totalVisitors ? `${((Math.min(1, r.visits / r.totals.totalVisitors)) * 100).toFixed(1)}%` : "—"}</td>
            <td className="num">{r.totals ? formatMoney(creatorPayoutCents(r.visits, r.totals), r.totals.currency) : "Pending month end"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
