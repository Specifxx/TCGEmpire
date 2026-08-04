"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { convertUsdCents, USD_TO } from "@/lib/fx";
import { useCountry } from "@/components/CountryProvider";
import { CardImage } from "@/components/CardImage";
import {
  computeEv,
  derivedRates,
  isChasePool,
  oneInPacks,
  poolStatsFromPools,
  verdictFor,
  DEFAULT_PACKS,
  DEFAULT_SPECIALS_PER_BOX,
  POOL_LABEL,
  type PoolKey,
} from "@/lib/box-ev";

// Box EV explorer. RiftCompare supplies the half nobody else has — a real market
// price for every card in the set, including the chase prints — and the player
// supplies the pack structure, because Riot has never published pull rates.
//
// EVERYTHING ARRIVES IN USD and is converted once, here, for display. The server
// render is country-agnostic (that is what lets the page be ISR-cached), and
// useCountry() reconciles to the visitor's currency after mount.

export interface PullCard {
  id: string;
  slug: string;
  name: string;
  rarity: string;
  collectorNumber: string;
  usdCents: number | null;
  /** Priced off a foil-only TCGplayer row — a different product from a base pull. */
  foil: boolean;
  imageThumbUrl: string | null;
  orientation: string | null;
}

export interface BoxEvPool {
  pool: PoolKey;
  avgUsdCents: number;
  topUsdCents: number;
  priced: number;
  total: number;
  top: PullCard[];
}

export interface BoxEvSet {
  setCode: string;
  setName: string;
  pools: BoxEvPool[];
}

export function BoxEvCalculator({ sets }: { sets: BoxEvSet[] }) {
  const { currency } = useCountry();
  const [setCode, setSetCode] = useState(sets[0]?.setCode ?? "");
  const [packs, setPacks] = useState(DEFAULT_PACKS);
  const [specialsPerBox, setSpecialsPerBox] = useState(DEFAULT_SPECIALS_PER_BOX);
  const [boxPrice, setBoxPrice] = useState("");
  const [overrides, setOverrides] = useState<Partial<Record<PoolKey, number>>>({});
  const [showRates, setShowRates] = useState(false);

  const set = sets.find((s) => s.setCode === setCode) ?? sets[0];

  // Local display helpers. `fx` is the multiplier actually applied, printed in
  // the disclosure so the conversion is auditable rather than a black box.
  const fx = USD_TO[currency] ?? 1;
  const money = (usdCents: number) => formatMoney(convertUsdCents(usdCents, currency), currency);
  const usd = (usdCents: number) => formatMoney(usdCents, "USD");

  const calc = useMemo(() => {
    if (!set) return null;
    const stats = poolStatsFromPools(set.pools);
    const counts = new Map<PoolKey, number>(set.pools.map((p) => [p.pool, p.total]));
    const base = derivedRates({ counts, packs, specialsPerBox });
    const rates = { ...base, ...overrides };
    const priceCents = Math.round((parseFloat(boxPrice) || 0) * 100);
    // The box price is typed in the DISPLAY currency; the model works in USD, so
    // convert back rather than comparing two different currencies.
    const priceUsdCents = fx > 0 ? Math.round(priceCents / fx) : 0;
    return { ...computeEv({ stats, rates, packs, boxPriceCents: priceUsdCents }), rates, base };
  }, [set, packs, specialsPerBox, overrides, boxPrice, fx]);

  if (!set || !calc) return null;

  const verdict = verdictFor(calc.ratio);
  const chaseLines = calc.lines.filter((l) => isChasePool(l.pool));
  const chaseShare = chaseLines.reduce((a, l) => a + l.share, 0);
  const poolByKey = new Map(set.pools.map((p) => [p.pool, p]));

  return (
    <div className="space-y-4">
      {/* ── Headline: the number, and how it lands against a real box price ── */}
      <div className="card-surface overflow-hidden">
        <div className="border-b border-ink-800 bg-ink-900/60 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Expected value per box
              </div>
              <div className="num font-display text-5xl font-extrabold leading-none text-white">
                {money(calc.evBoxCents)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {currency !== "USD" && <>≈ {usd(calc.evBoxCents)} · </>}
                {money(calc.evPackCents)} per pack · {packs} packs
              </div>
            </div>

            {calc.ratio != null && (
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Return on box price</div>
                <div
                  className={`num text-4xl font-extrabold leading-none ${
                    calc.ratio >= 1 ? "text-up" : calc.ratio >= 0.85 ? "text-gold" : "text-down"
                  }`}
                >
                  {(calc.ratio * 100).toFixed(0)}%
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {calc.ratio >= 1 ? "+" : ""}
                  {money(calc.evBoxCents - calc.priceCents)} vs price
                </div>
              </div>
            )}
          </div>

          {/* EV-vs-price bar. The visual question this page exists to answer is
              "does the bar clear the line", so draw exactly that. */}
          {calc.ratio != null && (
            <div className="mt-4">
              <div className="relative h-3 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    calc.ratio >= 1 ? "bg-up" : calc.ratio >= 0.85 ? "bg-gold" : "bg-down"
                  }`}
                  style={{ width: `${Math.min(100, (calc.ratio / 1.5) * 100)}%` }}
                />
                {/* Break-even marker at 100% of a 150%-wide track. */}
                <div className="absolute inset-y-0 left-[66.67%] w-px bg-slate-400/70" aria-hidden />
              </div>
              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-600">
                <span>0%</span>
                <span className="text-slate-400">break even</span>
                <span>150%</span>
              </div>
            </div>
          )}

          {verdict && (
            <p
              className={`mt-3 text-sm font-semibold ${
                verdict.tone === "up" ? "text-up" : verdict.tone === "flat" ? "text-gold" : "text-down"
              }`}
            >
              {verdict.emoji} {verdict.text}
            </p>
          )}
        </div>

        {/* Inputs */}
        <div className="grid gap-3 p-5 sm:grid-cols-3">
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
            <span className="mb-1 block text-xs font-medium text-slate-400">Box price ({currency})</span>
            <input
              type="number" min="0" step="0.01" value={boxPrice}
              onChange={(e) => setBoxPrice(e.target.value)}
              placeholder="what you'd pay"
              className="input"
            />
          </label>
        </div>
      </div>

      {/* ── Where the value sits ─────────────────────────────────────────────
          One proportional bar per pool. This is the whole story of a box in a
          single glance: bulk contributes a wide flat band, the chase tiers a
          thin bright one. */}
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-white">Where the value sits</h2>
          <span className="text-xs text-slate-500">
            chase prints are <span className="num font-semibold text-brand-300">{(chaseShare * 100).toFixed(1)}%</span> of EV
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {calc.lines.map((l) => {
            const p = poolByKey.get(l.pool);
            const coverage = l.total > 0 ? l.priced / l.total : 0;
            return (
              <div key={l.pool}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    {POOL_LABEL[l.pool]}
                    {l.chase && (
                      <span className="chip bg-brand-500/15 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                        chase
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-sm font-bold text-accent">{money(l.contributionCents)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={`h-full rounded-full ${l.chase ? "bg-brand-400" : "bg-slate-600"}`}
                    style={{ width: `${Math.max(l.share * 100, l.contributionCents > 0 ? 1.5 : 0)}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  <span className="num">{money(l.avgCents)} avg</span>
                  <span aria-hidden>·</span>
                  <span>{oneInPacks(l.rate) ?? `${l.rate}× per pack`}</span>
                  <span aria-hidden>·</span>
                  <span className={coverage < 0.5 ? "text-gold" : undefined}>
                    {l.priced}/{l.total} priced
                    {coverage < 0.5 && l.total > 0 && " — understated"}
                  </span>
                  {p && p.topUsdCents > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>top {money(p.topUsdCents)}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
          A pool&apos;s average divides by <em>every</em> card in it, so cards with no market price count as
          zero — which is honest for genuine bulk, but means a pool showing low coverage is
          <strong className="text-slate-500"> understating</strong> its true contribution, never overstating it.
          Implied pack size: <span className="num text-slate-500">{calc.cardsPerPack.toFixed(2)}</span> cards.
        </p>
      </div>

      {/* ── Pull rates ──────────────────────────────────────────────────────
          Collapsed by default. Riot publishes nothing, so this is the assumption
          panel, and it says so plainly. */}
      <div className="card-surface p-5">
        <button
          type="button"
          onClick={() => setShowRates((v) => !v)}
          aria-expanded={showRates}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="font-bold text-white">Pull rates</span>
            <span className="ml-2 text-xs text-slate-500">
              {specialsPerBox} special print{specialsPerBox === 1 ? "" : "s"} per box · tune the assumptions
            </span>
          </span>
          <span className={`shrink-0 text-slate-500 transition-transform ${showRates ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>

        {showRates && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <strong className="text-gold">Riot has never published Riftbound pull rates.</strong> The base
              rarity rates come from a community pull-rate guide built on observed box and case data. The chase
              rates are <em>derived</em>, not measured: you set how many special-treatment prints a box yields,
              and that budget is split across the special pools in proportion to how many cards each contains.
              That split is itself a rough assumption — signatures are widely reported as rarer than their share
              of the card count implies — so every rate below is individually editable.
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-slate-400">
                Special-treatment prints per box
              </span>
              <input
                type="number" min="0" step="0.01" value={specialsPerBox}
                onChange={(e) => { setSpecialsPerBox(Math.max(0, Number(e.target.value) || 0)); setOverrides({}); }}
                className="input max-w-[12rem]"
              />
              <span className="mt-1 block text-[11px] text-slate-600">
                Default 0.33 ≈ one every three boxes — the same rate this tool always used for Showcase, so
                counting the chase tiers doesn&apos;t silently inflate the total.
              </span>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {calc.lines.map((l) => (
                <label key={l.pool} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">
                    {POOL_LABEL[l.pool]}
                    {l.chase && <span className="ml-1 text-brand-400">*</span>}
                  </span>
                  <input
                    type="number" min="0" step="0.0001"
                    value={Number((calc.rates[l.pool] ?? 0).toFixed(5))}
                    onChange={(e) =>
                      setOverrides((cur) => ({ ...cur, [l.pool]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="input py-1.5 text-sm"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-600">
                    {oneInPacks(calc.rates[l.pool] ?? 0) ?? "per pack"}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setOverrides({}); setSpecialsPerBox(DEFAULT_SPECIALS_PER_BOX); setPacks(DEFAULT_PACKS); }}
              className="mt-3 text-[11px] text-brand-400 hover:underline"
            >
              reset to defaults
            </button>
            <p className="mt-2 text-[10px] text-slate-600">
              <span className="text-brand-400">*</span> derived estimate, not official odds.
            </p>
          </div>
        )}
      </div>

      {/* ── What you're actually chasing ────────────────────────────────────
          The point of a box. Real cards, real prices, ordered by value. */}
      {chaseLines.map((l) => {
        const p = poolByKey.get(l.pool);
        if (!p || p.top.length === 0) return null;
        return (
          <div key={l.pool} className="card-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-white">
                {POOL_LABEL[l.pool]} <span className="text-sm font-normal text-slate-500">· {p.total} in {set.setCode}</span>
              </h2>
              <span className="text-xs text-slate-500">{oneInPacks(l.rate) ?? `${l.rate}× per pack`}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {p.top.map((c) => (
                <Link key={c.id} href={`/card/${c.slug}`} className="group block">
                  <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg border border-ink-700 transition-colors group-hover:border-brand-500">
                    <CardImage
                      card={{
                        name: c.name,
                        domain: "",
                        type: "",
                        rarity: c.rarity,
                        collectorNumber: c.collectorNumber,
                        setCode: set.setCode,
                        imageThumbUrl: c.imageThumbUrl,
                        orientation: c.orientation,
                      }}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="mt-1 truncate text-[11px] font-semibold text-slate-300 group-hover:text-white">
                    {c.name}
                  </div>
                  <div className="num text-[11px] text-brand-300">
                    {c.usdCents != null && c.usdCents > 0 ? money(c.usdCents) : "—"}
                    {c.foil && <span className="ml-1 text-gold" title="priced from a foil-only listing">✦</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Disclosure ─────────────────────────────────────────────────────── */}
      <div className="card-surface p-5 text-[11px] leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-500">Every card is valued at its TCGplayer market price</strong> — the
          English Near-Mint fair-market figure TCGplayer publishes, not the cheapest listing (which is often a
          foreign-language copy). {currency !== "USD" && (
            <>
              Prices are converted from USD at an approximate, hand-maintained rate of{" "}
              <span className="num text-slate-500">US$1 ≈ {formatMoney(Math.round(100 * fx), currency)}</span>, so
              this is a <strong className="text-slate-500">reference value, not a local retail quote</strong>:
              singles in your market frequently sell above the converted figure, and TCGplayer may not even ship
              to you. The USD original is shown alongside the headline so you can check the conversion.{" "}
            </>
          )}
          A ✦ marks a card priced from a foil-only listing — a different physical product from a base pull.
        </p>
        <p className="mt-2">
          Pull rates are <strong className="text-slate-500">estimates you control</strong>, never official odds.
          EV is an average across many boxes: the distribution is heavily skewed by the chase tiers, so most
          boxes come in under it. It also assumes every card could be sold at market price, and bulk commons
          effectively cannot be. Want a specific card?{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">Buying the single</Link> is the surer
          play, and you can <Link href="/sealed" className="text-brand-400 hover:underline">compare live box prices</Link>{" "}
          before you commit.
        </p>
      </div>
    </div>
  );
}
