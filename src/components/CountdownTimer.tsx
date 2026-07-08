"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Splits a millisecond duration into day/hour/min/sec cells.
function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { n: Math.floor(s / 86400), l: "Days" },
    { n: Math.floor((s % 86400) / 3600), l: "Hours" },
    { n: Math.floor((s % 3600) / 60), l: "Mins" },
    { n: s % 60, l: "Secs" },
  ];
}

// Live release countdown. Targets local midnight of the given date (so each visitor
// counts down to release day in their own timezone). `now` stays null until mount so
// the SSR'd HTML (which crawlers index) matches the first client render — no hydration
// mismatch — then it ticks every second. The human date + copy live in the page HTML,
// so the page is meaningful with JS off / to crawlers.
export function CountdownTimer({ y, m, d, href = "/sets/vendetta", size = "lg" }: { y: number; m: number; d: number; href?: string; size?: "lg" | "sm" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(y, m - 1, d, 0, 0, 0).getTime();
  const remaining = now == null ? null : target - now;

  if (remaining != null && remaining <= 0) {
    return (
      <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-8 text-center shadow-[0_0_30px_rgba(52,209,126,0.15)]">
        <div className="text-2xl font-extrabold text-brand-300">🎉 It&apos;s here — Vendetta is out!</div>
        <Link href={href} className="btn-primary mt-4">See every Vendetta card &amp; price →</Link>
      </div>
    );
  }

  const cells = split(remaining ?? 0);
  const numCls = size === "sm" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl";
  const pad = size === "sm" ? "p-2.5 sm:p-3" : "p-3 sm:p-5";
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4" role="timer" aria-label="Time until Riftbound Vendetta releases">
      {cells.map((c) => (
        <div key={c.l} className={`rounded-xl border border-ink-700 bg-ink-900 text-center ${pad}`}>
          <div className={`num font-extrabold tabular-nums text-white ${numCls}`}>
            {remaining == null ? "—" : String(c.n).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 sm:text-xs">{c.l}</div>
        </div>
      ))}
    </div>
  );
}
