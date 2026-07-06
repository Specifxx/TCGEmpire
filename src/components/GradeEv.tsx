"use client";

import { useMemo, useState } from "react";
import { formatMoney, dollarsToCents } from "@/lib/format";
import { computeGradeEv } from "@/lib/grade-ev";
import { GRADING_TIERS } from "@/lib/net-proceeds";
import { USD_TO } from "@/lib/fx";
import { useCountry } from "./CountryProvider";

// "Should I grade this?" calculator. Raw value → expected graded value across
// gem-mint / 9 / other outcomes, net of grading cost, with a plain verdict.
export function GradeEv({ initialRawCents }: { initialRawCents?: number | null }) {
  const { currency } = useCountry();
  const [rawStr, setRawStr] = useState(initialRawCents != null ? (initialRawCents / 100).toFixed(2) : "");
  // PSA-10 defaults to the community "3× rule"; PSA-9 to ~1.4× raw. Both editable.
  const [mult10, setMult10] = useState("3");
  const [mult9, setMult9] = useState("1.4");
  const [odds10, setOdds10] = useState(35); // %
  const [odds9, setOdds9] = useState(40); // %
  const [tierKey, setTierKey] = useState("value");

  const raw = dollarsToCents(rawStr || "0");
  const tier = GRADING_TIERS.find((t) => t.key === tierKey) ?? GRADING_TIERS[1];
  const gradingCost = Math.round(tier.usdCents * (USD_TO[currency] ?? 1));

  const result = useMemo(
    () =>
      computeGradeEv({
        rawCents: raw,
        psa10Cents: Math.round(raw * (parseFloat(mult10) || 0)),
        psa9Cents: Math.round(raw * (parseFloat(mult9) || 0)),
        oddsOf10: odds10 / 100,
        oddsOf9: odds9 / 100,
        gradingCostCents: gradingCost,
      }),
    [raw, mult10, mult9, odds10, odds9, gradingCost]
  );

  const verdict = result.verdict;
  const vColor =
    verdict === "grade" ? "text-emerald-400" : verdict === "skip" ? "text-red-400" : "text-gold";
  const vLabel = verdict === "grade" ? "✓ Worth grading" : verdict === "skip" ? "✕ Sell it raw" : "~ Borderline";

  return (
    <div className="card-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Raw value now</span>
          <input inputMode="decimal" value={rawStr} onChange={(e) => setRawStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="input" aria-label="Raw value" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Grading tier</span>
          <select value={tierKey} onChange={(e) => setTierKey(e.target.value)} className="input" aria-label="Grading tier">
            {GRADING_TIERS.filter((t) => t.key !== "none").map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">PSA 10 = raw ×</span>
          <input inputMode="decimal" value={mult10} onChange={(e) => setMult10(e.target.value.replace(/[^0-9.]/g, ""))} className="input" aria-label="PSA 10 multiplier" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">PSA 9 = raw ×</span>
          <input inputMode="decimal" value={mult9} onChange={(e) => setMult9(e.target.value.replace(/[^0-9.]/g, ""))} className="input" aria-label="PSA 9 multiplier" />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Slider label={`Chance of a 10: ${odds10}%`} value={odds10} onChange={setOdds10} />
        <Slider label={`Chance of a 9: ${odds9}%`} value={odds9} onChange={setOdds9} />
      </div>

      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verdict</div>
            <div className={`text-2xl font-extrabold ${vColor}`}>{vLabel}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected value graded</div>
            <div className="num text-2xl font-extrabold text-white">{raw > 0 ? formatMoney(result.evGradedCents, currency) : "—"}</div>
            {raw > 0 && (
              <div className={`num text-xs ${result.upliftCents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {result.upliftCents >= 0 ? "+" : ""}{formatMoney(result.upliftCents, currency)} vs raw
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{result.reason}</p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        The odds of a gem-mint 10 are yours to judge — condition, centring and the grader all matter,
        and this can&apos;t see your card. Treat the verdict as a sanity check, not a guarantee. Grading
        cost is billed in USD; shown converted at an indicative rate.
      </p>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
        aria-label={label}
      />
    </label>
  );
}
