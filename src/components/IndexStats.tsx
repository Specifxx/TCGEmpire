import { formatMoney, formatMoneyCompact } from "@/lib/format";
import type { MarketIndex } from "@/lib/market-index";

// The "key statistics" panel for the RiftCompare Index — the stats a real market
// reports: market cap, average/median price, the period range (52-week-style),
// breadth (advancers vs decliners) and realised volatility. Server component.
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/60 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-0.5 text-lg font-extrabold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function IndexStats({ index }: { index: MarketIndex }) {
  const s = index.stats;
  const cur = index.currency;
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Key statistics</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Market cap"
          value={formatMoneyCompact(s.marketCapCents, cur)}
          sub={`${s.constituentCount} cards`}
        />
        <Stat
          label="Avg card"
          value={formatMoney(s.avgPriceCents, cur)}
          sub={`median ${formatMoney(s.medianPriceCents, cur)}`}
        />
        <Stat
          label="Range"
          value={`${s.low.toFixed(1)}–${s.high.toFixed(1)}`}
          sub={`since ${index.startDay}`}
        />
        <Stat
          label="Advancing"
          value={String(s.advancing)}
          sub="up over 7 days"
          tone={s.advancing > 0 ? "up" : undefined}
        />
        <Stat
          label="Declining"
          value={String(s.declining)}
          sub="down over 7 days"
          tone={s.declining > 0 ? "down" : undefined}
        />
        <Stat
          label="Volatility"
          value={s.volatilityPct == null ? "—" : `${s.volatilityPct.toFixed(2)}%`}
          sub="30-day, daily"
        />
      </div>
    </div>
  );
}
