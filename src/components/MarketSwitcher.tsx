"use client";

import { useRouter } from "next/navigation";
import { COUNTRY_LIST } from "@/lib/country";

// Region picker for the RiftCompare Index page (defaults to US — see
// market-index.ts's getMarketIndex) and for /market/records, which reuses
// this same control. Choosing a region reloads `${basePath}?market=XX` with
// that market's own index/records.
const REGION_OPTIONS = COUNTRY_LIST.map((c) => ({ value: c.code, label: `${c.flag} ${c.label}` }));

export function MarketSwitcher({
  value,
  basePath = "/market",
  label = "Choose the market the Index tracks",
}: {
  value: string;
  basePath?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className="font-semibold uppercase tracking-wide">Market</span>
      <select
        value={value}
        onChange={(e) => router.push(`${basePath}?market=${e.target.value}`)}
        aria-label={label}
        className="min-h-11 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm font-medium text-slate-100 hover:bg-ink-800 focus:border-brand-500 focus:outline-none sm:min-h-0"
      >
        {REGION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
