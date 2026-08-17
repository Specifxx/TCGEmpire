"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Wraps EITHER of the header's two search rows (the `lg:block` desktop row
// inline in the main bar, or the full-width `lg:hidden` row underneath it —
// pass `mobile` for the latter) so it stays hidden until the visitor scrolls,
// but ONLY on the homepage.
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
// The mobile row WAS deliberately left un-gated by an earlier pass ("keep it
// always present on mobile" — the master brief's own line about the header
// search under "Keep in the header"). Re-examined for this phase's audit
// script: that line was written to keep search reachable without a scroll on
// phones — but on THIS codebase's homepage, the hero already renders its own
// full-size search box immediately below the header on every viewport,
// mobile included (autoFocusDesktop is desktop-only, but the box itself is
// not). So on "/" specifically, "always present" bought nothing a visitor
// couldn't already do one tap below it, at the cost of a real, measured
// duplicate-search-box-above-the-fold on a real 390×844 screenshot — exactly
// what the brief's own Hard Targets table separately requires to be zero,
// with no mobile/desktop carve-out written there. Gating the mobile row the
// same way desktop's already is resolves that conflict in the hard target's
// favour without dropping the field from the page: it is still rendered
// unconditionally (see the `hidden` note below), still the very first search
// box below the header for a visitor who scrolls even slightly, and the
// hero's own box is right there, immediately, for anyone who lands and wants
// to search before scrolling at all. Every route other than "/" is completely
// unaffected — `mobile` only ever changes anything when `isHome` is also
// true. See DECISIONS.md's audit-script phase entry for the fuller reasoning
// and the two alternatives this route was chosen over.
//
// display:none via Tailwind's `hidden` class, never an unmount: the field
// stays in the DOM at all times (crawlers, and any assistive tech that reads
// the DOM ahead of a scroll event, can still find it) — only its visual
// presentation is gated on scroll position. Reuses the same >8px threshold
// NavbarShell already uses for its own frosted-background transition, so the
// header search reappearing reads as part of the same "you've scrolled"
// moment rather than a second, independently-timed effect.
export function HeaderSearchSlot({ children, mobile = false }: { children: ReactNode; mobile?: boolean }) {
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

  // The mobile row's own parent (`<div className="pb-3 lg:hidden">` in
  // Navbar.tsx) already restricts it to <lg widths, so this variant just
  // toggles hidden/block with no breakpoint prefix — adding `lg:` here would
  // be a no-op at best and a footgun at worst if that parent's breakpoint
  // ever changes independently of this one.
  return <div className={mobile ? (scrolled ? "block" : "hidden") : `hidden flex-1 ${scrolled ? "lg:block" : ""}`}>{children}</div>;
}
