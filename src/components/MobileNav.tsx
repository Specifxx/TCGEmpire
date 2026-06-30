"use client";

import { useMegaMenu } from "./MegaMenuProvider";

// The phone menu trigger (shown below the lg breakpoint): a hamburger that opens
// the full-screen cinematic nav overlay (CinematicNavMenu), matching DexCompare's
// "tap → it pops up" phone experience. The overlay itself carries the grouped
// links + search; this is just the button that opens it.
export function MobileNav() {
  const { setOpen } = useMegaMenu();
  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-ink-800 lg:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}
