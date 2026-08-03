"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { cardDisplayName } from "@/lib/card-name";
import { tradeGremlin, type TradeTone } from "@/lib/trade-gremlin";

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
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  qty: number;
}

type Side = "yours" | "theirs";
const STORAGE_KEY = "rc_trade";

// What /api/search returns per card (a superset of what we keep).
type SearchResult = Omit<TradeCard, "qty">;

// Visual styling per gremlin verdict tone.
const TRADE_TONE: Record<TradeTone, { ring: string }> = {
  robbed: { ring: "border-rose-500/40 bg-rose-500/5" },
  winning: { ring: "border-brand-500/40 bg-brand-500/5" },
  fair: { ring: "border-ink-600 bg-ink-950/40" },
  donation: { ring: "border-ink-700 bg-ink-950/40" },
};

export function TradeCalculator() {
  const { fmt, price, country, currency } = useCountry();
  const [yours, setYours] = useState<TradeCard[]>([]);
  const [theirs, setTheirs] = useState<TradeCard[]>([]);
  // The gremlin's spicier on-demand take (LLM if a key is set, else the rule line).
  const [roast, setRoast] = useState<{ text: string; source: "ai" | "rules" } | null>(null);
  const [roasting, setRoasting] = useState(false);
  // Each side has its OWN value % — so each player can discount their cards (e.g. value
  // them at 90%) independently. The cash difference is then the gap between the two
  // adjusted totals.
  const [yoursPct, setYoursPct] = useState(100);
  const [theirsPct, setTheirsPct] = useState(100);
  // Per-card value override (cents), keyed by card id — set by typing a value or by
  // picking a specific store's price.
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
        if (typeof data.yoursPct === "number") setYoursPct(data.yoursPct);
        if (typeof data.theirsPct === "number") setTheirsPct(data.theirsPct);
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yours, theirs, overrides, yoursPct, theirsPct }));
    } catch {
      /* quota/private mode — fine */
    }
  }, [yours, theirs, overrides, yoursPct, theirsPct, loaded]);

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
    setYoursPct(theirsPct);
    setTheirsPct(yoursPct);
  }

  // Effective per-unit value: a manual/selected override if set, else the live price.
  const effUnit = (c: TradeCard) => overrides[c.id] ?? price(c);
  const onOverride = (id: string, cents: number) => setOverrides((o) => ({ ...o, [id]: cents }));

  const sideTotal = (list: TradeCard[]) => list.reduce((sum, c) => sum + (effUnit(c) ?? 0) * c.qty, 0);
  const sideUnpriced = (list: TradeCard[]) => list.filter((c) => effUnit(c) == null).length;

  const rawYours = sideTotal(yours);
  const rawTheirs = sideTotal(theirs);
  const adjYours = Math.round((rawYours * yoursPct) / 100);
  const adjTheirs = Math.round((rawTheirs * theirsPct) / 100);
  const cashDiff = adjTheirs - adjYours; // who pays whom is left to the traders
  const hasCards = yours.length + theirs.length > 0;
  const unpriced = sideUnpriced(yours) + sideUnpriced(theirs);

  // Live gremlin fairness verdict (free, instant). adjYours = you give; adjTheirs = you get.
  const gremlin = hasCards ? tradeGremlin(adjYours, adjTheirs, currency) : null;

  // The on-demand roast is a snapshot — clear it whenever the trade changes.
  useEffect(() => { setRoast(null); }, [adjYours, adjTheirs]);

  async function getRoast() {
    setRoasting(true);
    try {
      const res = await fetch("/api/trade-roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giveCents: adjYours,
          getCents: adjTheirs,
          currency,
          yours: yours.map((c) => `${c.name}${c.qty > 1 ? ` x${c.qty}` : ""}`),
          theirs: theirs.map((c) => `${c.name}${c.qty > 1 ? ` x${c.qty}` : ""}`),
        }),
      });
      const d = await res.json();
      if (d.text) setRoast({ text: d.text, source: d.source ?? "rules" });
    } catch {
      /* ignore — the live line is still shown */
    } finally {
      setRoasting(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <TradeColumn
          title="Your cards"
          subtitle="What you're giving"
          accent="rose"
          list={yours}
          raw={rawYours}
          adjusted={adjYours}
          pct={yoursPct}
          onPct={setYoursPct}
          country={country}
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
          raw={rawTheirs}
          adjusted={adjTheirs}
          pct={theirsPct}
          onPct={setTheirsPct}
          country={country}
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

      {/* Summary — sticky so it's always in view on a phone. */}
      <div className="sticky bottom-3 z-20 mt-4">
        <div className="card-surface border-ink-600 bg-ink-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">You give</div>
                <div className="font-bold text-white">
                  {fmt(rawYours)}
                  {yoursPct !== 100 && <span className="ml-1 text-xs font-normal text-brand-300">({fmt(adjYours)})</span>}
                </div>
              </div>
              <div className="text-2xl text-slate-600">⇄</div>
              <div>
                <div className="text-xs text-slate-500">You receive</div>
                <div className="font-bold text-white">
                  {fmt(rawTheirs)}
                  {theirsPct !== 100 && <span className="ml-1 text-xs font-normal text-brand-300">({fmt(adjTheirs)})</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {hasCards && (
                <button onClick={swapSides} className="btn-ghost text-sm" title="Swap the two sides">⇅ Swap</button>
              )}
              {hasCards && (
                <div className="text-right">
                  <div className="text-xs text-slate-500">Cash difference</div>
                  <div className="font-bold text-accent">{fmt(Math.abs(cashDiff))}</div>
                </div>
              )}
            </div>
          </div>

          {unpriced > 0 && (
            <p className="mt-2 text-xs text-gold">
              {unpriced} card{unpriced === 1 ? "" : "s"} have no price — type a value or pick a store price.
            </p>
          )}

          {/* Trade Gremlin — funny live fairness verdict; tap to get a spicier roast */}
          {gremlin && (
            <div className={`mt-3 rounded-xl border p-3 ${TRADE_TONE[gremlin.tone].ring}`}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-base">🤖</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Trade Gremlin</span>
                {roast?.source === "ai" ? (
                  <span className="chip bg-fuchsia-500/15 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300">✨ Live AI</span>
                ) : (
                  <span className="chip bg-brand-500/10 text-[10px] font-semibold uppercase tracking-wide text-brand-300">Beta</span>
                )}
                <button
                  onClick={getRoast}
                  disabled={roasting}
                  className="ml-auto rounded-md bg-ink-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-ink-700 disabled:opacity-60"
                >
                  {roasting ? "Cooking… 🔥" : "🔮 Roast this trade"}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-slate-100">{roast?.text ?? gremlin.line}</p>
            </div>
          )}

          <p className="mt-2 text-[11px] text-slate-600">
            Values start from RiftCompare&apos;s lowest live price (tap a price to type your own or pick a store).
            Each side has its own value % for cash settlement. A guide for fair trades — always agree the final deal yourselves.
          </p>
        </div>
      </div>
    </div>
  );
}

function TradeColumn({
  title,
  subtitle,
  accent,
  list,
  raw,
  adjusted,
  pct,
  onPct,
  country,
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
  raw: number;
  adjusted: number;
  pct: number;
  onPct: (pct: number) => void;
  country: string;
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
  const count = list.reduce((n, c) => n + c.qty, 0);
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
              <li key={c.id} className="flex items-start gap-3 py-2.5">
                {c.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageThumbUrl} alt="" aria-hidden="true" className="mt-0.5 h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="mt-0.5 h-12 w-9 shrink-0 rounded bg-ink-800" />
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
                      aria-label="Card value"
                      title={ov != null ? "Custom value — edit, or pick a store price below" : "Market value — type to override"}
                    />
                    <span>ea</span>
                  </div>
                  {/* Pick a specific store's price in case the cheapest is wrong. */}
                  <StorePrices cardId={c.id} country={country} fmt={fmt} onPick={(cents) => onOverride(c.id, cents)} />
                </div>
                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  <button onClick={() => onQty(c.id, -1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700" aria-label="Decrease quantity">−</button>
                  <span className="w-5 text-center text-sm font-semibold text-white">{c.qty}</span>
                  <button onClick={() => onQty(c.id, 1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700" aria-label="Increase quantity">+</button>
                </div>
                <div className="mt-0.5 w-16 shrink-0 text-right text-sm font-semibold text-accent">
                  {unit != null ? fmt(unit * c.qty) : "—"}
                </div>
                <button onClick={() => onRemove(c.id)} className="mt-0.5 shrink-0 text-slate-600 hover:text-rose-300" aria-label="Remove">✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-ink-700 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{count} card{count === 1 ? "" : "s"}</span>
          <span className="text-lg font-extrabold text-white">
            {fmt(raw)}
            {pct !== 100 && <span className="ml-1 text-sm font-semibold text-accent">→ {fmt(adjusted)}</span>}
          </span>
        </div>
        {/* This side's value % — for cash settlement (e.g. value your cards at 90%). */}
        {list.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Value %</span>
            <input
              type="range"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => onPct(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-brand-500"
              aria-label={`${title} value percentage`}
            />
            <input
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) onPct(Math.min(100, Math.max(1, v)));
              }}
              onFocus={(e) => e.target.select()}
              className="w-11 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-right text-xs font-bold text-white outline-none focus:border-brand-500"
              aria-label={`${title} value percentage`}
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        )}
      </div>
    </section>
  );
}

// Expandable list of a card's in-stock store prices for the current market, so a
// trader can pick a specific store's price if the auto-cheapest one looks wrong.
// Picking sets that card's value override.
function StorePrices({
  cardId,
  country,
  fmt,
  onPick,
}: {
  cardId: string;
  country: string;
  fmt: (c: number) => string;
  onPick: (cents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    { retailerName: string; priceCents: number; condition: string | null; isFoil: boolean }[] | null
  >(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows == null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/card/${cardId}`);
        const data = await res.json();
        const list = ((data.retailerPrices ?? []) as any[])
          .filter((p) => p.inStock && p.country === country)
          .map((p) => ({
            retailerName: p.retailerName as string,
            priceCents: p.priceCents as number,
            condition: (p.condition ?? null) as string | null,
            isFoil: !!p.isFoil,
          }))
          .sort((a, b) => a.priceCents - b.priceCents);
        setRows(list);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-0.5">
      <button type="button" onClick={toggle} className="text-[11px] text-slate-500 hover:text-brand-400">
        {open ? "hide store prices ▴" : "pick store price ▾"}
      </button>
      {open && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-md border border-ink-700 bg-ink-900">
          {loading ? (
            <li className="px-2 py-1 text-[11px] text-slate-500">Loading…</li>
          ) : !rows || rows.length === 0 ? (
            <li className="px-2 py-1 text-[11px] text-slate-500">No in-stock store prices for this market.</li>
          ) : (
            rows.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.priceCents);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-ink-800"
                >
                  <span className="truncate text-slate-300">
                    {p.retailerName}
                    {p.isFoil ? " · Foil" : ""}
                    {p.condition ? ` · ${p.condition}` : ""}
                  </span>
                  <span className="shrink-0 font-semibold text-accent">{fmt(p.priceCents)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
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
                {r.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageThumbUrl} alt="" aria-hidden="true" className="h-9 w-7 shrink-0 rounded object-cover" />
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
