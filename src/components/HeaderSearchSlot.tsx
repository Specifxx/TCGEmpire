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
// The mobile row is ALWAYS visible, never scroll-gated — reverted 2026-08-17.
// A prior pass gated it the same as the desktop row (below), reasoning that
// the hero's own full-size search box sits immediately below the header on
// every viewport, so hiding the smaller header copy pre-scroll cost a visitor
// nothing on paper. In practice, that made the entire mobile homepage header
// read as empty before the first scroll: the mobile viewport has no space for
// the desktop nav's other links (they're all `md:`/`lg:` and up — see
// Navbar.tsx), so the search field was the only thing HomeHeaderReveal-style
// gating could actually remove from a phone screen, and removing it left just
// a bare logo, "Database" and the hamburger. Explicit product call: a visibly
// present header beats one extra duplicate-search-box audit point. The
// desktop row below keeps the scroll gate — desktop has plenty else in the
// header pre-scroll (Premium, the logo, Database), so it doesn't read as
// empty the same way.
//
// display:none via Tailwind's `hidden` class, never an unmount: the field
// stays in the DOM at all times (crawlers, and any assistive tech that reads
// the DOM ahead of a scroll event, can still find it) — only its visual
// presentation is gated on whether the hero (with its own search box) is
// still in view. NavbarShell's independent >8px scrollY check drives the
// header's OWN frosted-background transition and fires much earlier than
// this — the two were briefly on the same threshold, but that made this
// component reveal the header's search copy while the hero's own (far
// taller) search box was still fully on screen, the exact duplicate the
// scroll-gate exists to prevent. See the effect below for why this now
// tracks the hero's actual visibility instead.
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
    // Same marker + technique as FeedbackWidget's own "don't compete with the
    // hero search" check (see that file): an IntersectionObserver on
    // CinematicHero's #rc-hero, NOT a scrollY threshold (the previous
    // approach here). A scrollY threshold goes stale across a viewport
    // RESIZE: a foldable phone unfolding mid-session reflows the whole page
    // (the hero's own height/copy both change at the `lg` breakpoint), which
    // can move the hero out of view without window.scrollY changing at all.
    // Left unfixed, that left `scrolled` false (as if the hero were still
    // in view) right as the wide layout kicked in — hiding the mobile row
    // (its `lg:hidden` parent) *and* the desktop row (`scrolled` still
    // false, so no `lg:block` override) at once: the header search box had
    // no visible copy anywhere on screen. IntersectionObserver has no such
    // gap — it re-fires on any layout change that moves the hero relative
    // to the viewport, a resize included, not only on scroll.
    const hero = document.getElementById("rc-hero");
    if (!hero || typeof IntersectionObserver === "undefined") {
      // No hero to watch (shouldn't happen on "/") or no observer support:
      // fail toward a VISIBLE header search rather than a silently hidden one.
      setScrolled(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setScrolled(!(entries[0]?.isIntersecting ?? false)));
    io.observe(hero);
    return () => io.disconnect();
  }, [isHome]);

  // mobile: always "block", ignoring `scrolled` entirely — see the doc
  // comment above. The mobile row's own parent (`<div className="pb-3
  // lg:hidden">` in Navbar.tsx) already restricts it to <lg widths, so no
  // breakpoint prefix is needed here either way.
  return <div className={mobile ? "block" : `hidden flex-1 ${scrolled ? "lg:block" : ""}`}>{children}</div>;
}
