"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { PricePoint } from "@/lib/price-history";

// Interactive price-history chart (Steam / CSFloat style): scatter-line with a
// hover crosshair + tooltip showing the exact price on any day, range toggles, and
// a stats header. Pure SVG + a thin pointer layer — no chart library.
const W = 640;
const H = 200;
const PAD = { l: 46, r: 12, t: 14, b: 22 };

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 93 },
  { key: "ALL", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export function PriceChart({ points, currency = "AUD", compact = false }: { points: PricePoint[]; currency?: string; compact?: boolean }) {
  const [range, setRange] = useState<RangeKey>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Unique gradient id — two charts can coexist in the DOM (card page + modal).
  const fillId = useId();

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    if (days === Infinity) return points;
    const cutoff = Date.now() - days * 86400_000;
    const f = points.filter((p) => p.t >= cutoff);
    return f.length >= 2 ? f : points;
  }, [points, range]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        We&apos;re still collecting daily price points for this card — check back soon as the history builds up.
      </p>
    );
  }

  const vs = data.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(1, max - min);
  const n = data.length;

  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);

  const line = data.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${PAD.l},${(H - PAD.b).toFixed(1)} ${line} ${(W - PAD.r).toFixed(1)},${(H - PAD.b).toFixed(1)}`;

  const first = data[0].v;
  const last = data[n - 1].v;
  const delta = last - first;
  const pct = first > 0 ? Math.round((delta / first) * 100) : 0;
  const up = delta > 0;
  const flat = delta === 0;

  const gridVals = [min, min + span / 2, max];
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function onMove(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (n - 1)));
  }

  const hp = hover != null ? data[hover] : null;

  return (
    <div>
      {/* Stats header */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-white">Now <span className="font-bold text-accent">{formatMoney(last, currency)}</span></span>
          <span className="text-slate-500">Low {formatMoney(min, currency)}</span>
          <span className="text-slate-500">High {formatMoney(max, currency)}</span>
          {!flat && (
            <span className={up ? "font-semibold text-rose-400" : "font-semibold text-brand-400"}>
              {up ? "▲" : "▼"} {Math.abs(pct)}%
            </span>
          )}
        </div>
        {!compact && (
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => { setRange(r.key); setHover(null); }}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${range === r.key ? "bg-brand-500/20 text-brand-300" : "text-slate-500 hover:text-slate-300"}`}
              >
                {r.key === "ALL" ? "All" : r.key}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        ref={wrapRef}
        className="relative mt-2 select-none"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className={compact ? "h-36 w-full" : "h-48 w-full"} preserveAspectRatio="none" role="img" aria-label="Price history chart">
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d17e" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#34d17e" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal gridlines + y labels */}
          {gridVals.map((gv, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(gv)} y2={y(gv)} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(gv) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">{formatMoney(gv, currency)}</text>
            </g>
          ))}

          <polygon points={area} fill={`url(#${fillId})`} />
          <polyline points={line} fill="none" stroke="#34d17e" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />

          {/* scatter dots (skip when very dense) */}
          {n <= 60 && data.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="1.8" fill="#34d17e" fillOpacity="0.65" />)}

          {/* x labels (first / last) */}
          <text x={PAD.l} y={H - 6} textAnchor="start" className="fill-slate-500" fontSize="10">{fmtDate(data[0].t)}</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-slate-500" fontSize="10">{fmtDate(data[n - 1].t)}</text>

          {/* hover crosshair */}
          {hp && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="#34d17e" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(hover!)} cy={y(hp.v)} r="4" fill="#34d17e" stroke="#0b0f14" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {/* tooltip */}
        {hp && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-950/95 px-2.5 py-1.5 text-center shadow-xl"
            style={{ left: `${(x(hover!) / W) * 100}%`, top: 0 }}
          >
            <div className="text-sm font-bold text-accent">{formatMoney(hp.v, currency)}</div>
            <div className="whitespace-nowrap text-[10px] text-slate-400">{new Date(hp.t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny non-interactive sparkline for the homepage Price Watch rows.
export function Sparkline({ points, up }: { points: PricePoint[]; up: boolean }) {
  if (points.length < 2) return <div className="h-8 w-20" />;
  const w = 80, h = 32, pad = 3;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs), span = Math.max(1, max - min);
  const n = points.length;
  const xx = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const yy = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const line = points.map((p, i) => `${xx(i).toFixed(1)},${yy(p.v).toFixed(1)}`).join(" ");
  const color = up ? "#fb7185" : "#34d17e";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-20" preserveAspectRatio="none" aria-hidden>
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
