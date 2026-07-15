"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Full-bleed announcement ribbon attached under the navbar (reads as a header
// extension). Logo-green, FIXED single-line height on every screen — the message
// scrolls as a seamless ticker (a "sliding window"), so it never wraps to multiple
// rows on mobile, and the terminal-style motion fits the brand. Countdown ticks in
// after mount (null on the server render → no hydration mismatch).
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
  const countdown = now == null ? "" : released ? "" : ` · ${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;

  const message = released
    ? "Riftbound: Vendetta is OUT — explore every card & price"
    : `Riftbound: Vendetta drops July 31 — explore every revealed card${countdown}`;

  // One ticker segment (repeated to fill any width). Two identical halves make the
  // marquee loop seamless (see the keyframe: slide exactly -50%).
  const Segment = () => (
    <span className="flex shrink-0 items-center gap-8 pr-8" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="rounded bg-ink-950/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
            New set
          </span>
          <span>{message}</span>
          <span className="opacity-60">→</span>
        </span>
      ))}
    </span>
  );

  return (
    <Link
      href="/sets/vendetta"
      aria-label="Riftbound Vendetta — explore every revealed card"
      className="group block h-8 overflow-hidden bg-brand-500 text-ink-950 transition-colors hover:bg-brand-400"
    >
      {/* Track: two identical halves; animate-marquee slides one half-width and loops
          seamlessly. Pauses on hover and for reduced-motion users. */}
      <div className="flex h-8 w-max animate-marquee items-center whitespace-nowrap text-xs font-bold [animation-play-state:running] group-hover:[animation-play-state:paused] motion-reduce:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:justify-center">
        <Segment />
        <Segment />
      </div>
    </Link>
  );
}
