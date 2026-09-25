"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { dropBreakWindow } from "@/lib/methodology-breaks";
import type { PricePoint } from "@/lib/price-history";

// Interactive price-history chart (Steam / CSFloat style): scatter-line with a
// hover crosshair + tooltip showing the exact price on any day, range toggles, and
// a stats header. Pure SVG + a thin pointer layer — no chart library.
//
// Drawn in real CSS pixels: the viewBox is the wrapper's MEASURED width by the
// svg's own CSS height (h-48 = 192, compact h-36 = 144), so one user unit is
// one pixel. The old fixed 640x200 viewBox with preserveAspectRatio="none"
// stretched everything by width/640 horizontally — 10px labels squashed to
// half width on a phone and stretched 1.5x at 1920, dots drawn as ellipses.
// PAD.l is only the MINIMUM left gutter; the real one (padL) is sized from the
// widest y-label so "US$1,154.67" is no longer clipped at the left edge.
const PAD = { l: 46, r: 12, t: 14, b: 22 };
/** Drawing width until the ResizeObserver reports (SSR and first paint). */
const FALLBACK_W = 640;

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 93 },
  { key: "ALL", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

// `fmt` overrides how values are labelled (default: money). Lets the same chart
// plot non-currency series like the RiftCompare Index ("104.2 pts").
export function PriceChart({
  points,
  currency = "AUD",
  compact = false,
  fmt,
  upIsGood = false,
  nowOverrideCents,
  rawCardHistory = false,
}: {
  points: PricePoint[];
  currency?: string;
  compact?: boolean;
  fmt?: (v: number) => string;
  // For a market INDEX, rising = good = green (stock convention). Default false keeps
  // the per-card buyer convention (rising price = bad for the buyer = red).
  upIsGood?: boolean;
  /**
   * The LIVE cheapest in-stock price, when the caller has one (the card page
   * and QuickView both do — see CardPriceMetrics/computeMarket). "Now" is a
   * daily import snapshot at least several hours old, sourced from a
   * different table than the header's cheapest-price figure — the two could
   * quietly disagree ("Now US$16.50" next to a header reading "US$20.00")
   * whenever a listing changed between yesterday's import and this page
   * load. When this is provided, "Now" shows THIS number instead of the
   * chart's own last data point, so the two headline figures on the page
   * are always sourced from the exact same computeMarket() call and can
   * never contradict each other. The plotted line/dots stay the genuine
   * historical series either way — only the "Now" stat text changes; the
   * "▲/▼ X%" trend arrow still describes real tracked history, not a
   * fabricated data point — on the current pricing basis only, for a raw
   * card series (see rawCardHistory).
   */
  nowOverrideCents?: number | null;
  /**
   * The points are a card's RAW PriceHistory series (the card page and
   * QuickView). Its "▲/▼ X%" arrow then never reaches back across a
   * METHODOLOGY_BREAKS window (dropBreakWindow — the same rule /movers, the
   * verdict and the Index apply): across 2026-09-23 it showed the US sourcing
   * change as a ~25% drop. The line itself is still drawn in full. Off for the
   * Index and the portfolio, whose series already hold a break flat by
   * chain-linking — cutting their arrows to post-break points would hide real
   * movement for weeks.
   */
  rawCardHistory?: boolean;
}) {
  const label = fmt ?? ((v: number) => formatMoney(v, currency));
  const [range, setRange] = useState<RangeKey>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Unique gradient id — two charts can coexist in the DOM (card page + modal).
  const fillId = useId();
  // null until measured: SSR and the first client render draw at FALLBACK_W
  // and stretch to fit exactly as before (no letterboxed flash, no hydration
  // mismatch), then switch to 1:1 pixels once the wrapper's width is known.
  const [measuredW, setMeasuredW] = useState<number | null>(null);
  const W = measuredW ?? FALLBACK_W;
  const H = compact ? 144 : 192;
  const hasChart = points.length >= 2;
  // Above the early return below: hooks must run on every render. Re-subscribes
  // when the chart mounts (the wrapper does not exist in the empty state). The
  // `w > 0` guard keeps the stretched fallback while the chart sits in a hidden
  // container, rather than collapsing the drawing to a zero-width viewBox.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setMeasuredW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasChart]);

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
        We&apos;re still collecting price points for this card — check back soon as the history builds up.
      </p>
    );
  }

  const vs = data.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(1, max - min);
  const n = data.length;

  const gridVals = [min, min + span / 2, max];
  // Left gutter sized to the widest y-label (10px text, ~6.2px per character
  // is a safe upper bound), never narrower than the old 46.
  const padL = Math.max(PAD.l, Math.ceil(Math.max(...gridVals.map((g) => label(g).length)) * 6.2) + 10);

  const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);

  const line = data.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${padL},${(H - PAD.b).toFixed(1)} ${line} ${(W - PAD.r).toFixed(1)},${(H - PAD.b).toFixed(1)}`;

  const first = data[0].v;
  const last = data[n - 1].v;
  // The value the "Now" stat actually displays — see nowOverrideCents' doc
  // comment. Trend math (delta/pct/up/flat) deliberately still compares
  // against `last`, the real last tracked snapshot: that arrow describes
  // history, not today's live price.
  const nowValue = nowOverrideCents ?? last;
  const trend = rawCardHistory ? dropBreakWindow(data) : data;
  const hasTrend = trend.length >= 2;
  const tFirst = hasTrend ? trend[0].v : first;
  const tLast = hasTrend ? trend[trend.length - 1].v : first;
  const delta = tLast - tFirst;
  const pct = tFirst > 0 ? Math.round((delta / tFirst) * 100) : 0;
  const up = delta > 0;
  const flat = delta === 0;

  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function onMove(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    // Pointer -> user units -> position across the PLOT area (between the
    // gutters), so the crosshair sits under the finger even with a wide padL.
    const u = ((clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (u - padL) / (W - padL - PAD.r)));
    setHover(Math.round(ratio * (n - 1)));
  }

  const hp = hover != null ? data[hover] : null;

  return (
    <div>
      {/* Stats header */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-white">Now <span className="font-bold text-accent">{label(nowValue)}</span></span>
          <span className="text-slate-500">Low {label(min)}</span>
          <span className="text-slate-500">High {label(max)}</span>
          {!flat && (
            <span className={`font-semibold ${up === upIsGood ? "text-brand-400" : "text-rose-400"}`}>
              {up ? "▲" : "▼"} {Math.abs(pct)}%
            </span>
          )}
        </div>
        {!compact && (
          // Compact pills for a MOUSE, keyed on pointer:fine rather than sm:
          // (2026-09-23). globals.css lifts `.min-h-11` to 48px under
          // pointer:coarse, but `sm:min-h-0` is emitted after that rule and
          // cancelled it from 640px, so on a touch tablet these measured
          // 34x21 at 768 and 1024. Every touch device now keeps the 48px floor
          // and px-3; a mouse at any width keeps the old 21px pills.
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => { setRange(r.key); setHover(null); }}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-[11px] font-semibold [@media(pointer:fine)]:min-h-0 [@media(pointer:fine)]:px-2 [@media(pointer:fine)]:py-0.5 ${range === r.key ? "bg-brand-500/20 text-brand-300" : "text-slate-500 hover:text-slate-300"}`}
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
        {/* Colours come from theme tokens through currentColor (2026-09-23):
            the svg is text-brand-400 (#34d17e in dark — pixel-identical to the
            old literal — and #157a45 in light, where #34d17e measured 1.99:1 on
            white, under the 3:1 non-text floor). The gridline is text-white at
            6%, which is ink in the light theme (white-on-white was invisible),
            and the dot rings are the card surface in both themes. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`${compact ? "h-36 w-full" : "h-48 w-full"} text-brand-400`}
          preserveAspectRatio={measuredW == null ? "none" : undefined}
          role="img"
          aria-label="Price history chart"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal gridlines + y labels */}
          {gridVals.map((gv, i) => (
            <g key={i}>
              <line x1={padL} x2={W - PAD.r} y1={y(gv)} y2={y(gv)} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" className="text-white" />
              <text x={padL - 6} y={y(gv) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">{label(gv)}</text>
            </g>
          ))}

          <polygon points={area} fill={`url(#${fillId})`} />
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />

          {/* scatter dots (skip when very dense) — a ring in the card-surface
              colour (stroke-ink-900, themed) separates each point from the
              line/fill beneath it, the same contrast trick the hover dot below
              already uses, so every tracked day reads as a distinct marker
              rather than disappearing into the line. */}
          {n <= 60 &&
            data.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.v)} r="3" fill="currentColor" strokeWidth="1.25" className="stroke-ink-900" />
            ))}

          {/* x labels (first / last) */}
          <text x={padL} y={H - 6} textAnchor="start" className="fill-slate-500" fontSize="10">{fmtDate(data[0].t)}</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-slate-500" fontSize="10">{fmtDate(data[n - 1].t)}</text>

          {/* hover crosshair */}
          {hp && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(hover!)} cy={y(hp.v)} r="4" fill="currentColor" strokeWidth="1.5" className="stroke-ink-900" />
            </g>
          )}
        </svg>

        {/* tooltip — centred on the crosshair, but its centre is clamped 4rem
            in from either edge so it doesn't hang off the chart at the first
            and last points: half of a 128px box, and a four-digit money
            tooltip ('US$1,058.74' + the date) measured 117px (2026-09-23). */}
        {hp && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-950/95 px-2.5 py-1.5 text-center shadow-xl"
            style={{ left: `clamp(4rem, ${(x(hover!) / W) * 100}%, calc(100% - 4rem))`, top: 0 }}
          >
            <div className="text-sm font-bold text-accent">{label(hp.v)}</div>
            <div className="whitespace-nowrap text-[10px] text-slate-400">{new Date(hp.t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny non-interactive sparkline. `upIsGood` flips the colour convention for a market
// index (rising = green) vs the default per-card buyer convention (rising = red).
// Coloured through currentColor from text-brand-400 / text-rose-400, so it follows
// the theme like the big chart does (the dark values are the old literals).
export function Sparkline({ points, up, upIsGood = false }: { points: PricePoint[]; up: boolean; upIsGood?: boolean }) {
  if (points.length < 2) return <div className="h-8 w-20" />;
  const w = 80, h = 32, pad = 3;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs), span = Math.max(1, max - min);
  const n = points.length;
  const xx = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const yy = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const line = points.map((p, i) => `${xx(i).toFixed(1)},${yy(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-8 w-20 ${up === upIsGood ? "text-brand-400" : "text-rose-400"}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
