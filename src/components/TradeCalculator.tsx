"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { cardDisplayName } from "@/lib/card-name";

// A card added to one side of a trade. We store the full set of market prices so
// the totals re-compute live when the visitor switches country/currency.
interface TradeCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  // Printing credentials, so same-name cards (base vs promo vs alt-art vs signature)
  // are distinguishable in the name — see cardDisplayName().
  variant?: string | null;
  isPromo?: boolean;
  rarity?: string;
  imageThumbUrl: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  qty: number;
}

type Side = "yours" | "theirs";
const STORAGE_KEY = "rc_trade";

// What /api/search returns per card (a superset of what we keep).
type SearchResult = Omit<TradeCard, "qty">;

export function TradeCalculator() {
  const { fmt, price } = useCountry();
  const [yours, setYours] = useState<TradeCard[]>([]);
  const [theirs, setTheirs] = useState<TradeCard[]>([]);
  // Cash-difference %: people settling a trade in cash often pay a % of the value gap
  // (e.g. 90%). The slider scales the final cash figure without touching card values.
  const [cashPct, setCashPct] = useState(100);
  // Per-card manual value override (cents), keyed by card id — for when you and your
  // trade partner agree a card is worth something other than the market price.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  // Restore an in-progress trade (handy at locals — survives a refresh).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.yours)) setYours(data.yours);
        if (Array.isArray(data.theirs)) setTheirs(data.theirs);
        if (data.overrides && typeof data.overrides === "object") setOverrides(data.overrides);
        if (typeof data.cashPct === "number") setCashPct(data.cashPct);
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yours, theirs, overrides, cashPct }));
    } catch {
      /* quota/private mode — fine */
    }
  }, [yours, theirs, overrides, cashPct, loaded]);

  const setter = (side: Side) => (side === "yours" ? setYours : setTheirs);

  function add(side: Side, r: SearchResult) {
    const set = setter(side);
    set((list) => {
      const i = list.findIndex((c) => c.id === r.id);
      if (i >= 0) {
        const next = list.slice();
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...list, { ...r, qty: 1 }];
    });
  }
  function changeQty(side: Side, id: string, delta: number) {
    setter(side)((list) =>
      list.flatMap((c) => {
        if (c.id !== id) return [c];
        const qty = c.qty + delta;
        return qty <= 0 ? [] : [{ ...c, qty }];
      })
    );
  }
  function remove(side: Side, id: string) {
    setter(side)((list) => list.filter((c) => c.id !== id));
  }
  function clearSide(side: Side) {
    setter(side)([]);
  }
  function swapSides() {
    setYours(theirs);
    setTheirs(yours);
  }

  // Effective per-unit value: a manual override if set, else the live market price.
  const effUnit = (c: TradeCard) => overrides[c.id] ?? price(c);
  const onOverride = (id: string, cents: number) => setOverrides((o) => ({ ...o, [id]: cents }));

  const sideTotal = (list: TradeCard[]) =>
    list.reduce((sum, c) => sum + (effUnit(c) ?? 0) * c.qty, 0);
  // Unpriced only when there's neither an override nor a market price.
  const sideUnpriced = (list: TradeCard[]) => list.filter((c) => effUnit(c) == null).length;

  const yoursTotal = sideTotal(yours);
  const theirsTotal = sideTotal(theirs);
  const diff = theirsTotal - yoursTotal; // + = you receive more value
  const larger = Math.max(yoursTotal, theirsTotal);
  // "Even" if within $1 or 2% of the larger pile.
  const even = larger === 0 || Math.abs(diff) <= Math.max(100, larger * 0.02);
  // Cash settlement: scale the value gap by the chosen % (e.g. settle at 90%).
  const cashDiff = diff * (cashPct / 100);
  const unpriced = sideUnpriced(yours) + sideUnpriced(theirs);

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <TradeColumn
          title="Your cards"
          subtitle="What you're giving"
          accent="rose"
          list={yours}
          total={yoursTotal}
          fmt={fmt}
          price={price}
          overrides={overrides}
          onOverride={onOverride}
          onAdd={(r) => add("yours", r)}
          onQty={(id, d) => changeQty("yours", id, d)}
          onRemove={(id) => remove("yours", id)}
          onClear={() => clearSide("yours")}
        />
        <TradeColumn
          title="Their cards"
          subtitle="What you're receiving"
          accent="emerald"
          list={theirs}
          total={theirsTotal}
          fmt={fmt}
          price={price}
          overrides={overrides}
          onOverride={onOverride}
          onAdd={(r) => add("theirs", r)}
          onQty={(id, d) => changeQty("theirs", id, d)}
          onRemove={(id) => remove("theirs", id)}
          onClear={() => clearSide("theirs")}
        />
      </div>

      {/* Verdict / summary — sticky at the bottom so it's always in view on a phone. */}
      <div className="sticky bottom-3 z-20 mt-4">
        <div className="card-surface border-ink-600 bg-ink-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">You give</div>
                <div className="font-bold text-white">{fmt(yoursTotal)}</div>
              </div>
              <div className="text-2xl text-slate-600">⇄</div>
              <div>
                <div className="text-xs text-slate-500">You receive</div>
                <div className="font-bold text-white">{fmt(theirsTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {yours.length + theirs.length > 0 && (
                <button onClick={swapSides} className="btn-ghost text-sm" title="Swap the two sides">⇅ Swap</button>
              )}
              <Verdict even={even} diff={cashDiff} fmt={fmt} empty={larger === 0} />
            </div>
          </div>

          {/* Cash-difference % — settle the value gap in cash at, say, 90%. */}
          {yours.length + theirs.length > 0 && (
            <div className="mt-3 flex items-center gap-3 border-t border-ink-800 pt-3">
              <label htmlFor="cashPct" className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Cash&nbsp;%
              </label>
              <input
                id="cashPct"
                type="range"
                min={50}
                max={100}
                step={1}
                value={cashPct}
                onChange={(e) => setCashPct(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-brand-500"
                aria-label="Cash settlement percentage"
              />
              <span className="w-10 shrink-0 text-right text-sm font-bold text-white">{cashPct}%</span>
              {cashPct !== 100 && (
                <button type="button" onClick={() => setCashPct(100)} className="shrink-0 text-xs text-slate-500 hover:text-brand-400">
                  reset
                </button>
              )}
            </div>
          )}

          {unpriced > 0 && (
            <p className="mt-2 text-xs text-gold">
              {unpriced} card{unpriced === 1 ? "" : "s"} have no price — tap the price to set one manually.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-600">
            Values start from RiftCompare&apos;s lowest live market price (tap any price to override).
            {cashPct !== 100 ? ` Cash difference shown at ${cashPct}%.` : ""} A guide for fair trades — always agree the final deal between yourselves.
          </p>
        </div>
      </div>
    </div>
  );
}

function Verdict({ even, diff, fmt, empty }: { even: boolean; diff: number; fmt: (c: number) => string; empty: boolean }) {
  if (empty) return <span className="chip bg-ink-800 text-slate-400">Add cards to compare</span>;
  if (even) return <span className="chip bg-brand-500/15 font-bold text-brand-300">✓ Even trade</span>;
  if (diff > 0)
    return <span className="chip bg-emerald-500/15 font-bold text-emerald-300">You come out ahead by {fmt(diff)}</span>;
  return <span className="chip bg-rose-500/15 font-bold text-rose-300">You give {fmt(-diff)} more</span>;
}

function TradeColumn({
  title,
  subtitle,
  accent,
  list,
  total,
  fmt,
  price,
  overrides,
  onOverride,
  onAdd,
  onQty,
  onRemove,
  onClear,
}: {
  title: string;
  subtitle: string;
  accent: "rose" | "emerald";
  list: TradeCard[];
  total: number;
  fmt: (c: number) => string;
  price: (c: TradeCard) => number | null;
  overrides: Record<string, number>;
  onOverride: (id: string, cents: number) => void;
  onAdd: (r: SearchResult) => void;
  onQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const ring = accent === "rose" ? "border-t-rose-500/50" : "border-t-emerald-500/50";
  return (
    <section className={`card-surface border-t-2 ${ring} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {list.length > 0 && (
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-300">Clear</button>
        )}
      </div>

      <CardPicker onAdd={onAdd} />

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-700 p-6 text-center text-sm text-slate-500">
          No cards yet — search above to add what&apos;s being traded.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-800">
          {list.map((c) => {
            const base = price(c);
            const ov = overrides[c.id];
            const unit = ov ?? base; // override beats market price
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.imageThumbUrl ? (
                  <img src={c.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{cardDisplayName(c.name, c)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="truncate">{c.setCode} {c.collectorNumber}</span>
                    <span>·</span>
                    <span>$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={((ov ?? base ?? 0) / 100).toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        onOverride(c.id, Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : 0);
                      }}
                      onFocus={(e) => e.target.select()}
                      className={`w-14 rounded border bg-ink-900 px-1 py-0.5 text-right text-[11px] outline-none focus:border-brand-500 ${
                        ov != null ? "border-brand-500/60 text-brand-300" : "border-ink-700 text-slate-300"
                      }`}
                      aria-label="Card value (override)"
                      title={ov != null ? "Custom value — edit or clear to revert" : "Market value — type to override"}
                    />
                    <span>ea</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => onQty(c.id, -1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700" aria-label="Decrease quantity">−</button>
                  <span className="w-5 text-center text-sm font-semibold text-white">{c.qty}</span>
                  <button onClick={() => onQty(c.id, 1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700" aria-label="Increase quantity">+</button>
                </div>
                <div className="w-16 shrink-0 text-right text-sm font-semibold text-accent">
                  {unit != null ? fmt(unit * c.qty) : "—"}
                </div>
                <button onClick={() => onRemove(c.id)} className="shrink-0 text-slate-600 hover:text-rose-300" aria-label="Remove">✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
        <span className="text-sm text-slate-400">{list.reduce((n, c) => n + c.qty, 0)} card{list.reduce((n, c) => n + c.qty, 0) === 1 ? "" : "s"}</span>
        <span className="text-lg font-extrabold text-white">{fmt(total)}</span>
      </div>
    </section>
  );
}

// Typeahead that adds a real DB card (with its live market prices) to a side.
function CardPicker({ onAdd }: { onAdd: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults((data.results ?? []).slice(0, 8));
      } catch {
        /* ignore */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Add a card — type to search…"
        className="input"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-850 shadow-2xl">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(r);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.imageThumbUrl ? (
                  <img src={r.imageThumbUrl} alt="" className="h-9 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-9 w-7 shrink-0 rounded bg-ink-800" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {cardDisplayName(r.name, r)} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
