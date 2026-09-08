import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Reported (foldable phone): "when I open the fold, the search bar kinda goes
// off" — on the homepage, unfolding mid-session could leave BOTH the header's
// mobile search row and its desktop search row hidden at once, with nothing
// left on screen to search from.
//
// Root cause: HeaderSearchSlot used to gate the header's own (smaller) search
// copy behind `window.scrollY > 8`, as a cheap proxy for "the hero — which has
// its own, much bigger search box — has scrolled out of view". That proxy only
// holds if the layout doesn't change underneath it. A foldable unfolding mid-
// session resizes the viewport across the `lg` breakpoint, which reflows the
// hero (its height AND copy both change there — see CinematicHero) without
// necessarily changing window.scrollY at all. The mobile search row is hidden
// purely by a `lg:hidden` parent (breakpoint-driven, immediate); the desktop
// row only reveals once `scrolled` flips true (scroll-driven, stale after a
// resize) — so a resize that crosses `lg` while scrollY is still small can
// leave neither row showing.
// ─────────────────────────────────────────────────────────────────────────────

test("HeaderSearchSlot tracks the hero's actual visibility (IntersectionObserver), not a scrollY threshold", () => {
  const code = codeOnly(read("src/components/HeaderSearchSlot.tsx"));
  assert.match(code, /document\.getElementById\("rc-hero"\)/, "must watch the hero by its stable marker id");
  assert.match(code, /new IntersectionObserver\(/, "must use IntersectionObserver, not a scroll listener");
  assert.doesNotMatch(code, /window\.scrollY/, "a scrollY threshold is exactly the stale-across-resize bug — must not come back");
  assert.doesNotMatch(code, /addEventListener\("scroll"/, "no scroll listener — the observer replaces it entirely");
});

test("HeaderSearchSlot fails toward a VISIBLE header search, never a silently hidden one", () => {
  const code = codeOnly(read("src/components/HeaderSearchSlot.tsx"));
  const fnStart = code.indexOf("export function HeaderSearchSlot");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);
  // Non-home routes: revealed immediately and permanently.
  assert.match(fn, /if \(!isHome\) \{\s*setScrolled\(true\);\s*return;\s*\}/);
  // Home route, but no hero element / no observer support (old browser): still
  // reveal rather than leave the header with no search box at all.
  assert.match(
    fn,
    /if \(!hero \|\| typeof IntersectionObserver === "undefined"\) \{\s*setScrolled\(true\);\s*return;\s*\}/
  );
});

test("the hero CinematicHero renders still carries the #rc-hero marker HeaderSearchSlot depends on", () => {
  const code = codeOnly(read("src/components/home/CinematicHero.tsx"));
  assert.match(code, /id="rc-hero"/, "HeaderSearchSlot's IntersectionObserver silently no-ops if this id ever moves/is removed");
});

test("the mobile search row is still unconditional (never re-coupled to `scrolled`)", () => {
  // The 2026-08-17 revert this file's own doc comment describes: gating the
  // mobile row the same way as the desktop row left the mobile homepage header
  // looking empty pre-scroll. The resize fix must not quietly re-introduce that.
  const code = codeOnly(read("src/components/HeaderSearchSlot.tsx"));
  assert.match(code, /mobile \? "block" : /, "the mobile row must stay unconditionally visible, independent of `scrolled`");
});
