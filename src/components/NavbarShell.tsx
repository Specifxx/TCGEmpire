"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Dynamic header chrome: the navbar floats transparently over the page at the top
// (so it blends into the cinematic hero) and fades into a frosted, blurred bar once
// the user scrolls. Keeps the navbar's contents (server-rendered) untouched — only
// the surrounding <header>'s look reacts to scroll.
//
// Reported directly, alongside the bottom bar's own scroll glitches on a Z Fold 7:
// "at the very top when you scroll it should be there and not disappear… It needs
// to always sit there." `position: sticky; top: 0` on its own should never make a
// header vanish — the TOP edge of the viewport doesn't move when a mobile browser's
// chrome collapses (only the bottom edge does, which is the whole reason the bottom
// bar needed its own fix; see BottomTabBar.tsx). No ancestor of this element sets a
// `transform`/`filter`/`will-change`, either — any of those would create a new
// containing block and break `sticky`'s reference to the real viewport, and none is
// present here.
//
// So this was very likely a SYMPTOM, not its own bug: the ORIGINAL --chrome-lift
// implementation forced a global CSS style recalculation on every one of the
// browser's OWN continuous dvh/lvh recalculations while its chrome animated —
// exactly the frames this header is also sticky-repositioning and (before this
// change) re-rendering through React on. Two expensive operations landing on the
// same frames a lower-powered device is already spending on its own chrome
// animation is a plausible way to drop a frame and have a sticky element visibly
// flash out of existence for one. --chrome-lift's mechanism was replaced with a
// measured, rAF-throttled one (see BottomTabBar.tsx's useChromeLift) that no
// longer forces that global invalidation.
//
// This file's own, independent half of the same belt-and-braces fix: `scrolled`
// used to be React state, so the ONE scroll-position threshold this header cares
// about (`window.scrollY > 8`) triggered a component re-render — reconciliation,
// a new class string, a DOM class-list diff — on top of whatever the browser was
// already doing to its own chrome that frame. It is now a ref + a direct
// `classList` write: the exact same visual behaviour (same classes, same
// threshold, same CSS transition), with zero React render cost tied to scroll at
// all. A one-time boundary crossing was never going to be expensive on its own;
// removing it anyway costs nothing and directly answers "always sit there".
// The shadow's value lives in --shadow-header (globals.css), so the light theme
// gets a soft lift instead of the dark theme's 30px black drop.
const SCROLLED = ["border-ink-800/80", "bg-ink-950/70", "shadow-header", "backdrop-blur-xl"];
const AT_TOP = ["border-transparent", "bg-ink-950/30", "backdrop-blur-sm"];

export function NavbarShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    // Neither state starts applied by the className below, so the first call
    // always has something to add/remove — no missed initial paint.
    let scrolled: boolean | null = null;
    function apply() {
      raf = 0;
      const next = window.scrollY > 8;
      if (next === scrolled) return; // the common case: nothing crossed the threshold
      scrolled = next;
      el!.classList.remove(...(next ? AT_TOP : SCROLLED));
      el!.classList.add(...(next ? SCROLLED : AT_TOP));
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(apply);
    }
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // pl-[var(--sidenav-w)]: SideNav runs the FULL page height now (it used to
  // start below this header), so from lg up the header's own content has to
  // begin where the rail ends or the rail would sit on top of it. 0 below lg,
  // where SideNav isn't rendered — globals.css owns that breakpoint decision
  // for every consumer of the custom property.
  //
  // The header keeps its own z-header (40); the RAIL was raised above it
  // instead (Z.rail, src/lib/motion-tokens.ts), so page-level dropdowns that
  // sit at z-30/z-50 keep the exact relationship to this header they had
  // before.
  return (
    <header
      ref={ref}
      className={`sticky top-0 z-header border-b pl-[var(--sidenav-w)] transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${AT_TOP.join(
        " "
      )}`}
    >
      {children}
    </header>
  );
}
