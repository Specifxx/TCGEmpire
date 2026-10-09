"use client";

import { useEffect, useState } from "react";
import { useCountry } from "./CountryProvider";
import { PriceChart } from "./PriceChart";
import { PremiumButton } from "./PremiumButton";
import { useMe } from "@/lib/use-me";
import type { PricePoint } from "@/lib/price-history";

// Graded price tracking (2026-10-09, Plus; lib/graded-history.ts and
// lib/graded-watch.ts): under the card page's Graded tab, the cheapest live slab
// per grade over time and a new-low watch on one grade. Everyone else sees one
// line saying what Plus adds here, never a popup.
type Series = { grade: string; points: PricePoint[] };

export function GradedPriceHistory({ cardId }: { cardId: string }) {
  const me = useMe();
  const { country } = useCountry();
  const member = me.loaded && me.premium;
  const [series, setSeries] = useState<Series[] | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [grade, setGrade] = useState<string | null>(null);
  const [watched, setWatched] = useState<Map<string, string>>(new Map()); // grade -> watch id
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    fetch(`/api/card/${encodeURIComponent(cardId)}/graded-history?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setSeries(d.grades ?? []);
        setCurrency(d.currency ?? "USD");
        setGrade((g) => g ?? d.grades?.[0]?.grade ?? null);
      })
      .catch(() => {});
    fetch(`/api/watches/graded?cardId=${encodeURIComponent(cardId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setWatched(new Map((d.watches ?? []).filter((w: { market: string }) => w.market === country).map((w: { grade: string; id: string }) => [w.grade, w.id])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [member, cardId, country]);

  if (!me.loaded) return null;
  if (!member) {
    return (
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-800 pt-3 text-xs text-slate-400">
        <span>Plus tracks each grade&apos;s price over time and emails you when a PSA 10 or BGS 9.5 hits a new low.</span>
        <PremiumButton tier="plus" surface="gate:graded-history" className="btn-ghost min-h-11 px-3 text-xs">
          Track graded prices
        </PremiumButton>
      </p>
    );
  }
  if (!series) return null;
  if (!series.length) {
    return <p className="mt-4 border-t border-ink-800 pt-3 text-xs text-slate-400">Graded price history starts building from today&apos;s listings.</p>;
  }
  const current = series.find((s) => s.grade === grade) ?? series[0];
  const watchId = watched.get(current.grade);

  async function toggleWatch() {
    setBusy(true);
    try {
      if (watchId) {
        const r = await fetch(`/api/watches/graded?id=${encodeURIComponent(watchId)}`, { method: "DELETE" });
        if (r.ok) setWatched((m) => { const n = new Map(m); n.delete(current.grade); return n; });
      } else {
        const r = await fetch("/api/watches/graded", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, market: country, grade: current.grade }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d?.watch?.id) setWatched((m) => new Map(m).set(current.grade, d.watch.id));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-ink-800 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-white">Graded price history</h3>
        <div className="flex flex-wrap gap-1">
          {series.map((s) => (
            <button
              key={s.grade}
              type="button"
              onClick={() => setGrade(s.grade)}
              className={`min-h-11 rounded-md px-2.5 text-xs font-semibold [@media(pointer:fine)]:min-h-0 [@media(pointer:fine)]:py-1 ${s.grade === current.grade ? "bg-brand-500/20 text-brand-300" : "text-slate-400 hover:text-white"}`}
            >
              {s.grade}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <PriceChart points={current.points} currency={currency} compact />
      </div>
      <button type="button" onClick={toggleWatch} disabled={busy} className="btn-ghost mt-2 min-h-11 px-3 text-xs">
        {watchId ? `Watching ${current.grade} for a new low ✓` : `Email me when ${current.grade} hits a new low`}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">Cheapest live eBay listing per grade, read once a day; {country} prices.</p>
    </div>
  );
}
