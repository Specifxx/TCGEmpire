"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Full-bleed announcement ribbon attached directly under the navbar (reads as an
// extension of the header). Logo-green, with a live inline countdown to the
// Vendetta release. Self-contained countdown so it needs no props; the human copy
// is in the SSR HTML (crawlable) and the digits tick in after mount (no hydration
// mismatch — `now` is null on the server render).
const TARGET = new Date(2026, 6, 31, 0, 0, 0).getTime(); // 31 Jul 2026, local midnight

export function VendettaRibbon() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rem = now == null ? null : Math.max(0, TARGET - now);
  const released = rem != null && rem <= 0;
  const s = Math.floor((rem ?? 0) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Link
      href="/sets/vendetta"
      aria-label="Riftbound Vendetta — explore every revealed card"
      className="group block bg-brand-500 text-ink-950 transition-colors hover:bg-brand-400"
    >
      <div className="container-app flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm font-bold">
        <span className="rounded bg-ink-950/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide">
          New set
        </span>
        {released ? (
          <span>Riftbound: Vendetta is OUT — explore every card &amp; price</span>
        ) : (
          <>
            <span>Riftbound: Vendetta drops July 31 — explore every revealed card</span>
            <span className="num inline-flex items-center gap-1 rounded bg-ink-950/15 px-2 py-0.5 tabular-nums">
              {now == null ? (
                "—"
              ) : (
                <>
                  {d}d <span className="opacity-70">·</span> {pad(h)}:{pad(m)}:{pad(sec)}
                </>
              )}
            </span>
          </>
        )}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}
