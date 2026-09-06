"use client";

import type { ReactNode } from "react";
import { useParallax } from "./useParallax";

// Thin client wrapper so CinematicHero can stay a server component: it owns the
// hero <section> element and attaches the parallax hook, while the (server-rendered)
// hero content is passed through as children.
export function ParallaxRoot({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const ref = useParallax<HTMLElement>();
  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}
