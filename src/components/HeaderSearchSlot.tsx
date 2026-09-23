"use client";

import type { ReactNode } from "react";

// Wraps EITHER of the header's two search rows (the `xl:block` desktop row
// inline in the main bar, or the full-width `xl:hidden` row underneath it —
// pass `mobile` for the latter). The full-width row serves 1024-1279 too, not
// just phones and tablets: from 1024 the side rail left the inline slot too
// narrow to use (2026-09-23, see Navbar.tsx).
//
// IT NO LONGER HIDES ANYTHING, and that is the whole current behaviour:
// the header's card search is visible on every route, at every scroll
// position, on both rows. Explicit owner instruction, 2026-09-21: "search for
// cards should be longer/wider, and should always be visible."
//
// WHAT USED TO BE HERE, so nobody reinstates it by accident. On "/" alone this
// component hid the desktop row until CinematicHero's #rc-hero scrolled out of
// view (an IntersectionObserver — itself a fix for a scrollY threshold that
// went stale when a foldable phone unfolded mid-session and left BOTH rows
// hidden at once). The reason was the homepage-redesign brief's "the search
// box is the hero": the hero renders its own, much larger search box, so
// showing the smaller header copy above it during the first screen was a
// duplicate search box above the fold.
//
// That trade is off. The sidebar rail now owns the homepage's left edge and
// the rail's own box searches FEATURES, not cards (SideNav.tsx), so the header
// box is the only card search in the chrome — and a search box that is present
// on every other route but missing on the one page most visitors land on first
// reads as a bug, not as restraint. The hero box stays; at every width the two
// are simply both on screen, one in the chrome and one in the hero.
//
// The component is kept (rather than inlined away) because both call sites and
// several tests reference it by name, and because it is the single place to
// put this rule back if the duplicate ever proves costly. `mobile` no longer
// changes anything either; it is retained for the same reason.
//
// The IntersectionObserver is gone with the gate, so #rc-hero is no longer
// load-bearing HERE — FeedbackWidget still watches it, so the marker stays.
export function HeaderSearchSlot({ children, mobile = false }: { children: ReactNode; mobile?: boolean }) {
  void mobile;
  return <div className="block w-full min-w-0">{children}</div>;
}
