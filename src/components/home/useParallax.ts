"use client";

import { useEffect, useRef } from "react";

// Cinematic-hero parallax. Writes three CSS custom properties on the hero root —
// --px/--py (pointer offset from centre, -1..1) and --sy (scroll progress through
// the hero, 0..1) — which the .parallax-* classes in globals.css turn into GPU
// transforms. We never touch layout properties, so there is no reflow.
//
// Fully degradation-safe: bails out (writing nothing) when there is no window or
// the user prefers reduced motion, so the server/no-JS/reduced-motion render keeps
// the static state baked into the CSS var fallbacks (var(--*, 0) = flat).
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let px = 0;
    let py = 0;
    let sy = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      el.style.setProperty("--sy", sy.toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      sy = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      schedule();
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      py = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      schedule();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
