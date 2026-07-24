import Link from "next/link";

// Full-bleed announcement ribbon attached under the navbar (reads as a header
// extension). Logo-green, FIXED single-line height on every screen — the message
// scrolls as a seamless ticker (a "sliding window"), so it never wraps to multiple
// rows on mobile, and the terminal-style motion fits the brand.
//
// Vendetta singles started trading a few days ahead of the 31 Jul 2026 official
// street date (Pre-Rift launch events + early marketplace listings), so this is a
// plain static "it's here" banner now — no countdown/date logic needed.
const MESSAGE = "Riftbound: Vendetta is here — shop singles & sealed now";

export function VendettaRibbon() {
  // One ticker segment (repeated to fill any width). Two identical halves make the
  // marquee loop seamless (see the keyframe: slide exactly -50%).
  const Segment = () => (
    <span className="flex shrink-0 items-center gap-8 pr-8" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="rounded bg-ink-950/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
            New set
          </span>
          <span>{MESSAGE}</span>
          <span className="opacity-60">→</span>
        </span>
      ))}
    </span>
  );

  return (
    <Link
      href="/sets/vendetta"
      aria-label="Riftbound Vendetta — shop every revealed card"
      // Calm green → Fury red — Vendetta's own rivalry-domain palette.
      className="group block h-8 overflow-hidden bg-gradient-to-r from-[#1ea65c] to-[#e5484d] text-ink-950 transition-[filter] hover:brightness-110"
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
