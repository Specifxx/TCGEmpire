import Link from "next/link";
import type { HistoryDepth } from "@/lib/price-history";

// The empty state for a screener that needs several days of price history.
//
// It distinguishes the two genuinely different reasons these tools come back
// empty, which the previous copy conflated:
//
//   1. NOT ENOUGH HISTORY — the PriceHistory table doesn't yet hold `needed`
//      days for this market, so no card could possibly qualify. Nothing about
//      the market has been measured, so saying anything about it would be a
//      claim we can't support.
//   2. ENOUGH HISTORY, NOTHING QUALIFIED — a real, reportable market verdict.
//
// Case 1 is not hypothetical or rare: PriceHistory lives in its own Neon
// project (lib/db-history.ts) that gets re-pointed whenever its free-tier
// allowance is exhausted, and each cutover restarts the new project at zero
// rows until the bulk copy runs. Every consumer with a multi-day minimum goes
// blank for days while the 2-day ones keep working — so the failure reads as
// "the tool is broken" unless the page says otherwise.
export function HistoryGapNotice({
  depth,
  needed,
  marketLabel,
  // What a fully-populated screen would have concluded — shown only when the
  // history is actually deep enough for that conclusion to mean something.
  emptyVerdict,
}: {
  depth: HistoryDepth;
  needed: number;
  marketLabel: string;
  emptyVerdict: string;
}) {
  const short = depth.days < needed;
  return (
    <div className="card-surface grid place-items-center p-12 text-center">
      {short ? (
        <div className="max-w-md">
          <p className="text-sm font-bold text-white">Not enough price history yet</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            This screen compares each card against its own recent history, which needs{" "}
            <strong className="text-slate-200">{needed} days</strong> of daily snapshots.{" "}
            {depth.days === 0 ? (
              <>No daily snapshots are recorded for {marketLabel} yet.</>
            ) : (
              <>
                So far{" "}
                <strong className="text-slate-200">
                  {depth.days} {depth.days === 1 ? "day is" : "days are"}
                </strong>{" "}
                recorded for {marketLabel}
                {depth.firstDay ? <>, starting {depth.firstDay}</> : null}.
              </>
            )}{" "}
            It fills in automatically — one snapshot per day with the daily price import.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/movers" className="btn-primary text-sm">
              See price movers instead →
            </Link>
            <Link href="/browse" className="btn-ghost text-sm">
              Browse the database
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            Price movers works on a shorter window, so it still has enough data today.
          </p>
        </div>
      ) : (
        <p className="max-w-md text-sm text-slate-400">{emptyVerdict}</p>
      )}
    </div>
  );
}
