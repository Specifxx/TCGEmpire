import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// "The website is way too small for phone" — the SECOND cause, found after the
// RegionToggle fix did not clear it (2026-09-22).
//
// /au measured 608px wide at a 390px viewport. The blog-teaser hero images sat
// in normal flow at their INTRINSIC width (600px / 744px) instead of filling
// their `aspect-[1.91/1]` box: a percentage width resolves against the nearest
// block box, and the box's real child is a wrapper with no width of its own
// (`<picture>` is display:inline; next/image's own span likewise), so there was
// nothing definite to resolve against.
//
// Chrome for Android answers content wider than the viewport by widening the
// LAYOUT viewport to fit and scaling the page down — window.innerWidth read 608,
// not 390 — then persists that zoom per site, so every page looks shrunken
// afterwards.
//
// IT IS INTERMITTENT, roughly one load in three, and only at devicePixelRatio 2
// — which is why a desktop browser resized to 390px never shows it and why the
// first round of measurements on / and /browse came back clean. Verified by
// reproducing the 608px state and applying exactly this fix in a live page:
// 608 → 390.
//
// The invariant: an image inside a fixed-aspect box must be OUT OF FLOW. A
// width utility can fail to resolve; `position: absolute` cannot contribute to
// an ancestor's width under any srcset, DPR or CSS-timing condition.
// ─────────────────────────────────────────────────────────────────────────────

test("the homepage blog teaser's hero fills its aspect box instead of sizing itself", () => {
  const src = codeOnly(read("src/components/home/LatestPosts.tsx"));
  const at = src.indexOf("aspect-[1.91/1]");
  assert.ok(at >= 0, "expected the fixed-aspect hero box");
  const block = src.slice(at, at + 700);
  // next/image's `fill` IS position:absolute;inset:0 — the idiomatic way to say
  // "out of flow, cover the box".
  assert.match(block, /\bfill\b/, "the hero must use next/image `fill`, not intrinsic width/height");
  assert.ok(
    !/width=\{600\}/.test(block) && !/height=\{314\}/.test(block),
    "intrinsic width/height is exactly what let the image lay out at 600px on a 390px phone",
  );
});

test("the article grid's hero positions its <picture> wrapper, not just the <img>", () => {
  const src = codeOnly(read("src/components/FilterableArticles.tsx"));
  const at = src.indexOf("aspect-[1.91/1]");
  assert.ok(at >= 0);
  const block = src.slice(at, at + 800);
  // Picture renders <picture><img/></picture>; the PICTURE is the box's child,
  // so styling only the img leaves an unstyled inline wrapper in between.
  assert.match(block, /wrapperClassName="[^"]*absolute inset-0/, "the <picture> wrapper must be the thing taken out of flow");
});

test("Picture still forwards wrapperClassName to the <picture> element", () => {
  // The fix above is worthless if this prop stops reaching the element.
  const src = codeOnly(read("src/components/Picture.tsx"));
  assert.match(src, /<picture className=\{wrapperClassName\}>/);
});
