"use client";

import { useRouter } from "next/navigation";
import { COUNTRY_LIST } from "@/lib/country";

// Region picker for the RiftCompare Index page. Defaults to the GLOBAL composite;
// choosing a region reloads /market?market=XX with that market's own index.
//
// `basePath` and `includeGlobal` exist for /market/records, which reuses this
// control but cannot honour a global option: a record is a price in ONE market's
// own currency, so "all markets" has no meaning there — an all-time high of
// A$180 and one of US$120 do not combine into a number worth printing. Rather
// than let the page silently coerce GLOBAL to a default market (a switcher whose
// selection is ignored is worse than one without the option), the option is
// simply not offered.
const REGION_OPTIONS = COUNTRY_LIST.map((c) => ({ value: c.code, label: `${c.flag} ${c.label}` }));
const GLOBAL_OPTION = { value: "GLOBAL", label: "🌍 Global (all markets)" };

export function MarketSwitcher({
  value,
  basePath = "/market",
  includeGlobal = true,
  label = "Choose the market the Index tracks",
}: {
  value: string;
  basePath?: string;
  includeGlobal?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const options = includeGlobal ? [GLOBAL_OPTION, ...REGION_OPTIONS] : REGION_OPTIONS;
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className="font-semibold uppercase tracking-wide">Market</span>
      <select
        value={value}
        onChange={(e) => router.push(`${basePath}?market=${e.target.value}`)}
        aria-label={label}
        className="min-h-11 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm font-medium text-slate-100 hover:bg-ink-800 focus:border-brand-500 focus:outline-none sm:min-h-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
