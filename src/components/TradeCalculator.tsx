"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";

// A card added to one side of a trade. We store the full set of market prices so
// the totals re-compute live when the visitor switches country/currency.
interface TradeCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
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
  const [loaded, setLoaded] = useState(false);

  // Restore an in-progress trade (handy at locals — survives a refresh).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.yours)) setYours(data.yours);
        if (Array.isArray(data.theirs)) setTheirs(data.theirs);
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yours, theirs }));
    } catch {
      /* quota/private mode — fine */
    }
  }, [yours, theirs, loaded]);

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

  const sideTotal = (list: TradeCard[]) =>
    list.reduce((sum, c) => sum + (price(c) ?? 0) * c.qty, 0);
  const sideUnpriced = (list: TradeCard[]) => list.filter((c) => price(c) == null).length;

  const yoursTotal = sideTotal(yours);
  const theirsTotal = sideTotal(theirs);
  const diff = theirsTotal - yoursTotal; // + = you receive more value
  const larger = Math.max(yoursTotal, theirsTotal);
  // "Even" if within $1 or 2% of the larger pile.
  const even = larger === 0 || Math.abs(diff) <= Math.max(100, larger * 0.02);
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
              <Verdict even={even} diff={diff} fmt={fmt} empty={larger === 0} />
            </div>
          </div>
          {unpriced > 0 && (
            <p className="mt-2 text-xs text-gold">
              {unpriced} card{unpriced === 1 ? "" : "s"} have no market price yet and count as {fmt(0)} — agree on these manually.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-600">
            Values use RiftCompare&apos;s lowest live market price per card. A guide for fair trades — always agree the final deal between yourselves.
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
            const unit = price(c);
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.imageThumbUrl ? (
                  <img src={c.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.setCode} {c.collectorNumber} · {unit != null ? fmt(unit) : "no price"} ea
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
                  {r.name} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
