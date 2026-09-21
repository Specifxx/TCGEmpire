import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// THE HEADER'S CARD SEARCH IS ALWAYS VISIBLE. Owner, 2026-09-21: "search for
// cards should be longer/wider, and should always be visible."
//
// This file used to pin the MECHANISM of a homepage-only scroll gate:
// HeaderSearchSlot hid the desktop search row until CinematicHero's #rc-hero
// left the viewport, watched with an IntersectionObserver because the earlier
// `window.scrollY > 8` proxy went stale across a resize — a foldable phone
// unfolding mid-session crossed the `lg` breakpoint, hid the mobile row
// (`lg:hidden`, immediate) while `scrolled` was still false (so no `lg:block`
// on the desktop row), and left NO search box on screen at all.
//
// The gate is gone, so its mechanism has nothing left to pin. The bug it
// caused is still worth a test, and now has a far stronger form: with no
// conditional visibility anywhere in the component, there is no state — stale
// or otherwise — that can hide a search row. These tests assert that absence,
// so re-adding a gate without re-reading the reasoning above fails here.
// ─────────────────────────────────────────────────────────────────────────────

test("HeaderSearchSlot hides its row under no condition at all", () => {
  const code = codeOnly(read("src/components/HeaderSearchSlot.tsx"));
  assert.doesNotMatch(code, /\bhidden\b/, "no `hidden` class — that is what made the box disappear");
  assert.doesNotMatch(code, /useState|useEffect/, "no visibility state: stale state across a resize was the original bug");
  assert.doesNotMatch(code, /IntersectionObserver/, "the hero observer drove the gate; the gate is gone");
  assert.doesNotMatch(code, /window\.scrollY|addEventListener\("scroll"/, "a scroll threshold must never come back");
  assert.doesNotMatch(code, /usePathname/, "visibility must not depend on the route either — the homepage was the gated one");
});

test("both header rows still go through HeaderSearchSlot", () => {
  // The component is the one place the always-visible rule is written down.
  // Bypassing it at a call site would put the rule back in two places.
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  assert.match(nav, /<HeaderSearchSlot>/, "the desktop row");
  assert.match(nav, /<HeaderSearchSlot mobile>/, "the phone row");
});

test("the desktop card search is wide, not the old max-w-sm", () => {
  const search = codeOnly(read("src/components/SearchBar.tsx"));
  assert.match(search, /isHero \? "mx-auto w-full max-w-2xl" : "w-full max-w-xl"/, "the nav variant fills the slack the left cluster has");
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  assert.match(nav, /className="input w-full max-w-xl"/, "the Suspense fallback must be the same width, or the row jumps on hydration");
});

test("the hero CinematicHero still carries the #rc-hero marker", () => {
  // No longer used by HeaderSearchSlot, but FeedbackWidget watches the same id
  // for its own "don't compete with the hero search" check.
  const code = codeOnly(read("src/components/home/CinematicHero.tsx"));
  assert.match(code, /id="rc-hero"/);
  assert.match(codeOnly(read("src/components/FeedbackWidget.tsx")), /rc-hero/, "the marker's remaining consumer");
});
