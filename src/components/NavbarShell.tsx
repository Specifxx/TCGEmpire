"use client";

import { useEffect, useState, type ReactNode } from "react";

// Dynamic header chrome: the navbar floats transparently over the page at the top
// (so it blends into the cinematic hero) and fades into a frosted, blurred bar once
// the user scrolls. Keeps the navbar's contents (server-rendered) untouched — only
// the surrounding <header>'s look reacts to scroll. rAF-throttled, listener cleaned
// up on unmount.
export function NavbarShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 8);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled
          ? "border-ink-800/80 bg-ink-950/70 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          : "border-transparent bg-ink-950/30 backdrop-blur-sm"
      }`}
    >
      {children}
    </header>
  );
}
