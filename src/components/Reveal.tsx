"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Run the setup as a layout effect on the client (so the hidden state is applied
// before paint — no flash of the final state) while falling back to a normal
// effect on the server to avoid the SSR useLayoutEffect warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Reveal-on-scroll wrapper that works in every browser (IntersectionObserver).
//
// SEO / no-JS safe: the children are rendered visible in the server HTML. The
// hidden→shown classes are only ever added by client JS, and only when the user
// has NOT requested reduced motion — so search crawlers and no-JS visitors always
// see the content, and motion-sensitive users get no movement.
//
//  - stagger: cascade the DIRECT children in instead of the block as a whole.
//  - delayMs: delay a whole-block reveal (ignored when `stagger`).
//  - once:    reveal a single time (default) vs. re-hide when scrolled away.
export function Reveal({
  children,
  className,
  stagger = false,
  delayMs = 0,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  delayMs?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return; // leave content visible

    // Hide before paint so the reveal animates from the hidden state.
    el.classList.add(stagger ? "reveal-stagger" : "reveal-init");
    if (delayMs) el.style.setProperty("--reveal-delay", `${delayMs}ms`);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("reveal-in");
            if (once) io.disconnect();
          } else if (!once) {
            el.classList.remove("reveal-in");
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger, delayMs, once]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
