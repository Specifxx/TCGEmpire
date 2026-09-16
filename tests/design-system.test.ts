import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DURATION, EASING, Z } from "../src/lib/motion-tokens";
import tailwindConfig from "../tailwind.config";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// P0 — motion tokens, ui/ primitives, dead-code removal. Grows through every
// later phase of the UI polish pass rather than spawning a new file per phase,
// so "does the design system still hold together" stays answerable in one run.
// ─────────────────────────────────────────────────────────────────────────────

test("tailwind's motion/z-index tokens equal src/lib/motion-tokens.ts", () => {
  const extend = tailwindConfig.theme?.extend as Record<string, unknown>;
  const duration = extend.transitionDuration as Record<string, string>;
  assert.equal(duration.fast, `${DURATION.fast}ms`);
  assert.equal(duration.base, `${DURATION.base}ms`);
  assert.equal(duration.slow, `${DURATION.slow}ms`);
  assert.equal(duration.page, `${DURATION.page}ms`);

  const timing = extend.transitionTimingFunction as Record<string, string>;
  assert.equal(timing.out, EASING.out);
  assert.equal(timing["in-out"], EASING.inOut);
  assert.equal(timing.DEFAULT, EASING.out, "overriding the DEFAULT curve is safe only because it was the whole point — see tailwind.config.ts's comment");

  const zIndex = extend.zIndex as Record<string, string>;
  for (const [name, value] of Object.entries(Z)) {
    assert.equal(zIndex[name], String(value), `zIndex.${name} must match Z.${name}`);
  }
});

test("src/lib/motion.ts exports the shared presence/reduced-motion primitives", () => {
  const code = readCode("src/lib/motion.ts");
  assert.match(code, /export function usePresence/);
  assert.match(code, /export function useReducedMotion/);
  assert.match(code, /export function prefersReducedMotion/);
});

test("the reduced-motion @media block is the LAST rule in globals.css", () => {
  const css = read("src/app/globals.css");
  const lastReducedMotion = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(lastReducedMotion > -1, "expected the reduced-motion block to exist");
  // Nothing meaningful (a new ruleset) may follow it — only whitespace/comments
  // are tolerated after its closing brace.
  const closeBrace = css.indexOf("\n}", lastReducedMotion);
  const tail = css.slice(closeBrace + 2).replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.equal(tail, "", "the reduced-motion block must stay the LAST rule in globals.css — anything animated must be declared before it");
});

test("ui/Dialog.tsx hidden states use motion-safe:, never a bare opacity-0", () => {
  const code = readCode("src/components/ui/Dialog.tsx");
  assert.doesNotMatch(code, /(?<!motion-safe:)(?<!sm:motion-safe:)\bopacity-0\b/, "every hidden-state opacity-0 must be motion-safe: (or a responsive motion-safe: variant)");
  assert.match(code, /motion-safe:opacity-0/);
});

test("dead CSS classes removed in the P0 pass are gone from globals.css", () => {
  const css = read("src/app/globals.css");
  for (const cls of [".hero-dots", ".brand-shimmer", ".cta-shine", ".parallax-art", ".parallax-aurora", ".hero-vignette", ".proxy-grid", ".proxy-card"]) {
    assert.ok(!css.includes(`${cls} {`) && !css.includes(`${cls} `.trimEnd() + "\n"), `${cls} should have been deleted, not just orphaned`);
  }
  // .lift the CLASS (not the English word, which still appears in prose).
  assert.doesNotMatch(css, /^\s*\.lift\s*\{/m);
});

test("the dead blob/glow-pulse keyframes and animations left tailwind.config.ts", () => {
  const src = readCode("tailwind.config.ts");
  assert.doesNotMatch(src, /\bblob:\s*\{/);
  assert.doesNotMatch(src, /"glow-pulse":\s*\{/);
});

test("useParallax.ts is gone; ParallaxRoot is a plain (non-client) wrapper that still carries id/className", () => {
  assert.throws(() => read("src/components/home/useParallax.ts"), "useParallax.ts should have been deleted — its only CSS consumers (.parallax-art/.parallax-aurora) are dead");
  const code = readCode("src/components/home/ParallaxRoot.tsx");
  assert.doesNotMatch(code, /"use client"/, "ParallaxRoot has no hooks left and doesn't need a client boundary");
  assert.match(code, /id\?:\s*string/);
  assert.match(code, /className\?:\s*string/);
});

test("Reveal.tsx's reduced-motion check stays a SYNCHRONOUS pre-paint read, not the useReducedMotion hook", () => {
  const code = readCode("src/components/Reveal.tsx");
  assert.match(code, /prefersReducedMotion\(\)/, "must use the synchronous function");
  assert.doesNotMatch(code, /useReducedMotion\(\)/, "the hook would hydrate false then flip a frame later — exactly the flash this component exists to avoid");
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — icons everywhere. nav-groups.ts's 57 `emoji:` fields (one per
// NavGroupLink) are gone; the collapsed rail's drawn-icon language now covers
// every group-level heading across SideNav, CinematicNavMenu and
// CommandLauncher. tests/sidenav.test.ts and tests/nav-icon.test.ts own the
// renderer-level assertions; this file owns the cross-cutting ones.
// ─────────────────────────────────────────────────────────────────────────────

test("NavGroupLink carries no emoji field — nav-groups.ts is icon-key-only data", () => {
  const src = readCode("src/components/nav-groups.ts");
  assert.doesNotMatch(src, /emoji/, "the emoji field left both the interface and every entry");
});

test("every NavIconName union member is actually drawn", () => {
  const src = read("src/components/NavIcon.tsx");
  const names = [...src.matchAll(/^\s+\| "(\w+)"/gm)].map((m) => m[1]);
  assert.ok(names.length > 0, "expected to find NavIconName union members");
  const drawn = new Set([...src.matchAll(/^  (\w+): \(/gm)].map((m) => m[1]));
  for (const name of names) {
    assert.ok(drawn.has(name), `NavIconName "${name}" has no drawing in the ICONS record`);
  }
});

test("the dead NavMenu.tsx renderer is gone", () => {
  assert.throws(() => read("src/components/NavMenu.tsx"), "NavMenu.tsx had zero importers and read the now-deleted l.emoji field");
});

test("no component outside ui/ and the three corner nudges hand-rolls the double-rAF entrance", () => {
  const nudgeFiles = new Set(["SignupPromoPopup.tsx", "PremiumSlideIn.tsx", "AnnualSwitchNudge.tsx"]);
  const dir = join(process.cwd(), "src/components");
  const offenders: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".tsx") || nudgeFiles.has(entry)) continue;
    const code = readCode(join("src/components", entry));
    if (/requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(code)) offenders.push(entry);
  }
  assert.deepEqual(offenders, [], "new overlay/animation code should use usePresence() from @/lib/motion instead of hand-rolling the double-rAF trick");
});
