"use client";

import { useEffect, useRef, useState } from "react";

// Animated number that counts up to `value` the first time it scrolls into view.
// Renders a localised integer. Degrades gracefully: if the user prefers reduced
// motion (or the value is non-positive), it shows the final number immediately.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // SSR + pre-hydration render the REAL value, so crawlers and no-JS visitors see
  // the true number (e.g. "287 cards") — not a "0" that only fills in after JS,
  // which read as thin content. The count-up animation runs on the client only.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) {
      setDisplay(value);
      return;
    }
    // Client-only: start the count-up from 0 (server already showed the real value).
    setDisplay(0);

    let raf = 0;
    const run = () => {
      const duration = 1100;
      let start: number | null = null;
      const step = (t: number) => {
        if (start === null) start = t;
        const p = Math.min((t - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setDisplay(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}
    </span>
  );
}
