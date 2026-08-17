"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Wraps the header's DESKTOP search box (the `lg:block` row in Navbar.tsx —
// NOT the mobile full-width row, which is untouched and always visible) so it
// stays hidden until the visitor scrolls, but ONLY on the homepage.
//
// Why: the homepage-redesign brief calls for "the search box is the hero" —
// large, high-contrast, the one dominant element in the first screen. The
// header already renders its own, smaller SearchBar in the same row on every
// route (it has to — most routes have no hero search of their own). On "/"
// specifically, showing BOTH at once during the first screen is exactly the
// "duplicate search box above the fold" the brief calls out as a defect, even
// though the two boxes serve different scroll states. Once the visitor
// scrolls past the hero, the header search reappears — at that point it's no
// longer a duplicate, it's the only search box left on screen.
//
// Every OTHER route has no hero search, so the header box is the only one on
// the page and must never be hidden there — this component is a no-op
// (`scrolled` starts and stays `true`) whenever `pathname !== "/"`.
//
// display:none via Tailwind's `hidden` class, never an unmount: the field
// stays in the DOM at all times (crawlers, and any assistive tech that reads
// the DOM ahead of a scroll event, can still find it) — only its visual
// presentation is gated on scroll position. Reuses the same >8px threshold
// NavbarShell already uses for its own frosted-background transition, so the
// header search reappearing reads as part of the same "you've scrolled"
// moment rather than a second, independently-timed effect.
export function HeaderSearchSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  // Non-home routes start (and stay) revealed — no flash, since usePathname()
  // already resolves correctly on the very first server-rendered pass.
  const [scrolled, setScrolled] = useState(!isHome);

  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
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
  }, [isHome]);

  return <div className={`hidden flex-1 ${scrolled ? "lg:block" : ""}`}>{children}</div>;
}
