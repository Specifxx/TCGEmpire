"use client";

import { useRouter } from "next/navigation";
import { COUNTRY_LIST } from "@/lib/country";

// Region picker for the RiftCompare Index page. Defaults to the GLOBAL composite;
// choosing a region reloads /market?market=XX with that market's own index.
const OPTIONS = [
  { value: "GLOBAL", label: "🌍 Global (all markets)" },
  ...COUNTRY_LIST.map((c) => ({ value: c.code, label: `${c.flag} ${c.label}` })),
];

export function MarketSwitcher({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className="font-semibold uppercase tracking-wide">Market</span>
      <select
        value={value}
        onChange={(e) => router.push(`/market?market=${e.target.value}`)}
        aria-label="Choose the market the Index tracks"
        className="min-h-11 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm font-medium text-slate-100 hover:bg-ink-800 focus:border-brand-500 focus:outline-none sm:min-h-0"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
