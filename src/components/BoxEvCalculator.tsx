"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

// Box EV explorer. RiftCompare supplies the half nobody else has — live average
// singles prices per rarity — and the player supplies the pack structure (pull
// rates vary by printing and aren't officially published, so the defaults are
// clearly-labelled starting points, not claims).
export interface SetRarityData {
  setCode: string;
  setName: string;
  // avg lowest in-stock price per rarity (cents) + how many distinct cards back it
  rarities: Record<string, { avgCents: number; count: number }>;
}

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Showcase"];
// Editable starting assumptions (per pack). Deliberately conservative and clearly
// labelled in the UI as estimates to tune against the printed pack breakdown.
const DEFAULT_RATES: Record<string, number> = {
  Common: 7,
  Uncommon: 3,
  Rare: 1,
  Epic: 0.25,
  Showcase: 0.08,
};
const DEFAULT_PACKS = 24;

export function BoxEvCalculator({ sets, currency }: { sets: SetRarityData[]; currency: string }) {
  const [setCode, setSetCode] = useState(sets[0]?.setCode ?? "");
  const [packs, setPacks] = useState(DEFAULT_PACKS);
  const [rates, setRates] = useState<Record<string, number>>({ ...DEFAULT_RATES });
  const [boxPrice, setBoxPrice] = useState("");

  const set = sets.find((s) => s.setCode === setCode) ?? sets[0];

  const calc = useMemo(() => {
    if (!set) return null;
    let evPackCents = 0;
    const lines = RARITY_ORDER.filter((r) => set.rarities[r]).map((r) => {
      const rate = Math.max(0, rates[r] ?? 0);
      const avg = set.rarities[r].avgCents;
      const contribution = rate * avg;
      evPackCents += contribution;
      return { rarity: r, rate, avgCents: avg, contributionCents: Math.round(contribution), count: set.rarities[r].count };
    });
    const evBoxCents = Math.round(evPackCents * Math.max(1, packs));
    const priceCents = Math.round((parseFloat(boxPrice) || 0) * 100);
    const ratio = priceCents > 0 ? evBoxCents / priceCents : null;
    return { lines, evPackCents: Math.round(evPackCents), evBoxCents, priceCents, ratio };
  }, [set, rates, packs, boxPrice]);

  if (!set || !calc) return null;

  const verdict =
    calc.ratio == null
      ? null
      : calc.ratio >= 1.1
        ? { text: "EV-positive at that price — opening beats buying singles on raw value (variance still applies!).", tone: "text-brand-300", emoji: "🔥" }
        : calc.ratio >= 0.85
          ? { text: "Roughly break-even — open for the fun, not the value.", tone: "text-gold", emoji: "⚖️" }
          : { text: "Well below EV — buying the singles you want is cheaper than ripping packs.", tone: "text-rose-300", emoji: "✋" };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card-surface p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Set</span>
            <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className="input">
              {sets.map((s) => (
                <option key={s.setCode} value={s.setCode}>{s.setName} ({s.setCode})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Packs per box</span>
            <input
              type="number" min={1} max={100} value={packs}
              onChange={(e) => setPacks(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Box price ({currency}) — optional</span>
            <input
              type="number" min="0" step="0.01" value={boxPrice}
              onChange={(e) => setBoxPrice(e.target.value)}
              placeholder="e.g. 180.00"
              className="input"
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pulls per pack (editable)</span>
            <button onClick={() => setRates({ ...DEFAULT_RATES })} className="text-[11px] text-brand-400 hover:underline">reset</button>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Starting estimates — official per-pack odds aren&apos;t published, so tune these to the
            printed pack breakdown on your box. Fractions are fine (0.25 = one in four packs).
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {RARITY_ORDER.filter((r) => set.rarities[r]).map((r) => (
              <label key={r} className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">{r}</span>
                <input
                  type="number" min="0" step="0.01" value={rates[r] ?? 0}
                  onChange={(e) => setRates((cur) => ({ ...cur, [r]: Math.max(0, Number(e.target.value) || 0) }))}
                  className="input py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Expected value per box</div>
            <div className="font-display text-4xl font-extrabold text-white">{formatMoney(calc.evBoxCents, currency)}</div>
            <div className="mt-0.5 text-xs text-slate-500">≈ {formatMoney(calc.evPackCents, currency)} per pack · {packs} packs</div>
          </div>
          {calc.ratio != null && (
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">EV ÷ box price</div>
              <div className={`text-3xl font-extrabold ${calc.ratio >= 1 ? "text-brand-400" : "text-rose-400"}`}>
                {(calc.ratio * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>
        {verdict && (
          <p className={`mt-3 text-sm font-semibold ${verdict.tone}`}>
            {verdict.emoji} {verdict.text}
          </p>
        )}

        {/* Breakdown */}
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-2 font-semibold">Rarity</th>
              <th className="py-2 text-right font-semibold">Live avg price</th>
              <th className="py-2 text-right font-semibold">Per pack</th>
              <th className="py-2 text-right font-semibold">EV / pack</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {calc.lines.map((l) => (
              <tr key={l.rarity}>
                <td className="py-2 font-semibold text-white">
                  {l.rarity} <span className="text-[10px] font-normal text-slate-600">({l.count} priced cards)</span>
                </td>
                <td className="py-2 text-right text-slate-300">{formatMoney(l.avgCents, currency)}</td>
                <td className="py-2 text-right text-slate-300">×{l.rate}</td>
                <td className="py-2 text-right font-semibold text-accent">{formatMoney(l.contributionCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          Average prices are the live lowest in-stock price of every priced {set.setCode} card per
          rarity, in your market — refreshed daily. EV is an average across many boxes: any single
          box can run hot or cold. Want a specific card? <Link href="/browse" className="text-brand-400 hover:underline">Buying the single</Link> is
          almost always the surer play. Compare live box prices on the <Link href="/sealed" className="text-brand-400 hover:underline">sealed page</Link>.
        </p>
      </div>
    </div>
  );
}
